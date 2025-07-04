const axios = require('axios');
const crypto = require('crypto');

// NOTE: PhonePe uses merchantId (your business identifier) for all payment requests. clientId is not required for UPI integration.
// Use process.env.PHONEPE_MERCHANT_ID everywhere.

// Helper to generate X-VERIFY header for PhonePe
function generateXVerify(payload, apiEndpoint, merchantSecret) {
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const stringToHash = base64Payload + apiEndpoint + merchantSecret;
  const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
  return sha256 + '###1';
}

// Helper for X-VERIFY for status check
function generateStatusXVerify(apiEndpoint, merchantSecret) {
  const stringToHash = apiEndpoint + merchantSecret;
  const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
  return sha256 + '###1';
}

// POST /api/payment/phonepe
exports.createPhonePeOrder = async (req, res) => {
  try {
    const { 
      amount, 
      customerName, 
      email, 
      phone, 
      items, 
      totalAmount, 
      shippingCost, 
      codExtraCharge, 
      finalTotal, 
      paymentMethod, 
      sellerToken,
      couponCode 
    } = req.body;
    
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const merchantSecret = process.env.PHONEPE_CLIENT_SECRET;
    const env = process.env.PHONEPE_ENV || 'production';
    const frontendUrl = process.env.FRONTEND_URL || 'https://pawn-shop-git-local-host-api-used-aditya200410s-projects.vercel.app';

    console.log('PhonePe Order Creation - Environment:', env);
    console.log('PhonePe Order Creation - Frontend URL:', frontendUrl);
    console.log('PhonePe Order Creation - Amount:', amount);

    // Validate required fields
    if (!merchantId || !merchantSecret) {
      console.error('PhonePe credentials not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Payment gateway not configured properly' 
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount provided' 
      });
    }

    const apiEndpoint = '/pg/v1/pay';
    const phonepeBaseUrl = env === 'production'
      ? 'https://api.phonepe.com/apis/hermes'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

    const merchantTransactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create order data for PhonePe
    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: email || phone || `user_${Date.now()}`,
      amount: Math.round(amount * 100), // Convert to paise
      redirectUrl: `${frontendUrl}/payment/success?transactionId=${merchantTransactionId}`,
      redirectMode: 'POST',
      callbackUrl: `${process.env.BACKEND_URL || 'https://pawnbackend-xmqa.onrender.com'}/api/payment/phonepe/callback`,
      paymentInstrument: {
        type: 'PAY_PAGE',
      },
      merchantOrderId: merchantTransactionId,
      message: `Payment for order ${merchantTransactionId}`,
    };

    const xVerify = generateXVerify(payload, apiEndpoint, merchantSecret);
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

    console.log('PhonePe API Request - URL:', phonepeBaseUrl + apiEndpoint);
    console.log('PhonePe API Request - Environment:', env);
    console.log('PhonePe API Request - Merchant ID:', merchantId);
    console.log('PhonePe API Request - Payload:', JSON.stringify(payload, null, 2));
    console.log('PhonePe API Request - Base64 Payload:', base64Payload);
    console.log('PhonePe API Request - X-VERIFY:', xVerify);

    // Try alternative PhonePe API endpoint if the first one fails
    let response;
    try {
      response = await axios.post(
        phonepeBaseUrl + apiEndpoint,
        { request: base64Payload },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': xVerify,
            'X-MERCHANT-ID': merchantId,
          },
          timeout: 30000, // 30 second timeout
        }
      );
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('PhonePe API 404 error, trying alternative endpoint...');
        // Try alternative endpoint
        const altApiEndpoint = '/pg/v1/pay';
        const altPhonepeBaseUrl = env === 'production'
          ? 'https://api.phonepe.com'
          : 'https://api-preprod.phonepe.com';
        
        const altXVerify = generateXVerify(payload, altApiEndpoint, merchantSecret);
        
        console.log('PhonePe Alternative API Request - URL:', altPhonepeBaseUrl + altApiEndpoint);
        console.log('PhonePe Alternative API Request - X-VERIFY:', altXVerify);
        
        response = await axios.post(
          altPhonepeBaseUrl + altApiEndpoint,
          { request: base64Payload },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-VERIFY': altXVerify,
              'X-MERCHANT-ID': merchantId,
            },
            timeout: 30000,
          }
        );
      } else {
        throw error;
      }
    }

    console.log('PhonePe API Response:', JSON.stringify(response.data, null, 2));

    if (response.data && response.data.success && response.data.data && response.data.data.instrumentResponse && response.data.data.instrumentResponse.redirectInfo && response.data.data.instrumentResponse.redirectInfo.url) {
      const redirectUrl = response.data.data.instrumentResponse.redirectInfo.url;
      
      // Store order data temporarily (you might want to save this to database)
      const orderData = {
        merchantTransactionId,
        customerName,
        email,
        phone,
        items,
        totalAmount,
        shippingCost,
        codExtraCharge,
        finalTotal,
        paymentMethod,
        sellerToken,
        couponCode,
        status: 'pending',
        createdAt: new Date()
      };
      
      console.log('PhonePe Order Created Successfully:', merchantTransactionId);
      console.log('PhonePe Redirect URL:', redirectUrl);
      
      return res.json({ 
        success: true, 
        redirectUrl,
        transactionId: merchantTransactionId,
        orderData 
      });
    } else {
      console.error('PhonePe API Error - Invalid response structure:', response.data);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get PhonePe redirect URL', 
        data: response.data 
      });
    }
  } catch (error) {
    console.error('PhonePe order error:', error.response?.data || error.message);
    console.error('PhonePe order error stack:', error.stack);
    
    let errorMessage = 'Failed to create PhonePe order';
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Payment gateway timeout. Please try again.';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Payment gateway not reachable. Please try again.';
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage, 
      error: error.response?.data || error.message 
    });
  }
};

// POST /api/payment/phonepe/callback
exports.phonePeCallback = async (req, res) => {
  try {
    console.log('PhonePe Callback Received:', JSON.stringify(req.body, null, 2));
    
    const { 
      merchantId, 
      merchantTransactionId, 
      transactionId, 
      amount, 
      state, 
      responseCode, 
      paymentInstrument 
    } = req.body;

    // Verify the callback
    const merchantSecret = process.env.PHONEPE_CLIENT_SECRET;
    const receivedChecksum = req.headers['x-verify'];
    
    // Generate checksum for verification
    const payload = JSON.stringify(req.body);
    const base64Payload = Buffer.from(payload).toString('base64');
    const stringToHash = base64Payload + '/pg/v1/status/' + merchantSecret;
    const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const calculatedChecksum = sha256 + '###1';

    if (receivedChecksum !== calculatedChecksum) {
      console.error('PhonePe Callback - Checksum verification failed');
      return res.status(400).json({ success: false, message: 'Invalid checksum' });
    }

    console.log('PhonePe Callback - Transaction ID:', merchantTransactionId);
    console.log('PhonePe Callback - State:', state);
    console.log('PhonePe Callback - Response Code:', responseCode);

    // Handle different payment states
    if (state === 'COMPLETED' && responseCode === 'SUCCESS') {
      // Payment successful - create order
      console.log('PhonePe Callback - Payment successful, creating order');
      
      // Here you would typically:
      // 1. Find the pending order using merchantTransactionId
      // 2. Update the order status to 'completed'
      // 3. Send confirmation email
      // 4. Update inventory
      
      return res.json({ success: true, message: 'Payment processed successfully' });
    } else if (state === 'FAILED') {
      console.log('PhonePe Callback - Payment failed');
      return res.json({ success: false, message: 'Payment failed' });
    } else {
      console.log('PhonePe Callback - Payment pending or unknown state');
      return res.json({ success: true, message: 'Payment status received' });
    }
  } catch (error) {
    console.error('PhonePe callback error:', error);
    res.status(500).json({ success: false, message: 'Callback processing failed' });
  }
};

// GET /api/payment/phonepe/status/:transactionId
exports.getPhonePeStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const merchantSecret = process.env.PHONEPE_CLIENT_SECRET;
    const env = process.env.PHONEPE_ENV || 'production';

    console.log('PhonePe Status Check - Transaction ID:', transactionId);
    console.log('PhonePe Status Check - Environment:', env);

    const apiEndpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
    const phonepeBaseUrl = env === 'production'
      ? 'https://api.phonepe.com'
      : 'https://api-preprod.phonepe.com';

    const xVerify = generateStatusXVerify(apiEndpoint, merchantSecret);

    console.log('PhonePe Status Check - URL:', phonepeBaseUrl + apiEndpoint);
    console.log('PhonePe Status Check - X-VERIFY:', xVerify);

    const response = await axios.get(
      phonepeBaseUrl + apiEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': merchantId,
        },
        timeout: 30000,
      }
    );

    console.log('PhonePe Status Response:', JSON.stringify(response.data, null, 2));
    res.json(response.data);
  } catch (error) {
    console.error('PhonePe status error:', error.response?.data || error.message);
    console.error('PhonePe status error stack:', error.stack);
    
    let errorMessage = 'Failed to verify PhonePe payment';
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Payment verification timeout. Please try again.';
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage, 
      error: error.response?.data || error.message 
    });
  }
};

// .env variables to add:
// PHONEPE_MERCHANT_ID=your_merchant_id
// PHONEPE_CLIENT_SECRET=your_client_secret
// PHONEPE_ENV=sandbox
// FRONTEND_URL=http://localhost:3000 (or your deployed frontend) 