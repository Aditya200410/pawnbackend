require('dotenv').config();
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function debugOrder() {
    try {
        const orderId = 'order_SGZuRUIVmNBxOt';
        console.log(`\n--- Debugging Razorpay Order: ${orderId} ---`);

        try {
            const razorOrder = await razorpay.orders.fetch(orderId);
            console.log('Razorpay Order Object:', JSON.stringify(razorOrder, null, 2));
        } catch (e) {
            console.log('Error fetching order:', e.message);
        }

        try {
            const payments = await razorpay.orders.fetchPayments(orderId);
            console.log('\n--- Payments found:', payments.items.length, '---');

            payments.items.forEach((p, i) => {
                console.log(`\nPayment ${i + 1}: ${p.id} (${p.status})`);
                console.log('Email:', p.email);
                console.log('Contact:', p.contact);
                console.log('Notes:', JSON.stringify(p.notes, null, 2));
                console.log('Shipping Address:', JSON.stringify(p.shipping_address, null, 2));
                console.log('Billing Address:', JSON.stringify(p.billing_address, null, 2));
                console.log('Customer:', JSON.stringify(p.customer, null, 2));
                console.log('Customer Details:', JSON.stringify(p.customer_details, null, 2));
            });
        } catch (e) {
            console.log('Error fetching payments:', e.message);
        }

        process.exit(0);
    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

debugOrder();
