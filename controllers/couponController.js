const Coupon = require('../models/coupon');

// Get all coupons
exports.getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort('-createdAt');
    res.json(coupons);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ message: "Error fetching coupons", error: error.message });
  }
};

// Create new coupon
exports.createCoupon = async (req, res) => {
  try {
    const { code, name, discountPercentage, maxUses, minOrderAmount, expiryDate } = req.body;

    // Validate required fields
    if (!code || !name || !discountPercentage || !maxUses || !minOrderAmount || !expiryDate) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    const newCoupon = new Coupon({
      code: code.toUpperCase(),
      name,
      discountPercentage: Number(discountPercentage),
      maxUses: Number(maxUses),
      minOrderAmount: Number(minOrderAmount),
      expiryDate: new Date(expiryDate)
    });

    await newCoupon.save();
    res.status(201).json(newCoupon);
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ message: "Error creating coupon", error: error.message });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const { code, name, discountPercentage, maxUses, minOrderAmount, expiryDate, isActive } = req.body;
    
    // Check if coupon exists
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    // If code is being changed, check if new code already exists
    if (code && code !== coupon.code) {
      const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
      if (existingCoupon) {
        return res.status(400).json({ message: "Coupon code already exists" });
      }
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      {
        code: code ? code.toUpperCase() : coupon.code,
        name: name || coupon.name,
        discountPercentage: discountPercentage ? Number(discountPercentage) : coupon.discountPercentage,
        maxUses: maxUses ? Number(maxUses) : coupon.maxUses,
        minOrderAmount: minOrderAmount ? Number(minOrderAmount) : coupon.minOrderAmount,
        expiryDate: expiryDate ? new Date(expiryDate) : coupon.expiryDate,
        isActive: isActive !== undefined ? isActive : coupon.isActive
      },
      { new: true }
    );

    res.json(updatedCoupon);
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ message: "Error updating coupon", error: error.message });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    res.json({ message: "Coupon deleted successfully" });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ message: "Error deleting coupon", error: error.message });
  }
};

// Validate coupon
exports.validateCoupon = async (req, res) => {
  try {
    const { code, orderAmount } = req.body;

    if (!code || orderAmount === undefined) {
      return res.status(400).json({ message: "Coupon code and order amount are required" });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
      return res.status(404).json({ message: "Invalid coupon code" });
    }

    // Check if coupon is active
    if (!coupon.isActive) {
      return res.status(400).json({ message: "This coupon is no longer active" });
    }

    // Check if coupon has expired
    if (new Date() > new Date(coupon.expiryDate)) {
      return res.status(400).json({ message: "This coupon has expired" });
    }

    // Check if coupon has reached max uses
    if (coupon.currentUses >= coupon.maxUses) {
      return res.status(400).json({ message: "This coupon has reached its maximum usage limit" });
    }

    // Check minimum order amount
    if (orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({ 
        message: `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}`,
        minOrderAmount: coupon.minOrderAmount
      });
    }

    // Calculate discount amount
    const discountAmount = (orderAmount * coupon.discountPercentage) / 100;

    res.json({
      valid: true,
      discountPercentage: coupon.discountPercentage,
      discountAmount,
      finalAmount: orderAmount - discountAmount
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({ message: "Error validating coupon", error: error.message });
  }
};

// Apply coupon (increment usage count)
exports.applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    // Increment usage count
    coupon.currentUses += 1;
    await coupon.save();

    res.json({ message: "Coupon applied successfully" });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ message: "Error applying coupon", error: error.message });
  }
}; 