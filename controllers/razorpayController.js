const Razorpay = require('razorpay');
const crypto = require('crypto');
const { autoLoginUser } = require('../utils/authHelper');
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
 * Helper to sync Order with Razorpay Payment/Order data
 * Used by Verify, Webhook, and Status Sync
 */
const syncOrderDataWithRazorpay = async (order, payment, razorOrder) => {
    let dataChanged = false;

    // 1. Sync Customer Details (Email/Phone)
    if (payment?.email && payment.email.trim() && (!order.email || order.email.includes('guest'))) {
        order.email = payment.email;
        dataChanged = true;
    } else if (razorOrder?.customer_details?.email && (!order.email || order.email.includes('guest'))) {
        order.email = razorOrder.customer_details.email;
        dataChanged = true;
    }

    if (payment?.contact && (order.phone === '0000000000' || !order.phone)) {
        order.phone = payment.contact;
        dataChanged = true;
    } else if (razorOrder?.customer_details?.contact && (order.phone === '0000000000' || !order.phone)) {
        order.phone = razorOrder.customer_details.contact;
        dataChanged = true;
    }

    // 2. Sync Name
    let capturedName = payment?.notes?.customerName ||
        payment?.notes?.name ||
        payment?.notes?.customer_name ||
        payment?.notes?.contact_name ||
        payment?.customer?.name ||
        payment?.customer_details?.name ||
        payment?.billing_address?.name ||
        payment?.shipping_address?.name ||
        payment?.notes?.['shipping_address.name'] ||
        payment?.notes?.['billing_address.name'];

    // If name is still placeholder or missing, check Order object
    if (!capturedName || capturedName === 'Valued Customer' || capturedName === 'TBD' || capturedName === 'Guest') {
        const orderName = razorOrder?.customer_details?.name ||
            razorOrder?.customer_details?.shipping_address?.name ||
            razorOrder?.customer_details?.billing_address?.name;

        if (orderName && orderName !== 'Valued Customer' && orderName !== 'TBD' && orderName !== 'Guest') {
            capturedName = orderName;
        }
    }

    if (capturedName &&
        typeof capturedName === 'string' &&
        capturedName.trim().length > 0 &&
        capturedName !== 'Valued Customer' &&
        capturedName !== 'TBD' &&
        capturedName !== 'Guest' &&
        order.customerName !== capturedName
    ) {
        console.log(`[RAZORPAY_SYNC] Syncing Name: ${order.customerName} -> ${capturedName}`);
        order.customerName = capturedName;
        dataChanged = true;
    }

    // 3. Sync Amount
    if (payment?.amount) {
        const newAmount = payment.amount / 100;
        if (Math.abs(order.totalAmount - newAmount) > 0.01) {
            order.totalAmount = newAmount;
            dataChanged = true;
        }
    }

    // 4. Robust Shipping Address Sync
    const isAddressMissing = order.address?.street === 'TBD' || !order.address?.street || order.address?.city === 'TBD';
    if (isAddressMissing) {
        let ra = razorOrder?.customer_details?.shipping_address ||
            razorOrder?.customer_details?.billing_address ||
            payment?.shipping_address ||
            payment?.customer_details?.shipping_address ||
            payment?.notes?.shipping_address ||
            payment?.notes?.address;

        // Support for flat fields in notes
        if (payment?.notes) {
            const n = payment.notes;
            const line1 = n.shipping_address_line1 || n.shipping_address_street || n.address_line1 || n.line1 || n.street || n.address || n['shipping_address.line1'] || n['shipping_address.street'];
            const city = n.shipping_address_city || n.address_city || n.city || n['shipping_address.city'];
            const state = n.shipping_address_state || n.address_state || n.state || n['shipping_address.state'];
            const pincode = n.shipping_address_pincode || n.shipping_address_zip || n.address_pincode || n.pincode || n.zipcode || n.zip || n['shipping_address.pincode'] || n['shipping_address.zipcode'];

            if (line1 || city || state) {
                if (!ra || typeof ra !== 'object' || ra === null) {
                    ra = { line1, city, state, pincode, country: n.shipping_address_country || n.country || n['shipping_address.country'] || 'India' };
                } else {
                    if (!ra.line1 && !ra.street) ra.line1 = line1;
                    if (!ra.city) ra.city = city;
                    if (!ra.state) ra.state = state;
                    if (!ra.pincode && !ra.zipcode) ra.pincode = pincode;
                }
            }
        }

        if (ra) {
            const newAddress = { ...order.address };
            if (typeof ra === 'string' && (ra.startsWith('{') || ra.startsWith('['))) {
                try { ra = JSON.parse(ra); } catch (e) { }
            }

            if (typeof ra === 'string' && ra.trim().length > 0 && ra !== 'TBD') {
                newAddress.street = ra;
            } else if (typeof ra === 'object' && ra !== null) {
                const street = ra.line1 || ra.street || ra.address_line1 || ra.address || (ra.line2 ? `${ra.line1} ${ra.line2}` : null);
                if (street && street !== 'TBD') newAddress.street = street;
                if (ra.city && ra.city !== 'TBD') newAddress.city = ra.city;
                if (ra.state && ra.state !== 'TBD') newAddress.state = ra.state;
                const pc = ra.pincode || ra.zipcode || ra.postal_code || ra.zip;
                if (pc && pc !== 'TBD') newAddress.pincode = pc;
            }

            if (JSON.stringify(newAddress) !== JSON.stringify(order.address)) {
                console.log(`[RAZORPAY_SYNC] Syncing Address for order ${order._id}`);
                order.address = newAddress;
                order.markModified('address');
                dataChanged = true;
            }
        }
    }

    // 5. Sync Payment Method (Crucial for Magic Checkout COD support)
    if (payment?.method) {
        const method = payment.method === 'cod' ? 'cod' : 'online';
        if (order.paymentMethod !== method) {
            console.log(`[RAZORPAY_SYNC] Syncing Payment Method for order ${order._id}: ${order.paymentMethod} -> ${method}`);
            order.paymentMethod = method;
            dataChanged = true;

            // If it's COD from Magic Checkout, update status accordingly
            if (method === 'cod' && order.orderStatus === 'waiting_payment') {
                order.paymentStatus = 'pending'; // COD is pending until delivered
                order.orderStatus = 'processing';
            }
        }
    }

    return dataChanged;
};

/**
 * Create a Razorpay Order for Magic Checkout
 */
exports.createRazorpayOrder = async (req, res) => {
    try {
        const {
            amount, // amount to be paid now (rupees)
            customerName: rawCustomerName,
            email: rawEmail,
            phone: rawPhone,
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

        // CLEAN CUSTOMER DATA: If empty strings are sent, treat as undefined to let Magic Checkout capture them
        const finalCustomerName = (rawCustomerName && rawCustomerName.trim()) ? rawCustomerName.trim() : undefined;
        const finalEmail = (rawEmail && rawEmail.trim() && rawEmail.includes('@')) ? rawEmail.trim() : undefined;
        let formattedPhone = undefined;

        if (rawPhone && rawPhone.trim()) {
            let phoneToFormat = rawPhone.trim().replace(/[\s\-\(\)]/g, '');
            if (phoneToFormat.length === 10) formattedPhone = '+91' + phoneToFormat;
            else if (phoneToFormat.startsWith('91') && phoneToFormat.length === 12) formattedPhone = '+' + phoneToFormat;
            else if (phoneToFormat.startsWith('+')) formattedPhone = phoneToFormat;
            else formattedPhone = phoneToFormat; // Fallback
        }

        // Determine payment amount in paise
        const paymentAmountRupees = amount || finalTotal || totalAmount || 0;
        if (paymentAmountRupees <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid payment amount' });
        }

        const merchantOrderId = (orderType === 'plan_purchase' ? 'PLANREG' : 'MT') + Date.now() + Math.random().toString(36).substr(2, 6);

        // Razorpay Order Options
        const options = {
            amount: Math.round(paymentAmountRupees * 100), // amount in paise
            currency: "INR",
            receipt: merchantOrderId,
            line_items_total: Math.round(paymentAmountRupees * 100),
            line_items: (items || []).map(item => ({
                name: item.name || 'Product',
                quantity: item.quantity || 1,
                price: Math.round((item.price || item.product?.price || 0) * 100),
                offer_price: Math.round((item.price || item.product?.price || 0) * 100),
                sku: (item.productId || item.id || 'N/A').toString()
            })),
            notes: {
                customerName: finalCustomerName || 'Guest',
                email: finalEmail || 'None',
                phone: formattedPhone || 'None',
                sellerToken: sellerToken || '',
                agentCode: agentCode || '',
                orderType: orderType || 'product_order'
            },
            payment: {
                capture: 'automatic',
            }
        };

        // ONLY add customer_details if we have them, otherwise Magic Checkout captures them
        if (finalCustomerName || finalEmail || formattedPhone) {
            options.customer_details = {
                name: finalCustomerName,
                email: finalEmail,
                contact: formattedPhone
            };

            // Only add address if provided, otherwise Magic Checkout's "Magic" captures it
            if (address && address !== 'TBD' && city && city !== 'TBD') {
                options.customer_details.billing_address = {
                    line1: address,
                    city: city,
                    state: state || '',
                    zipcode: pincode || '',
                    country: 'IN'
                };
                options.customer_details.shipping_address = {
                    line1: address,
                    city: city,
                    state: state || '',
                    zipcode: pincode || '',
                    country: 'IN'
                };
            }
        }

        const razorpayOrder = await razorpay.orders.create(options);

        // Correctly map address for Mongoose Order schema
        const addressObj = {
            street: address || req.body.street || 'TBD',
            city: city || 'TBD',
            state: state || 'TBD',
            pincode: pincode || 'TBD',
            country: country || 'India'
        };

        // Save Order in DB first so it exists when Magic Checkout calls apply-promotion
        const newOrder = new Order({
            transactionId: razorpayOrder.id,
            customerName: finalCustomerName || 'Guest User',
            email: finalEmail || `guest_${Date.now()}@rikocraft.com`,
            phone: formattedPhone || '0000000000',
            address: addressObj,
            items: items || [],
            totalAmount: finalTotal || totalAmount || paymentAmountRupees,
            paymentMethod: paymentMethod || 'online',
            paymentStatus: 'pending',
            orderStatus: 'waiting_payment',
            orderType: orderType || 'product_order',
            upfrontAmount: upfrontAmount || 0,
            remainingAmount: remainingAmount || 0,
            codExtraCharge: codExtraCharge || 0,
            sellerToken: sellerToken || '',
            agentCode: agentCode || '',
            couponCode: couponCode || '',
            merchantTransactionId: merchantOrderId,
        });

        await newOrder.save();

        res.json({
            success: true,
            orderId: razorpayOrder.id,
            key: process.env.RAZORPAY_KEY_ID,
            amount: Math.round(paymentAmountRupees * 100),
            currency: "INR",
            receipt: merchantOrderId
        });

    } catch (error) {
        console.error('Create Razorpay Order Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
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
                    let razorOrder = null;
                    try {
                        razorOrder = await razorpay.orders.fetch(razorpay_order_id);
                    } catch (e) {
                        console.log('Error fetching Razorpay order during verification:', e.message);
                    }

                    // Use comprehensive sync helper
                    await syncOrderDataWithRazorpay(order, payment, razorOrder);

                } catch (fetchError) {
                    console.error('Error fetching Razorpay payment details during verification:', fetchError);
                }

                order.paymentStatus = 'completed';
                order.orderStatus = 'processing';
                order.notes = order.notes || {};
                order.notes.razorpay_payment_id = razorpay_payment_id;
                order.notes.payment_source = 'verify_call';

                // SAVE BEFORE FINALIZE
                await order.save();

                // Finalize Order (stock, email, etc.)
                await finalizeOrder(order);

                // Auto-login or create account for the customer
                const authData = await autoLoginUser({
                    email: order.email,
                    phone: order.phone,
                    customerName: order.customerName,
                    address: order.address,
                    city: order.city,
                    state: order.state,
                    zipCode: order.pincode,
                    country: order.country
                });

                return res.json({
                    success: true,
                    message: 'Payment verified successfully',
                    auth: authData
                });
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
        const { order_id, razorpay_order_id, addresses } = req.body;
        const id = razorpay_order_id || order_id;

        console.log('Magic Checkout Shipping Info Request:', { id, count: addresses?.length });

        // Check if order already has COD charge included
        let alreadyHasCodCharge = false;
        if (id) {
            const order = await Order.findOne({ transactionId: id }).lean();
            if (order && order.codExtraCharge > 0) {
                alreadyHasCodCharge = true;
            }
        }

        const codAmount = await getCodAmount();
        const baseCodFee = alreadyHasCodCharge ? 0 : (codAmount * 100);

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
            cod_fee: baseCodFee
        }));

        const response = {
            serviceable: true,
            addresses: updatedAddresses
        };

        res.json(response);
    } catch (error) {
        console.error('Magic Checkout Shipping Info Error:', error);
        res.status(200).json({ serviceable: false });
    }
};

/**
 * Magic Checkout 1.4/1.5: Get Promotions API
 * Returns list of available coupons
 */
exports.getPromotions = async (req, res) => {
    try {
        const now = new Date();
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const activeCoupons = await Coupon.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: startOfToday }
        }).lean();

        const promotions = activeCoupons
            .filter(coupon => coupon.usageLimit === null || coupon.usedCount < coupon.usageLimit)
            .map(coupon => ({
                id: coupon._id.toString(),
                code: coupon.code,
                name: coupon.code,
                description: coupon.discountType === 'percentage'
                    ? `Get ${coupon.discountValue}% off`
                    : `Get ₹${coupon.discountValue} off`,
                // ALWAYS use fixed_amount for list to avoid modal calculation bugs
                value_type: 'fixed_amount',
                offer_value: coupon.discountType === 'percentage' ? 0 : (coupon.discountValue * 100),
                offer_amount: coupon.discountType === 'percentage' ? 0 : (coupon.discountValue * 100), // redundant Field for 1.4/1.5 mix
                type: 'coupon'
            }));

        res.status(200).json({ promotions });
    } catch (error) {
        console.error('Magic Checkout Get Promotions Error:', error);
        res.status(200).json({ promotions: [] });
    }
};

/**
 * Magic Checkout 1.4/1.5: Apply Promotion API
 * Validates and applies a coupon code
 */
exports.applyPromotion = async (req, res) => {
    // START REQUEST LOGGING
    const body = req.body || {};
    const razorpay_order_id = body.order_id || body.razorpay_order_id || req.query.order_id;
    const session_token = body.session_token || req.headers['x-session-token'];
    const code = (body.code || body.coupon_code || body.promotion_code || '').toString().trim().toUpperCase();

    console.log(`[MC_APPLY_START] Order: ${razorpay_order_id} | Session: ${session_token} | Code: ${code}`);
    console.log(`[MC_APPLY_BODY] Full Body: ${JSON.stringify(body)}`);

    try {
        let amount_in_paise = Number(body.order_amount || body.amount || body.total_amount || 0);

        if (!code) {
            return res.status(200).json({
                error: { code: 'INVALID_PROMOTION', description: 'Please verify the code and try again.' }
            });
        }

        // 1. Order Lookup - Critical for Magic Checkout session validation
        // Priority: Merchant Order (receipt) -> transactionId (razorpay_order_id)
        if (amount_in_paise <= 0 && razorpay_order_id) {
            const dbOrder = await Order.findOne({
                $or: [
                    { transactionId: razorpay_order_id },
                    { merchantTransactionId: razorpay_order_id },
                    { orderNumber: razorpay_order_id }
                ]
            }).select('totalAmount').lean();

            if (dbOrder) {
                amount_in_paise = Math.round(dbOrder.totalAmount * 100);
                console.log(`[MC_APPLY] Found order in DB, amount: ${amount_in_paise}`);
            }
        }

        // Safety check: if amount is still 0, we might have a session issue
        if (amount_in_paise <= 0) {
            console.log(`[MC_APPLY_WARNING] No order amount found for ID ${razorpay_order_id}. Manual coupon apply might be needed.`);
        }

        // 2. Coupon Lookup
        const coupon = await Coupon.findOne({
            code: code,
            isActive: true,
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }).lean();

        if (!coupon) {
            return res.status(200).json({
                error: { code: 'INVALID_PROMOTION', description: 'The specified promotion code is not recognised or does not exist in the system.' }
            });
        }

        // 3. Status Checks
        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            return res.status(200).json({
                error: { code: 'INVALID_PROMOTION', description: 'This coupon has reached its usage limit.' }
            });
        }

        if (amount_in_paise && amount_in_paise < (coupon.minPurchase * 100)) {
            return res.status(200).json({
                error: { code: 'REQUIREMENT_NOT_MET', description: `Review the promotion's terms. Minimum cart value of ₹${coupon.minPurchase} required.` }
            });
        }

        if (!amount_in_paise && coupon.discountType === 'percentage') {
            return res.status(200).json({
                error: { code: 'REQUIREMENT_NOT_MET', description: 'Review the promotion\'s terms and adjust the cart contents accordingly.' }
            });
        }

        // 4. Calculate Discount
        let discount = 0;
        const discountValue = Number(coupon.discountValue) || 0;
        const maxDiscount = Number(coupon.maxDiscount) || 0;

        if (coupon.discountType === 'percentage') {
            discount = Math.round((amount_in_paise * discountValue) / 100);
            if (maxDiscount > 0 && discount > (maxDiscount * 100)) {
                discount = maxDiscount * 100;
            }
        } else {
            discount = discountValue * 100;
        }

        // SANITY CHECK: discount should not exceed amount_in_paise
        if (amount_in_paise > 0 && discount > amount_in_paise) {
            discount = amount_in_paise;
        }

        const finalDiscount = Math.max(0, Math.round(discount) || 0);

        // 5. Spec 1.4/1.5 Success Response
        console.log(`[MC_APPLY_SUCCESS] Discount: ${finalDiscount} for Code: ${code}`);

        return res.status(200).json({
            status: 'success',
            amount: finalDiscount, // For 1.4
            offer_amount: finalDiscount, // For 1.5 early spec
            promotion: {
                id: coupon._id.toString(),
                code: coupon.code,
                offer_value: finalDiscount, // For 1.5 latest spec
                offer_amount: finalDiscount, // For 1.5 older spec
                value_type: 'fixed_amount',
                type: 'coupon',
                status: 'applied' // Spec 1.5 requirement
            }
        });

    } catch (error) {
        console.error('MAGIC_CHECKOUT_APPLY_PROMOTION_ERROR:', error);
        return res.status(200).json({
            error: { code: 'INVALID_PROMOTION', description: 'Something went wrong. Please check the code and try again.' }
        });
    }
};

/**
 * Handle Razorpay Webhooks
 */
exports.handleWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!signature || !secret) {
        console.error('Webhook Error: Missing signature or secret');
        return res.status(400).json({ success: false, message: 'Missing signature or secret' });
    }

    try {
        const body = JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(body)
            .digest('hex');

        if (expectedSignature !== signature) {
            console.error('Webhook Error: Invalid signature');
            return res.status(400).json({ success: false, message: 'Invalid signature' });
        }

        const event = req.body.event;
        const payload = req.body.payload;

        console.log(`[RAZORPAY_WEBHOOK] Received event: ${event}`);

        if (event === 'payment.captured') {
            const payment = payload.payment.entity;
            const razorpay_payment_id = payment.id;
            const razorpay_order_id = payment.order_id;

            // Find order by transactionId (which stores razorpay_order_id)
            const order = await Order.findOne({ transactionId: razorpay_order_id });

            if (order && order.paymentStatus !== 'completed') {
                console.log(`[RAZORPAY_WEBHOOK] Processing captured payment for order: ${order._id}`);

                // Sync details from payment object using comprehensive helper
                let razorOrder = null;
                try {
                    razorOrder = await razorpay.orders.fetch(razorpay_order_id);
                } catch (e) {
                    console.log('Error fetching Razorpay order during webhook:', e.message);
                }

                await syncOrderDataWithRazorpay(order, payment, razorOrder);

                order.paymentStatus = 'completed';
                order.orderStatus = 'processing';
                order.notes = order.notes || {};
                order.notes.razorpay_payment_id = razorpay_payment_id;
                order.notes.payment_source = 'webhook';

                await order.save();
                await finalizeOrder(order);

                console.log(`[RAZORPAY_WEBHOOK] Order ${order._id} successfully updated via webhook`);
            } else if (!order) {
                console.warn(`[RAZORPAY_WEBHOOK] Order not found for transactionId: ${razorpay_order_id}`);
            }
        } else if (event === 'payment.failed') {
            const payment = payload.payment.entity;
            const razorpay_order_id = payment.order_id;

            const order = await Order.findOne({ transactionId: razorpay_order_id });
            if (order && order.paymentStatus === 'pending') {
                order.paymentStatus = 'failed';
                order.notes = order.notes || {};
                order.notes.failure_reason = payment.error_description || 'Unknown error';
                await order.save();
                console.log(`[RAZORPAY_WEBHOOK] Order ${order._id} marked as failed via webhook`);
            }
        }

        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Razorpay Webhook Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
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

        // Sync if TBD regardless of payment status (Fix for missing data)
        const isTBD = order.customerName === 'Guest User' || order.address?.street === 'TBD' || order.address?.city === 'TBD';

        if (status === 'pending' || isTBD) {
            try {
                const rpOrder = await razorpay.orders.fetch(orderId);
                const payments = await razorpay.orders.fetchPayments(orderId);
                const capturedPayment = payments.items.find(p => p.status === 'captured');

                if (capturedPayment || rpOrder.status === 'paid') {
                    const payment = capturedPayment || payments.items[0];

                    // Comprehensive Sync
                    const changed = await syncOrderDataWithRazorpay(order, payment, rpOrder);

                    if (status === 'pending') {
                        console.log(`[RAZORPAY_SYNC] Finalizing pending order ${order._id} found as PAID/CAPTURED in Razorpay.`);
                        order.paymentStatus = 'completed';
                        order.orderStatus = 'processing';
                        order.notes = order.notes || {};
                        order.notes.razorpay_payment_id = payment?.id;
                        order.notes.payment_source = 'api_sync';

                        await order.save();
                        await finalizeOrder(order);
                        status = 'success';
                    } else if (changed) {
                        console.log(`[RAZORPAY_SYNC] Updating missing data for already completed order ${order._id}`);
                        await order.save();
                    }
                }
            } catch (syncError) {
                console.error('[RAZORPAY_SYNC] Failed to sync status with Razorpay API:', syncError.message);
            }
        }

        let authData = null;
        if (status === 'success') {
            authData = await autoLoginUser({
                email: order.email,
                phone: order.phone,
                customerName: order.customerName,
                address: order.address,
                city: order.city,
                state: order.state,
                zipCode: order.pincode,
                country: order.country
            });
        }

        res.json({
            success: true,
            status,
            data: order,
            auth: authData
        });
    } catch (error) {
        console.error('Razorpay Status Error:', error);
        res.status(500).json({ success: false, message: 'Failed to get status' });
    }
};
