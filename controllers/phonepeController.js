const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// PhonePe API Integration based on official documentation
// https://developer.phonepe.com/v1/reference/pay-api

// Helper to generate X-VERIFY header for PhonePe
// Format: SHA256(base64 encoded payload + "/pg/v1/pay" + salt key) + ### + salt index
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
    
    // Load environment variables
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const merchantSecret = process.env.PHONEPE_CLIENT_SECRET;
    const env = process.env.PHONEPE_ENV || 'sandbox';
    const frontendUrl = process.env.FRONTEND_URL;
    const backendUrl = process.env.BACKEND_URL;

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

    // PhonePe API endpoints based on official documentation
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/hermes'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    
    const apiEndpoint = '/pg/v1/pay';

    const merchantTransactionId = `MT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    const merchantUserId = email || phone || `MU${Date.now()}`;
    
    // PhonePe payload structure according to official documentation
    const payload = {
      merchantId: merchantId,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: merchantUserId,
      amount: Math.round(amount * 100), // Convert to paise
      redirectUrl: `${frontendUrl.replace(/\/+$/, '')}/payment/success?transactionId=${merchantTransactionId}`,
      redirectMode: 'POST',
      callbackUrl: `${backendUrl.replace(/\/+$/, '')}/api/payment/phonepe/callback`,
      paymentInstrument: {
        type: 'PAY_PAGE' // Using PAY_PAGE for web integration
      },
      mobileNumber: phone,
      // Additional optional fields for better tracking
      merchantOrderId: merchantTransactionId,
      message: `Payment for order ${merchantTransactionId}`,
      shortName: customerName,
      name: customerName,
      email: email
    };

    // Convert payload to base64 as required by PhonePe
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

    console.log('PhonePe API Request - Environment:', env);
    console.log('PhonePe API Request - Merchant ID:', merchantId);
    console.log('PhonePe API Request - Payload:', JSON.stringify(payload, null, 2));
    console.log('PhonePe API Request - Base64 Payload:', base64Payload);

    // Generate X-VERIFY header
    const xVerify = generateXVerify(payload, apiEndpoint, merchantSecret);
    console.log('PhonePe API Request - X-VERIFY:', xVerify);
    
    try {
      console.log(`Making PhonePe API request to: ${baseUrl}${apiEndpoint}`);
      
      const response = await axios.post(
        baseUrl + apiEndpoint,
        { request: base64Payload },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': xVerify
          },
          timeout: 30000, // 30 second timeout
        }
      );
      
      console.log('PhonePe API Response:', JSON.stringify(response.data, null, 2));

      // Handle PhonePe response according to official documentation
      if (response.data && response.data.success) {
        let redirectUrl = null;
        
        // Check for redirect URL in the response
        if (response.data.data && response.data.data.instrumentResponse && response.data.data.instrumentResponse.redirectInfo) {
          redirectUrl = response.data.data.instrumentResponse.redirectInfo.url;
        } else if (response.data.data && response.data.data.paymentUrl) {
          redirectUrl = response.data.data.paymentUrl;
        } else if (response.data.data && response.data.data.redirectUrl) {
          redirectUrl = response.data.data.redirectUrl;
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
          console.error('PhonePe API Error - No redirect URL in response:', response.data);
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to get PhonePe redirect URL', 
            data: response.data 
          });
        }
      } else {
        console.error('PhonePe API Error - Request failed:', response.data);
        return res.status(500).json({ 
          success: false, 
          message: response.data.message || 'PhonePe payment initiation failed', 
          data: response.data 
        });
      }
    } catch (error) {
      console.error('PhonePe API request failed:', error.response?.data || error.message);
      throw error;
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

    // Verify the callback using X-VERIFY header
    const merchantSecret = process.env.PHONEPE_CLIENT_SECRET;
    const receivedChecksum = req.headers['x-verify'];
    
    if (receivedChecksum) {
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
    }

    console.log('PhonePe Callback - Transaction ID:', merchantTransactionId);
    console.log('PhonePe Callback - State:', state);
    console.log('PhonePe Callback - Response Code:', responseCode || code);

    // Handle different payment states according to PhonePe documentation
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
    
    // Load environment variables
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const merchantSecret = process.env.PHONEPE_CLIENT_SECRET;
    const env = process.env.PHONEPE_ENV || 'sandbox';

    console.log('PhonePe Status Check - Transaction ID:', transactionId);
    console.log('PhonePe Status Check - Environment:', env);

    // PhonePe status check endpoint according to official documentation
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com'
      : 'https://api-preprod.phonepe.com';
    
    const statusEndpoint = `/pg/v1/status/${merchantId}/${transactionId}`;

    console.log(`Making PhonePe status request to: ${baseUrl}${statusEndpoint}`);
    
    const xVerify = generateStatusXVerify(statusEndpoint, merchantSecret);
    console.log('PhonePe Status Check - X-VERIFY:', xVerify);

    const response = await axios.get(
      baseUrl + statusEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify
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