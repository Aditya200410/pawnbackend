const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');
const PendingRegistration = require('../models/PendingRegistration');
const Seller = require('../models/Seller');
const Coupon = require('../models/coupon');
const { finalizeOrder } = require('../utils/orderHelper');
const Settings = require('../models/Settings');
require('dotenv').config();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper to get COD upfront amount
const getCodAmount = async () => {
    try {
        const setting = await Settings.findOne({ key: 'cod_upfront_amount' });
        return setting ? Number(setting.value) : 39;
    } catch (error) {
        return 39;
    }
};

/**
 * Create a Razorpay Order for Magic Checkout
 */
exports.createRazorpayOrder = async (req, res) => {
    try {
        const {
            amount, // amount to be paid now (rupees)
            customerName,
            email,
            phone,
            items,
            totalAmount,
            shippingCost,
            codExtraCharge,
            finalTotal,
            paymentMethod,
            upfrontAmount,
            remainingAmount,
            sellerToken,
            agentCode,
            couponCode,
            orderType, // 'product_order' or 'plan_purchase'
            address, // This might be the street address string
            city,
            state,
            pincode,
            country
        } = req.body;

        // For Magic Checkout, we can allow missing customer details as they will be captured in the modal
        // But we provide defaults to satisfy the schema if needed
        const finalCustomerName = customerName || 'Valued Customer';
        const finalEmail = (email && email.trim()) ? email : ' ';
        const rawPhone = phone || '0000000000';

        // Normalize phone to E.164 format for Razorpay
        let formattedPhone = rawPhone.trim();
        // Remove spaces, dashes, etc
        formattedPhone = formattedPhone.replace(/[\s\-\(\)]/g, '');
        if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.length === 10) {
                formattedPhone = '+91' + formattedPhone;
            } else if (formattedPhone.startsWith('91') && formattedPhone.length === 12) {
                formattedPhone = '+' + formattedPhone;
            }
        }

        // Determine payment amount in paise
        // Use finalTotal if available, else use amount, else use totalAmount
        const paymentAmountRupees = finalTotal || amount || totalAmount || 0;
        if (paymentAmountRupees <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid payment amount' });
        }

        const merchantOrderId = (orderType === 'plan_purchase' ? 'PLANREG' : 'MT') + Date.now() + Math.random().toString(36).substr(2, 6);

        // Razorpay Order Options
        const options = {
            amount: Math.round(paymentAmountRupees * 100), // amount in paise
            currency: "INR",
            receipt: merchantOrderId,
            line_items_total: Math.round(paymentAmountRupees * 100), // MANDATORY for Magic Checkout
            line_items: (items || []).map(item => ({
                name: item.name || 'Product',
                quantity: item.quantity || 1,
                price: Math.round((item.price || item.product?.price || 0) * 100),
                offer_price: Math.round((item.price || item.product?.price || 0) * 100),
                sku: item.productId || item.id || 'N/A'
            })),
            notes: {
                customerName: finalCustomerName,
                email: finalEmail,
                phone: formattedPhone,
                sellerToken: sellerToken || '',
                agentCode: agentCode || '',
                orderType: orderType || 'product_order'
            },
            payment: {
                capture: 'automatic',
            },
            customer_details: {
                name: finalCustomerName,
                email: finalEmail,
                contact: formattedPhone,
                billing_address: {
                    line1: address || 'TBD',
                    city: city || 'TBD',
                    state: state || 'TBD',
                    zipcode: pincode || 'TBD',
                    country: 'IN'
                },
                shipping_address: {
                    line1: address || 'TBD',
                    city: city || 'TBD',
                    state: state || 'TBD',
                    zipcode: pincode || 'TBD',
                    country: 'IN'
                }
            }
        };

        const razorpayOrder = await razorpay.orders.create(options);

        // Correctly map address for Mongoose Order schema
        const addressObj = {
            street: address || req.body.street || 'TBD',
            city: city || 'TBD',
            state: state || 'TBD',
            pincode: pincode || 'TBD',
            country: country || 'India'
        };

        // Save Order in DB
        const newOrder = new Order({
            transactionId: razorpayOrder.id,
            customerName: finalCustomerName,
            email: finalEmail,
            phone: formattedPhone,
            address: addressObj,
            items: items || [],
            totalAmount: totalAmount || paymentAmountRupees,
            paymentMethod: paymentMethod || 'online',
            paymentStatus: 'pending',
            orderStatus: 'waiting_payment',
            orderType: orderType || 'product_order',
            upfrontAmount: upfrontAmount || 0,
            remainingAmount: remainingAmount || 0,
            sellerToken: sellerToken || '',
            agentCode: agentCode || '',
            couponCode: couponCode || '',
            merchantTransactionId: merchantOrderId,
        });

        await newOrder.save();

        res.json({
            success: true,
            orderId: razorpayOrder.id,
            merchantOrderId: merchantOrderId,
            amount: razorpayOrder.amount,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Razorpay Order Creation Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate payment',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Verify Razorpay Payment Signature
 */
exports.verifySignature = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature === razorpay_signature) {
            // Payment Verified
            const order = await Order.findOne({ transactionId: razorpay_order_id });
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            if (order.paymentStatus !== 'completed') {
                // Fetch payment details to get address from Magic Checkout
                try {
                    const payment = await razorpay.payments.fetch(razorpay_payment_id);
                    if (payment && payment.notes && (payment.notes.shipping_address || payment.notes.address)) {
                        // Razorpay Magic Checkout often stores address in notes or shipping_address
                        const addrNote = payment.notes.shipping_address || payment.notes.address;
                        if (typeof addrNote === 'string') {
                            order.address.street = addrNote;
                        } else if (typeof addrNote === 'object') {
                            order.address.street = addrNote.line1 || addrNote.street || order.address.street;
                            order.address.city = addrNote.city || order.address.city;
                            order.address.state = addrNote.state || order.address.state;
                            order.address.pincode = addrNote.pincode || addrNote.zipcode || order.address.pincode;
                        }
                    } else if (payment && payment.shipping_address) {
                        const ra = payment.shipping_address;
                        order.address.street = ra.line1 || ra.line2 ? `${ra.line1} ${ra.line2}` : order.address.street;
                        order.address.city = ra.city || order.address.city;
                        order.address.state = ra.state || order.address.state;
                        order.address.pincode = ra.pincode || order.address.pincode;
                    }
                } catch (fetchError) {
                    console.error('Error fetching Razorpay payment details:', fetchError);
                }

                order.paymentStatus = 'completed';
                order.orderStatus = 'processing';
                order.notes = order.notes || {};
                order.notes.razorpay_payment_id = razorpay_payment_id;
                await order.save();

                // Finalize Order (stock, email, etc.)
                await finalizeOrder(order);
            }

            res.json({ success: true, message: 'Payment verified successfully' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid signature' });
        }
    } catch (error) {
        console.error('Razorpay Verification Error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};

/**
 * Magic Checkout: Shipping Info API
 * Razorpay calls this to get shipping options for an address
 */
exports.getShippingInfo = async (req, res) => {
    try {
        // Updated to match 1.4 Interact with Shipping Info API docs
        const { order_id, razorpay_order_id, email, contact, addresses } = req.body;
        console.log('Magic Checkout Shipping Info Request:', { order_id, razorpay_order_id, email, contact, count: addresses?.length });

        const codAmount = await getCodAmount();

        // Map shipping options to EACH address as required by Razorpay
        const updatedAddresses = (addresses || []).map(addr => ({
            ...addr,
            serviceable: true,
            shipping_options: [
                {
                    id: "standard",
                    name: "Standard Shipping",
                    amount: 0,
                    currency: "INR",
                    description: "3-5 business days"
                }
            ],
            cod_available: true,
            cod_fee: codAmount * 100
        }));

        const response = {
            serviceable: true,
            addresses: updatedAddresses
        };

        res.json(response);
    } catch (error) {
        console.error('Magic Checkout Shipping Info Error:', error);
        res.status(500).json({ serviceable: false });
    }
};

/**
 * Magic Checkout: Get Promotions API
 * Returns list of available coupons
 */
exports.getPromotions = async (req, res) => {
    try {
        const activeCoupons = await Coupon.find({
            isActive: true,
            endDate: { $gt: new Date() }
        });

        const promotions = activeCoupons.map(coupon => ({
            code: coupon.code,
            description: coupon.discountType === 'percentage'
                ? `Get ${coupon.discountValue}% off on orders above ₹${coupon.minPurchase}`
                : `Get ₹${coupon.discountValue} off on orders above ₹${coupon.minPurchase}`,
            discount_type: coupon.discountType === 'percentage' ? 'percentage' : 'flat',
            discount_value: coupon.discountType === 'percentage' ? coupon.discountValue : (coupon.discountValue * 100)
        }));

        res.json({ promotions });
    } catch (error) {
        console.error('Magic Checkout Get Promotions Error:', error);
        res.json({ promotions: [] });
    }
};

/**
 * Magic Checkout: Apply Promotion API
 * Validates and applies a coupon
 */
exports.applyPromotion = async (req, res) => {
    try {
        const { code, order_amount } = req.body;
        const coupon = await Coupon.findOne({
            code: code.toUpperCase(),
            isActive: true,
            endDate: { $gt: new Date() }
        });

        if (!coupon) {
            return res.status(400).json({ valid: false, message: 'Invalid or expired coupon' });
        }

        if (order_amount < coupon.minPurchase * 100) { // order_amount is in paise
            return res.status(400).json({
                valid: false,
                message: `Minimum order amount of ₹${coupon.minPurchase} required`
            });
        }

        let discount_amount = 0;
        if (coupon.discountType === 'percentage') {
            discount_amount = Math.round((order_amount * coupon.discountValue) / 100);
        } else {
            discount_amount = coupon.discountValue * 100;
        }

        res.json({
            valid: true,
            discount_amount,
            message: 'Coupon applied successfully'
        });
    } catch (error) {
        console.error('Magic Checkout Apply Promotion Error:', error);
        res.status(500).json({ valid: false, message: 'Internal server error' });
    }
};

/**
 * Get Status of a Razorpay Order
 */
exports.getRazorpayStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findOne({ transactionId: orderId });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        let status = 'pending';
        if (order.paymentStatus === 'completed') status = 'success';
        else if (order.paymentStatus === 'failed') status = 'failed';

        res.json({
            success: true,
            status,
            data: order
        });
    } catch (error) {
        console.error('Razorpay Status Error:', error);
        res.status(500).json({ success: false, message: 'Failed to get status' });
    }
};
