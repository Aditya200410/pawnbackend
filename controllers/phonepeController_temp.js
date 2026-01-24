
exports.initiateAgentPayment = async (req, res) => {
    try {
        const {
            amount,
            customerName,
            email,
            phone,
            totalAmount,
            finalTotal,
            planType, // Starter, Pro, etc.
            orderType
        } = req.body;

        // Basic Validation
        if (!amount || !customerName || !email || !phone) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const env = process.env.PHONEPE_ENV || 'sandbox';
        const frontendUrl = process.env.FRONTEND_URL;
        const backendUrl = process.env.BACKEND_URL;

        // Use orderId as transactionId
        const merchantOrderId = `PLAN${Date.now()}${Math.random().toString(36).substr(2, 6)}`;

        // Create Address Object (Defaulting missing fields as they are not collected for agents)
        const addressObj = {
            street: req.body.address || 'Online',
            city: 'Online',
            state: 'Online',
            pincode: '000000',
            country: 'India'
        };

        // Create Order in DB
        const newOrder = new Order({
            transactionId: merchantOrderId,
            customerName,
            email,
            phone,
            address: addressObj,
            items: [{
                name: `Distributor Plan`,
                productId: 'plan_purchase',
                quantity: 1,
                price: finalTotal
            }],
            totalAmount: finalTotal,
            paymentMethod: 'online',
            paymentStatus: 'pending',
            orderStatus: 'waiting_payment',
            orderType: orderType || 'plan_purchase',
            upfrontAmount: 0,
            remainingAmount: 0,
            shippingCost: 0
        });

        await newOrder.save();

        const accessToken = await getPhonePeToken();
        const baseUrl = env === 'production'
            ? 'https://api.phonepe.com/apis/pg'
            : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
        const apiEndpoint = '/checkout/v2/pay';

        const payload = {
            merchantOrderId: merchantOrderId,
            amount: Math.round(finalTotal * 100),
            expireAfter: 1200,
            metaInfo: {
                udf1: customerName,
                udf2: email,
                udf3: phone,
                udf4: 'plan_purchase',
                orderId: newOrder._id.toString()
            },
            paymentFlow: {
                type: 'PG_CHECKOUT',
                message: `Payment for Distributor Plan`,
                merchantUrls: {
                    redirectUrl: `${frontendUrl.replace(/\/+$/, '')}/payment/status?orderId=${merchantOrderId}`,
                    callbackUrl: `${backendUrl}/api/payment/phonepe/callback`
                }
            }
        };

        const response = await axios.post(
            baseUrl + apiEndpoint,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `O-Bearer ${accessToken}`
                },
                timeout: 30000
            }
        );

        if (response.data && response.data.orderId) {
            return res.json({
                success: true,
                redirectUrl: response.data.redirectUrl,
                orderId: merchantOrderId,
            });
        } else {
            await Order.findByIdAndDelete(newOrder._id);
            return res.status(500).json({ success: false, message: 'Payment initiation failed' });
        }

    } catch (error) {
        console.error('Agent Payment Init Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Payment initiation failed' });
    }
};
