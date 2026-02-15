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
                // Fetch payment details to get accurate customer info from Magic Checkout
                try {
                    const payment = await razorpay.payments.fetch(razorpay_payment_id);

                    // 1. Sync Customer Details (Overwrite placeholders with real data)
                    if (payment.email && payment.email.trim()) {
                        order.email = payment.email;
                    }
                    if (payment.contact) {
                        order.phone = payment.contact;
                    }
                    // Capture name from various possible locations in Magic Checkout / Standard payload
                    const capturedName = payment.notes?.customerName ||
                        payment.notes?.name ||
                        payment.notes?.customer_name ||
                        payment.notes?.contact_name ||
                        payment.customer?.name ||
                        payment.customer_details?.name ||
                        payment.billing_address?.name ||
                        payment.shipping_address?.name ||
                        payment.notes?.['shipping_address.name'] ||
                        payment.notes?.['billing_address.name'];

                    if (capturedName &&
                        typeof capturedName === 'string' &&
                        capturedName.trim().length > 0 &&
                        capturedName !== 'Valued Customer' &&
                        capturedName !== 'TBD'
                    ) {
                        console.log('Captured Real Customer Name:', capturedName);
                        order.customerName = capturedName;
                    }

                    // 2. Sync Actual Paid Amount (paise to INR)
                    if (payment.amount) {
                        order.totalAmount = payment.amount / 100;
                    }

                    // 3. Robust Shipping Address Sync
                    const newAddress = { ...order.address };
                    let ra = payment.shipping_address || payment.notes?.shipping_address || payment.notes?.address;

                    // Support for flat fields in notes if address is not a direct object/string
                    if (!ra && payment.notes) {
                        // Priority 1: Flat fields with prefixes
                        const n = payment.notes;
                        const line1 = n.shipping_address_line1 || n.shipping_address_street || n.address_line1 || n.line1 || n.street || n.address || n['shipping_address.line1'];
                        const city = n.shipping_address_city || n.address_city || n.city || n['shipping_address.city'];
                        const state = n.shipping_address_state || n.address_state || n.state || n['shipping_address.state'];
                        const pincode = n.shipping_address_pincode || n.shipping_address_zip || n.address_pincode || n.pincode || n.zipcode || n.zip || n['shipping_address.pincode'];

                        if (line1 || city || state) {
                            ra = {
                                line1,
                                city,
                                state,
                                pincode,
                                country: n.shipping_address_country || n.country || 'India'
                            };
                        }
                    }

                    if (ra) {
                        if (typeof ra === 'string') {
                            const trimmedRa = ra.trim();
                            if (trimmedRa.startsWith('{') || trimmedRa.startsWith('[')) {
                                try {
                                    const parsed = JSON.parse(trimmedRa);
                                    if (parsed && typeof parsed === 'object') ra = parsed;
                                } catch (e) { /* not valid json, use as string */ }
                            }
                        }

                        if (typeof ra === 'string' && ra.trim().length > 0 && ra !== 'TBD') {
                            newAddress.street = ra;
                        } else if (typeof ra === 'object' && ra !== null) {
                            // Extract street/line1
                            const street = ra.line1 || ra.street || (ra.line2 ? `${ra.line1} ${ra.line2}` : null);
                            if (street && street !== 'TBD') newAddress.street = street;

                            // Extract other fields with fallbacks
                            if (ra.city && ra.city !== 'TBD') newAddress.city = ra.city;
                            if (ra.state && ra.state !== 'TBD') newAddress.state = ra.state;
                            if (ra.pincode || ra.zipcode || ra.postal_code || ra.zip) {
                                const pc = ra.pincode || ra.zipcode || ra.postal_code || ra.zip;
                                if (pc !== 'TBD') newAddress.pincode = pc;
                            }
                            if (ra.country || ra.countryCode) {
                                const c = ra.country || ra.countryCode;
                                if (c !== 'TBD') newAddress.country = c;
                            }
                        }
                    } else if (payment.billing_address) {
                        const ba = payment.billing_address;
                        if (ba.line1 && ba.line1 !== 'TBD') newAddress.street = ba.line1 || ba.street;
                        if (ba.city && ba.city !== 'TBD') newAddress.city = ba.city;
                        if (ba.state && ba.state !== 'TBD') newAddress.state = ba.state;
                        if (ba.pincode || ba.zipcode) newAddress.pincode = ba.pincode || ba.zipcode;
                        if (ba.country && ba.country !== 'TBD') newAddress.country = ba.country;
                    }

                    order.address = newAddress;
                    order.markModified('address');
                } catch (fetchError) {
                    console.error('Error fetching Razorpay payment details:', fetchError);
                }

                order.paymentStatus = 'completed';
                order.orderStatus = 'processing';
                order.notes = order.notes || {};
                order.notes.razorpay_payment_id = razorpay_payment_id;

                // SAVE BEFORE FINALIZE
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
