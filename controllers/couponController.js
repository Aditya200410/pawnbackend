const Coupon = require('../models/coupon');

/**
 * Get all coupons
 */
exports.getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort('-createdAt');
    res.json(coupons);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ message: "Error fetching coupons", error: error.message });
  }
};

/**
 * Create new coupon
 */
exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      discountPercentage, // Backwards compatibility for UI
      maxUses,
      minOrderAmount,
      maxDiscount,
      expiryDate,
      isActive
    } = req.body;

    // Determine value and type from possible inputs
    const finalType = discountType || 'percentage';
    const finalValue = Number(discountValue || discountPercentage || 0);

    if (!code || finalValue <= 0 || !expiryDate) {
      return res.status(400).json({ message: "Code, Value, and Expiry are required" });
    }

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    const expiry = new Date(expiryDate);
    expiry.setHours(23, 59, 59, 999); // Inclusive of entire day

    const newCoupon = new Coupon({
      code: code.toUpperCase(),
      discountType: finalType,
      discountValue: finalValue,
      usageLimit: maxUses ? Number(maxUses) : null,
      minPurchase: Number(minOrderAmount || 0),
      maxDiscount: maxDiscount ? Number(maxDiscount) : undefined,
      endDate: expiry,
      isActive: isActive !== undefined ? isActive : true,
      startDate: new Date()
    });

    await newCoupon.save();
    res.status(201).json(newCoupon);
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ message: "Error creating coupon", error: error.message });
  }
};

/**
 * Update coupon
 */
exports.updateCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      discountPercentage,
      maxUses,
      minOrderAmount,
      maxDiscount,
      expiryDate,
      isActive
    } = req.body;

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    if (code && code.toUpperCase() !== coupon.code) {
      const existing = await Coupon.findOne({ code: code.toUpperCase() });
      if (existing) return res.status(400).json({ message: "Code already taken" });
    }

    let expiry = coupon.endDate;
    if (expiryDate) {
      expiry = new Date(expiryDate);
      expiry.setHours(23, 59, 59, 999);
    }

    const updateData = {
      code: code ? code.toUpperCase() : coupon.code,
      discountType: discountType || coupon.discountType,
      discountValue: Number(discountValue || discountPercentage || coupon.discountValue),
      usageLimit: maxUses !== undefined ? Number(maxUses) : coupon.usageLimit,
      minPurchase: minOrderAmount !== undefined ? Number(minOrderAmount) : coupon.minPurchase,
      maxDiscount: maxDiscount !== undefined ? Number(maxDiscount) : coupon.maxDiscount,
      endDate: expiry,
      isActive: isActive !== undefined ? isActive : coupon.isActive
    };

    const updatedCoupon = await Coupon.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updatedCoupon);
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ message: "Error updating coupon", error: error.message });
  }
};

/**
 * Delete coupon
 */
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json({ message: "Coupon deleted successfully" });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ message: "Error deleting coupon" });
  }
};

/**
 * Validate coupon and calculate discounted price (Unified with Razorpay logic)
 */
exports.validateCoupon = async (req, res) => {
  try {
    const { code, cartTotal } = req.body;

    if (!code || !cartTotal) {
      return res.status(200).json({ success: false, message: 'Code and Cart Total are required' });
    }

    const normalizedCode = (code || '').trim().toUpperCase();

    // Exact same query criteria as Razorpay logic
    const coupon = await Coupon.findOne({
      code: normalizedCode,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });

    if (!coupon) {
      return res.status(200).json({ success: false, message: 'Invalid or expired coupon code.' });
    }

    // Check usage
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return res.status(200).json({ success: false, message: 'Coupon usage limit reached.' });
    }

    // Check minimum purchase
    if (Number(cartTotal) < coupon.minPurchase) {
      return res.status(200).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required.`
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (Number(cartTotal) * coupon.discountValue) / 100;
    } else {
      discountAmount = coupon.discountValue; // Fixed INR
    }

    // Cap at max discount
    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
      discountAmount = coupon.maxDiscount;
    }

    const finalPrice = Math.max(0, Number(cartTotal) - discountAmount);

    // Multi-spec compatible response
    res.json({
      success: true,
      data: {
        coupon,
        discountAmount: Math.round(discountAmount * 100) / 100, // Round to 2 decimals
        finalPrice: Math.round(finalPrice * 100) / 100,
        message: `Applied: Saved ₹${discountAmount.toFixed(0)}`
      },
      // Mirror Razorpay 1.5 structure for unified frontend handlers
      promotion: {
        code: coupon.code,
        offer_value: Math.round(discountAmount * 100), // paise
        value_type: coupon.discountType === 'percentage' ? 'percentage' : 'fixed_amount'
      }
    });

  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(200).json({ success: false, message: 'Error processing coupon' });
  }
};

/**
 * Apply coupon (Manual usage tracking)
 */
exports.applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: "Code required" });

    const coupon = await Coupon.findOneAndUpdate(
      { code: code.toUpperCase() },
      { $inc: { usedCount: 1 } },
      { new: true }
    );

    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, message: 'Usage tracked successfully' });
  } catch (error) {
    console.error('Error tracking usage:', error);
    res.status(500).json({ success: false, message: 'Tracking failed' });
  }
};
