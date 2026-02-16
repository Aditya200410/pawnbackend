require('dotenv').config();
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const fs = require('fs').promises;
const path = require('path');
const Order = require('./models/Order');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const ordersJsonPath = path.join(__dirname, 'data', 'orders.json');

async function syncOrders() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        // Find orders that need fixing
        const ordersToFix = await Order.find({
            $or: [
                { customerName: 'Valued Customer' },
                { 'address.street': 'TBD' }
            ],
            transactionId: { $exists: true, $ne: '' }
        });

        console.log(`Found ${ordersToFix.length} orders potentially needing data sync.`);

        let updatedCount = 0;

        for (const order of ordersToFix) {
            console.log(`\nChecking Order: ${order._id} (ID: ${order.orderNumber || 'N/A'})`);
            console.log(`Transaction ID (Razorpay Order): ${order.transactionId}`);

            try {
                // 1. Get payments for this Razorpay Order ID
                const payments = await razorpay.orders.fetchPayments(order.transactionId);
                let razorOrder = null;
                try {
                    razorOrder = await razorpay.orders.fetch(order.transactionId);
                } catch (e) {
                    console.log('Error fetching Razorpay order:', e.message);
                }

                if ((!payments.items || payments.items.length === 0) && !razorOrder) {
                    console.log('No payments or order info found for this order ID in Razorpay.');
                    continue;
                }

                // Get the most recent successful payment
                const successfulPayment = payments.items ? (payments.items.find(p => p.status === 'captured') || payments.items[0]) : null;
                if (successfulPayment) {
                    console.log(`Found payment ${successfulPayment.id} with status ${successfulPayment.status}`);
                }

                const payment = successfulPayment;
                let dataChanged = false;

                // --- Sync Logic (Mirroring razorpayController.js) ---

                // 1. Name Sync
                // Get name from payment notes or customer details
                let capturedName = payment ? (
                    payment.notes?.customerName ||
                    payment.notes?.name ||
                    payment.notes?.customer_name ||
                    payment.notes?.contact_name ||
                    payment.customer?.name ||
                    payment.customer_details?.name ||
                    payment.billing_address?.name ||
                    payment.shipping_address?.name
                ) : null;

                // If payment name is a placeholder or missing, try the Order object
                if (!capturedName || capturedName === 'Valued Customer' || capturedName === 'TBD') {
                    const orderName = razorOrder?.customer_details?.name ||
                        razorOrder?.customer_details?.shipping_address?.name ||
                        razorOrder?.customer_details?.billing_address?.name;

                    if (orderName && orderName !== 'Valued Customer' && orderName !== 'TBD') {
                        capturedName = orderName;
                    }
                }

                if (capturedName &&
                    capturedName !== 'Valued Customer' &&
                    capturedName !== 'TBD' &&
                    capturedName.trim() !== ''
                ) {
                    if (order.customerName !== capturedName) {
                        console.log(`Updating Name: ${order.customerName} -> ${capturedName}`);
                        order.customerName = capturedName;
                        dataChanged = true;
                    }
                }

                // 2. Email/Phone Sync
                const rpEmail = payment?.email || razorOrder?.customer_details?.email;
                if (rpEmail && (order.email === ' ' || !order.email)) {
                    order.email = rpEmail;
                    dataChanged = true;
                }

                const rpPhone = payment?.contact || razorOrder?.customer_details?.contact;
                if (rpPhone && (order.phone === '0000000000' || !order.phone)) {
                    order.phone = rpPhone;
                    dataChanged = true;
                }

                // 3. Address Sync
                const newAddress = { ...order.address };
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
                        if (!ra || typeof ra !== 'object') {
                            ra = { line1, city, state, pincode, country: n.shipping_address_country || n.country || 'India' };
                        } else {
                            // Merge missing fields
                            if (!ra.line1 && !ra.street) ra.line1 = line1;
                            if (!ra.city) ra.city = city;
                            if (!ra.state) ra.state = state;
                            if (!ra.pincode && !ra.zipcode) ra.pincode = pincode;
                        }
                    }
                }

                if (ra) {
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
                }

                // Final safety check
                if (newAddress.street === 'TBD' && payment?.notes?.line1) {
                    newAddress.street = payment.notes.line1;
                }

                if (JSON.stringify(newAddress) !== JSON.stringify(order.address)) {
                    console.log(`Updating Address for order ${order._id}`);
                    order.address = newAddress;
                    order.markModified('address');
                    dataChanged = true;
                }

                if (dataChanged) {
                    await order.save();
                    updatedCount++;
                    console.log('Order updated in DB.');
                } else {
                    console.log('No new data found in Razorpay for this order.');
                }

            } catch (err) {
                console.error(`Error processing order ${order._id}:`, err.message);
            }
        }

        if (updatedCount > 0) {
            console.log(`\nSyncing updated orders to orders.json...`);
            const allOrders = await Order.find({}).sort({ createdAt: -1 });
            const ordersJsonData = allOrders.map(o => o.toObject({ virtuals: true }));
            await fs.writeFile(ordersJsonPath, JSON.stringify(ordersJsonData, null, 2));
            console.log('Successfully updated orders.json');
        }

        console.log(`\nSync Process Complete. Updated ${updatedCount} orders.`);
        process.exit(0);

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

syncOrders();
