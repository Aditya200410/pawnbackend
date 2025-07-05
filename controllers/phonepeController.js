const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// Cache for OAuth token
let oauthToken = null;
let tokenExpiry = null;

// Get OAuth token for PhonePe API
async function getPhonePeToken() {
  try {
    // Check if we have a valid cached token
    if (oauthToken && tokenExpiry && new Date() < tokenExpiry) {
      return oauthToken;
    }

    const clientId = process.env.PHONEPE_CLIENT_ID;
    const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
    const clientVersion = process.env.PHONEPE_CLIENT_VERSION || '1.0';
    const env = process.env.PHONEPE_ENV || 'production';

    if (!clientId || !clientSecret) {
      throw new Error('PhonePe OAuth credentials not configured');
    }

    // Set OAuth URL based on environment
    // Based on PhonePe documentation: https://developer.phonepe.com/v1/reference/authorization-standard-checkout/
    let oauthUrl;
    if (env === 'production') {
      oauthUrl = 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';
    } else {
      oauthUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';
    }

    console.log('Getting PhonePe OAuth token from:', oauthUrl);

    const response = await axios.post(oauthUrl, 
      new URLSearchParams({
        client_id: clientId,
        client_version: clientVersion,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      }), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.access_token) {
      oauthToken = response.data.access_token;
      // Set expiry based on expires_at field from response
      if (response.data.expires_at) {
        tokenExpiry = new Date(response.data.expires_at * 1000); // Convert from seconds to milliseconds
      } else {
        // Fallback to 1 hour if expires_at is not provided
        tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
      }
      
      console.log('PhonePe OAuth token obtained successfully');
      console.log('Token expires at:', tokenExpiry);
      return oauthToken;
    } else {
      throw new Error('Invalid OAuth response from PhonePe');
    }
  } catch (error) {
    console.error('PhonePe OAuth token error:', error.response?.data || error.message);
    throw new Error('Failed to get PhonePe OAuth token');
  }
}

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
    
    const env = process.env.PHONEPE_ENV || 'production';
    const frontendUrl = process.env.FRONTEND_URL;
    const backendUrl = process.env.BACKEND_URL;

    // Enhanced validation
    if (!frontendUrl || !backendUrl) {
      console.error('URL configuration missing:', { 
        frontendUrl: !!frontendUrl, 
        backendUrl: !!backendUrl 
      });
      return res.status(500).json({
        success: false,
        message: 'Application configuration missing. Please contact support.',
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount provided' 
      });
    }

    if (!customerName || !email || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer details are required' 
      });
    }

    // Validate phone number format
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please enter a valid 10-digit mobile number.'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format.'
      });
    }

    // Get OAuth token
    const accessToken = await getPhonePeToken();

    // Set base URL for payment API based on PhonePe documentation
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/pg/checkout/v2/pay'
      : 'https://api.phonepe.com/apis/pg/checkout/v2/pay';

    const apiEndpoint = '/checkout/v2/pay';

    const merchantOrderId = `MT${Date.now()}${Math.random().toString(36).substr(2, 6)}`;

    // Prepare payload according to PhonePe API documentation
    const payload = {
      merchantOrderId: merchantOrderId,
      amount: Math.round(amount * 100), // Convert to paise
      expireAfter: 1200, // 20 minutes expiry
      metaInfo: {
        udf1: customerName,
        udf2: email,
        udf3: phone,
        udf4: sellerToken || '',
        udf5: couponCode || ''
      },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: `Payment for order ${merchantOrderId}`,
        merchantUrls: {
          redirectUrl: `${frontendUrl.replace(/\/+$/, '')}/payment/success?transactionId=${merchantOrderId}`,
          cancelUrl: `${frontendUrl.replace(/\/+$/, '')}/payment/cancel?transactionId=${merchantOrderId}`,
          callbackUrl: `${backendUrl.replace(/\/+$/, '')}/api/payment/phonepe/callback`
        }
      }
    };

    console.log('PhonePe payload:', {
      ...payload,
      amount: payload.amount,
      accessToken: '***HIDDEN***'
    });

    console.log(`Making PhonePe API request to: ${baseUrl}${apiEndpoint}`);
    
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

    console.log('PhonePe API response:', response.data);

    // Success response from PhonePe
    if (response.data && response.data.success) {
      let redirectUrl = null;
      const instrumentResponse = response.data.data?.instrumentResponse;

      if (instrumentResponse?.redirectInfo?.url) {
        redirectUrl = instrumentResponse.redirectInfo.url;
      } else if (response.data.data.paymentUrl) {
        redirectUrl = response.data.data.paymentUrl;
      } else if (response.data.data.redirectUrl) {
        redirectUrl = response.data.data.redirectUrl;
      }

      if (redirectUrl) {
        const orderData = {
          merchantOrderId,
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

        console.log('PhonePe order created successfully:', {
          transactionId: merchantOrderId,
          redirectUrl: redirectUrl.substring(0, 100) + '...'
        });

        return res.json({ 
          success: true, 
          redirectUrl,
          transactionId: merchantOrderId,
          orderData 
        });
      } else {
        console.error('PhonePe did not return redirect URL:', response.data);
        return res.status(500).json({ 
          success: false, 
          message: 'PhonePe did not return a redirect URL.',
          data: response.data 
        });
      }
    } else {
      console.error('PhonePe payment initiation failed:', response.data);
      return res.status(500).json({
        success: false,
        message: response.data.message || 'PhonePe payment initiation failed',
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
    } else if (error.response?.status === 500) {
      errorMessage = 'Payment gateway error. Please try again later.';
    } else if (error.response?.status === 400) {
      errorMessage = 'Invalid payment request. Please check your details.';
    } else if (error.response?.status === 401) {
      errorMessage = 'Payment gateway authentication failed. Please try again.';
    }

    return res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.response?.data || error.message
    });
  }
};

exports.phonePeCallback = async (req, res) => {
  try {
    const { merchantOrderId, transactionId, amount, status, code, merchantId } = req.body;
    
    console.log('PhonePe callback received:', req.body);
    
    // Verify the callback data
    if (!merchantOrderId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Invalid callback data'
      });
    }
    
    // Here you would typically:
    // 1. Verify the transaction with PhonePe
    // 2. Update your order status in database
    // 3. Send confirmation email/SMS
    
    // For now, just log and return success
    console.log(`Payment ${status} for transaction: ${merchantOrderId}`);
    
    return res.json({
      success: true,
      message: 'Callback processed successfully'
    });
    
  } catch (error) {
    console.error('PhonePe callback error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process callback'
    });
  }
};

exports.getPhonePeStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    const env = process.env.PHONEPE_ENV || 'production';
    
    // Get OAuth token
    const accessToken = await getPhonePeToken();
    
    // Set base URL based on PhonePe documentation
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    
    const apiEndpoint = `/checkout/v2/order/${transactionId}/status`;
    
    const response = await axios.get(
      baseUrl + apiEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${accessToken}`
        },
        timeout: 30000
      }
    );
    
    if (response.data && response.data.success) {
      return res.json({
        success: true,
        data: response.data.data
      });
    } else {
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to get transaction status'
      });
    }
    
  } catch (error) {
    console.error('PhonePe status check error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to check transaction status'
    });
  }
};

// Refund API implementation
exports.refundPayment = async (req, res) => {
  try {
    const { merchantRefundId, originalMerchantOrderId, amount } = req.body;
    
    if (!merchantRefundId || !originalMerchantOrderId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Refund details are required'
      });
    }
    
    const env = process.env.PHONEPE_ENV || 'production';
    const accessToken = await getPhonePeToken();
    
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    
    const apiEndpoint = '/payments/v2/refund';
    
    const payload = {
      merchantRefundId,
      originalMerchantOrderId,
      amount: Math.round(amount * 100) // Convert to paise
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
    
    if (response.data && response.data.success) {
      return res.json({
        success: true,
        data: response.data.data
      });
    } else {
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to process refund'
      });
    }
    
  } catch (error) {
    console.error('PhonePe refund error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to process refund'
    });
  }
};

// Refund status check
exports.getRefundStatus = async (req, res) => {
  try {
    const { merchantRefundId } = req.params;
    
    if (!merchantRefundId) {
      return res.status(400).json({
        success: false,
        message: 'Refund ID is required'
      });
    }
    
    const env = process.env.PHONEPE_ENV || 'production';
    const accessToken = await getPhonePeToken();
    
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/hermes'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    
    const apiEndpoint = `/payments/v2/refund/${merchantRefundId}/status`;
    
    const response = await axios.get(
      baseUrl + apiEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${accessToken}`
        },
        timeout: 30000
      }
    );
    
    if (response.data && response.data.success) {
      return res.json({
        success: true,
        data: response.data.data
      });
    } else {
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to get refund status'
      });
    }
    
  } catch (error) {
    console.error('PhonePe refund status error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to check refund status'
    });
  }
};
