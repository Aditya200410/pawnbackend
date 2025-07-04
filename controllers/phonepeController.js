const axios = require('axios');
const crypto = require('crypto');

// Latest PhonePe API Integration (2024)
// Based on current PhonePe API documentation

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
    const frontendUrl = process.env.FRONTEND_URL;

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

    if (!frontendUrl) {
      console.error('Frontend URL not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Frontend URL not configured properly' 
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount provided' 
      });
    }

    // Latest PhonePe API endpoints (2024)
    const endpoints = [
      {
        name: 'Latest Production',
        baseUrl: 'https://api.phonepe.com/apis/hermes',
        endpoint: '/pg/v1/pay',
        env: 'production'
      },
      {
        name: 'Latest Sandbox',
        baseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
        endpoint: '/pg/v1/pay',
        env: 'sandbox'
      },
      {
        name: 'Alternative Production',
        baseUrl: 'https://api.phonepe.com/apis/hermes',
        endpoint: '/pg/v2/pay',
        env: 'production'
      },
      {
        name: 'Alternative Sandbox',
        baseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
        endpoint: '/pg/v2/pay',
        env: 'sandbox'
      }
    ];

    const merchantTransactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Latest PhonePe payload structure (2024)
    const payload = {
      merchantId: merchantId,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: email || phone || `user_${Date.now()}`,
      amount: Math.round(amount * 100), // Convert to paise
      redirectUrl: `${frontendUrl.replace(/\/+$/, '')}/payment/success?transactionId=${merchantTransactionId}`,
      redirectMode: 'POST',
      callbackUrl: `${(process.env.BACKEND_URL || 'https://pawnbackend-xmqa.onrender.com').replace(/\/+$/, '')}/api/payment/phonepe/callback`,
      paymentInstrument: {
        type: 'PAY_PAGE'
      },
      merchantOrderId: merchantTransactionId,
      message: `Payment for order ${merchantTransactionId}`,
      // Additional fields for better tracking
      mobileNumber: phone,
      email: email,
      shortName: customerName,
      name: customerName,
      // UPI specific fields
      upiIntent: true,
      enablePayMode: {
        upi: true,
        card: true,
        netbanking: true,
        wallet: true
      }
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

    console.log('PhonePe API Request - Environment:', env);
    console.log('PhonePe API Request - Merchant ID:', merchantId);
    console.log('PhonePe API Request - Payload:', JSON.stringify(payload, null, 2));
    console.log('PhonePe API Request - Base64 Payload:', base64Payload);

    // Try all PhonePe API endpoints
    let response;
    let lastError;
    
    for (const endpoint of endpoints) {
      // Only try endpoints for the current environment
      if (endpoint.env !== env) continue;
      
      try {
        console.log(`Trying ${endpoint.name} endpoint: ${endpoint.baseUrl}${endpoint.endpoint}`);
        
        const xVerify = generateXVerify(payload, endpoint.endpoint, merchantSecret);
        console.log(`PhonePe ${endpoint.name} - X-VERIFY:`, xVerify);
        
        response = await axios.post(
          endpoint.baseUrl + endpoint.endpoint,
          { request: base64Payload },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-VERIFY': xVerify,
              'X-MERCHANT-ID': merchantId,
            },
            timeout: 15000, // 15 second timeout per endpoint
          }
        );
        
        console.log(`✅ ${endpoint.name} endpoint successful!`);
        break; // Exit loop if successful
        
      } catch (error) {
        lastError = error;
        console.log(`❌ ${endpoint.name} endpoint failed: ${error.response?.status || 'Network Error'}`);
        if (error.response?.data) {
          console.log(`   Error details: ${JSON.stringify(error.response.data)}`);
        }
        continue; // Try next endpoint
      }
    }
    
    if (!response) {
      console.error('All PhonePe API endpoints failed');
      throw lastError;
    }

    console.log('PhonePe API Response:', JSON.stringify(response.data, null, 2));

    // Handle different response structures
    let redirectUrl = null;
    
    if (response.data && response.data.success) {
      // New response structure (2024)
      if (response.data.data && response.data.data.instrumentResponse && response.data.data.instrumentResponse.redirectInfo) {
        redirectUrl = response.data.data.instrumentResponse.redirectInfo.url;
      } else if (response.data.data && response.data.data.paymentUrl) {
        // Alternative response structure
        redirectUrl = response.data.data.paymentUrl;
      } else if (response.data.data && response.data.data.redirectUrl) {
        // Another alternative structure
        redirectUrl = response.data.data.redirectUrl;
      }
    }
    
    if (redirectUrl) {
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
    } else if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
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
      paymentInstrument,
      code,
      message
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
    console.log('PhonePe Callback - Response Code:', responseCode || code);

    // Handle different payment states (updated for 2024)
    if ((state === 'COMPLETED' || state === 'SUCCESS') && (responseCode === 'SUCCESS' || code === 'SUCCESS')) {
      // Payment successful - create order
      console.log('PhonePe Callback - Payment successful, creating order');
      
      // Here you would typically:
      // 1. Find the pending order using merchantTransactionId
      // 2. Update the order status to 'completed'
      // 3. Send confirmation email
      // 4. Update inventory
      
      return res.json({ success: true, message: 'Payment processed successfully' });
    } else if (state === 'FAILED' || state === 'ERROR') {
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

    // Latest status check endpoints (2024)
    const statusEndpoints = [
      {
        name: 'Latest v1',
        baseUrl: env === 'production' ? 'https://api.phonepe.com' : 'https://api-preprod.phonepe.com',
        endpoint: `/pg/v1/status/${merchantId}/${transactionId}`
      },
      {
        name: 'Latest v2',
        baseUrl: env === 'production' ? 'https://api.phonepe.com' : 'https://api-preprod.phonepe.com',
        endpoint: `/pg/v2/status/${merchantId}/${transactionId}`
      }
    ];

    let response;
    let lastError;

    for (const statusEndpoint of statusEndpoints) {
      try {
        console.log(`Trying ${statusEndpoint.name} status endpoint: ${statusEndpoint.baseUrl}${statusEndpoint.endpoint}`);
        
        const xVerify = generateStatusXVerify(statusEndpoint.endpoint, merchantSecret);
        console.log(`PhonePe ${statusEndpoint.name} Status - X-VERIFY:`, xVerify);

        response = await axios.get(
          statusEndpoint.baseUrl + statusEndpoint.endpoint,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-VERIFY': xVerify,
              'X-MERCHANT-ID': merchantId,
            },
            timeout: 15000,
          }
        );

        console.log(`✅ ${statusEndpoint.name} status endpoint successful!`);
        break;
      } catch (error) {
        lastError = error;
        console.log(`❌ ${statusEndpoint.name} status endpoint failed: ${error.response?.status || 'Network Error'}`);
        if (error.response?.data) {
          console.log(`   Error details: ${JSON.stringify(error.response.data)}`);
        }
        continue;
      }
    }

    if (!response) {
      console.error('All PhonePe status endpoints failed');
      throw lastError;
    }

    console.log('PhonePe Status Response:', JSON.stringify(response.data, null, 2));
    res.json(response.data);
  } catch (error) {
    console.error('PhonePe status error:', error.response?.data || error.message);
    console.error('PhonePe status error stack:', error.stack);
    
    let errorMessage = 'Failed to verify PhonePe payment';
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
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