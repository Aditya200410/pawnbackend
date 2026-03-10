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
 * Optimized to return serviceability instantly but with accurate data
 */
exports.getShippingInfo = async (req, res) => {
    // Log for debugging
    console.log(`[RAZORPAY_SERVICEABILITY] Check received at ${new Date().toISOString()}`);
    
    try {
        const { addresses = [] } = req.body;
        
        // Fetch COD upfront amount from settings for accuracy
        const baseCodFeeAmount = await getCodAmount();
        const baseCodFee = baseCodFeeAmount * 100; // in paise

        // Mark every address as serviceable immediately
        const updatedAddresses = addresses.map(addr => ({
            ...addr,
            serviceable: true,
            shipping_fee: 0, // Standard shipping is free
            shipping_method: "Standard Shipping",
            cod_available: true,
            cod_fee: baseCodFee,
            shipping_options: [{
                id: "standard",
                name: "Standard Shipping",
                amount: 0,
                currency: "INR",
                description: "3-5 business days"
            }]
        }));

        res.json({
            addresses: updatedAddresses
        });
    } catch (error) {
        console.error('[RAZORPAY_SERVICEABILITY] Error:', error);
        // Fallback to basic positive response to avoid blocking checkout
        res.status(200).json({ 
            addresses: (req.body.addresses || []).map(a => ({ ...a, serviceable: true, cod_available: true, shipping_fee: 0, cod_fee: 3900 }))
        });
    }
};

/**
 * Magic Checkout 1.4/1.5: Get Promotions API
 * Returns list of available coupons
 */
exports.getPromotions = async (req, res) => {
    // Promotions are disabled for Magic Checkout
    res.status(200).json({ promotions: [] });
};

/**
 * Magic Checkout 1.4/1.5: Apply Promotion API
 * Validates and applies a coupon code
 */
exports.applyPromotion = async (req, res) => {
    // Promotions are disabled for Magic Checkout as requested
    // We return a REQUIREMENT_NOT_MET as it's a valid Magic Checkout error code
    return res.status(200).json({
        error: { 
            code: 'REQUIREMENT_NOT_MET', 
            description: 'Coupons are currently disabled for Magic Checkout calls. Please use the standard checkout for coupons.' 
        }
    });
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
