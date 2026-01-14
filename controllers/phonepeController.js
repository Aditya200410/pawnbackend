const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();
const Order = require('../models/Order');
const { sendOrderConfirmationEmail } = require('./orderController');

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
    const clientVersion = '1';
    const env = process.env.PHONEPE_ENV || 'sandbox';

    if (!clientId || !clientSecret) {
      throw new Error('PhonePe OAuth credentials not configured');
    }

    // Set OAuth URL based on environment
    // Based on PhonePe documentation: https://developer.phonepe.com/v1/reference/authorization-standard-checkout/
    let oauthUrl;
    if (env === 'production')
      oauthUrl = 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';
    else
      oauthUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';


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

const { finalizeOrder } = require('../utils/orderHelper');

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
      upfrontAmount,
      remainingAmount,
      sellerToken,
      agentCode,
      couponCode
    } = req.body;

    // ... validation ...
    const requiredFields = ['amount', 'customerName', 'email', 'phone', 'totalAmount', 'finalTotal'];
    const missingFields = requiredFields.filter(field => {
      const val = req.body[field];
      return val === undefined || val === null || val === '';
    });

    if (missingFields.length > 0) {
      console.error('PhonePe Create Order - Missing Fields:', missingFields);
      return res.status(400).json({ success: false, message: `Missing required fields: ${missingFields.join(', ')}` });
    }

    const env = process.env.PHONEPE_ENV || 'sandbox';
    const frontendUrl = process.env.FRONTEND_URL;
    const backendUrl = process.env.BACKEND_URL;

    // Use orderId as transactionId
    const merchantOrderId = `MT${Date.now()}${Math.random().toString(36).substr(2, 6)}`;

    // Create Order in DB first
    // Map paymentStatus to valid enum values (if provided), or default to Pending
    let statusToUse = 'pending';

    // Support both address as string (street) and as object
    let addressObj;
    if (typeof req.body.address === 'object' && req.body.address !== null) {
      addressObj = {
        street: req.body.address.street || '',
        city: req.body.address.city || req.body.city || '',
        state: req.body.address.state || req.body.state || '',
        pincode: req.body.address.pincode || req.body.pincode || '',
        country: req.body.address.country || req.body.country || '',
      };
    } else {
      addressObj = {
        street: req.body.address || '',
        city: req.body.city || '',
        state: req.body.state || '',
        pincode: req.body.pincode || '',
        country: req.body.country || '',
      };
    }

    const newOrder = new Order({
      transactionId: merchantOrderId,
      customerName,
      email,
      phone,
      address: addressObj,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus: 'pending', // Pending payment
      orderStatus: 'waiting_payment', // Custom status for waiting
      upfrontAmount: upfrontAmount || 0,
      remainingAmount: remainingAmount || 0,
      sellerToken,
      agentCode,
      couponCode,
      shippingCost,
      codExtraCharge
    });

    await newOrder.save();

    const accessToken = await getPhonePeToken();
    const baseUrl = env === 'production'
      ? 'https://api.phonepe.com/apis/pg'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    const apiEndpoint = '/checkout/v2/pay';

    const payload = {
      merchantOrderId: merchantOrderId,
      amount: Math.round(finalTotal * 100), // Use finalTotal! validation checks amount
      expireAfter: 1200,
      metaInfo: {
        udf1: customerName,
        udf2: email,
        udf3: phone,
        udf4: sellerToken || '',
        udf5: agentCode || '',
        orderId: newOrder._id.toString()
      },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: `Payment for order ${merchantOrderId}`,
        merchantUrls: {
          redirectUrl: `${frontendUrl.replace(/\/+$/, '')}/payment/status?orderId=${merchantOrderId}`,
          // Set callback to our webhook
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
      // Update with PhonePe's orderId if needed, but we used merchantOrderId as key
      newOrder.transactionId = response.data.orderId; // store PhonePe ID as transactionId? Or keep merchantOrderId?
      // Let's store PhonePe orderId in a separate field if possible, or swap.
      // Based on Schema: transactionId is generic. Let's keep merchantOrderId locally.
      // Actually, response.data.orderId IS the merchantOrderId we sent!
      // PhonePe returns the SAME orderId we sent as `orderId`.
      // So no need to update transactionId if we saved it as merchantOrderId.

      // Just update status if needed
      await newOrder.save();

      return res.json({
        success: true,
        redirectUrl: response.data.redirectUrl,
        orderId: merchantOrderId, // Returning OUR ID
        merchantOrderId: merchantOrderId,
        orderData: newOrder // Return saved order
      });
    } else {
      await Order.findByIdAndDelete(newOrder._id); // Cleanup failed order
      return res.status(500).json({ success: false, message: 'Payment initiation failed' });
    }

  } catch (error) {
    console.error('PhonePe init error:', error);
    // Return detailed error if available, else generic
    const errorMessage = error.message || 'Payment initiation failed';
    const statusCode = error.name === 'ValidationError' ? 400 : 500;
    return res.status(statusCode).json({ success: false, message: errorMessage, error: error.toString() });
  }
};

exports.phonePeCallback = async (req, res) => {
  try {
    console.log('PhonePe Webhook Received');

    // PhonePe sends the payload as a Base64 encoded string in the 'response' field
    const { response } = req.body;

    if (!response) {
      console.error('Invalid Callback: No response field');
      return res.status(400).send('Invalid Callback');
    }

    // Decode Base64
    const decodedBuffer = Buffer.from(response, 'base64');
    const decodedString = decodedBuffer.toString('utf-8');
    const decodedData = JSON.parse(decodedString);

    console.log('PhonePe Webhook Decoded Data:', JSON.stringify(decodedData, null, 2));

    const { code, data } = decodedData;
    const { merchantTransactionId, state } = data || {};

    // In our createPhonePeOrder, we used merchantOrderId as the transactionId
    const idToSearch = merchantTransactionId;

    if (!idToSearch) {
      console.error('Invalid Callback: No merchantTransactionId');
      return res.status(400).send('Invalid Data');
    }

    // Find by transactionId
    const order = await Order.findOne({ transactionId: idToSearch });
    if (!order) {
      console.error(`Order not found for transactionId: ${idToSearch}`);
      return res.status(404).send('Order not found');
    }

    // Verify status with PhonePe API (Double Check Strategy)
    // This protects against spoofed webhooks because we don't just trust the webhook data
    const accessToken = await getPhonePeToken();
    const env = process.env.PHONEPE_ENV || 'sandbox';
    const baseUrl = env === 'production' ? 'https://api.phonepe.com/apis/pg' : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

    const statusResponse = await axios.get(
      `${baseUrl}/checkout/v2/order/${idToSearch}/status`,
      { headers: { Authorization: `O-Bearer ${accessToken}` } }
    );

    const checkState = statusResponse.data.state; // COMPLETED, FAILED

    console.log(`Verifying Order ${idToSearch}: Webhook State [${state}], API State [${checkState}]`);

    if (checkState === 'COMPLETED') {
      if (order.paymentStatus !== 'completed') {
        order.paymentStatus = 'completed';
        order.orderStatus = 'processing';
        await order.save();
        // Finalize (stock, email)
        await finalizeOrder(order);
        console.log(`Order ${idToSearch} marked as COMPLETED via Webhook`);
      } else {
        console.log(`Order ${idToSearch} is already COMPLETED`);
      }
    } else if (checkState === 'FAILED') {
      if (order.paymentStatus !== 'failed') {
        order.paymentStatus = 'failed';
        await order.save();
        console.log(`Order ${idToSearch} marked as FAILED via Webhook`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Error');
  }
};


exports.getPhonePeStatus = async (req, res) => {
  try {
    // Accept both merchantOrderId and orderId, but use orderId for status check
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'PhonePe orderId (transaction ID) is required'
      });
    }
    const env = process.env.PHONEPE_ENV || 'sandbox';
    const accessToken = await getPhonePeToken();
    const baseUrl = env === 'production'
      ? 'https://api.phonepe.com/apis/pg'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    const apiEndpoint = `/checkout/v2/order/${orderId}/status`;
    console.log(`Checking PhonePe status for orderId: ${orderId}`);
    console.log(`API URL: ${baseUrl}${apiEndpoint}`);
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
    console.log('PhonePe status response:', response.data);
    // Only COMPLETED is considered success; all others are not
    // Try to extract merchantOrderId from metaInfo if available
    let merchantOrderId = null;
    if (response.data && response.data.metaInfo && response.data.metaInfo.merchantOrderId) {
      merchantOrderId = response.data.metaInfo.merchantOrderId;
    } else if (response.data && response.data.orderId) {
      // Optionally, look up merchantOrderId from your DB if you store the mapping
      // merchantOrderId = await lookupMerchantOrderId(response.data.orderId);
    }
    if (response.data && response.data.state) {
      return res.json({
        success: response.data.state === 'COMPLETED',
        data: {
          orderId: response.data.orderId,
          merchantOrderId,
          state: response.data.state,
          amount: response.data.amount,
          expireAt: response.data.expireAt,
          paymentDetails: response.data.paymentDetails || [],
          errorCode: response.data.errorCode,
          detailedErrorCode: response.data.detailedErrorCode,
          errorContext: response.data.errorContext
        },
        message: response.data.state === 'COMPLETED' ? 'Payment completed' : (response.data.state === 'FAILED' ? 'Payment failed' : 'Payment pending')
      });
    } else if (response.data && response.data.success === false) {
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to get transaction status',
        code: response.data.code
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid response from PhonePe'
      });
    }
  } catch (error) {
    const phonePeError = error.response?.data;
    console.error('PhonePe status check error:', phonePeError || error.message);
    if (phonePeError && typeof phonePeError === 'object') {
      return res.status(error.response.status || 500).json({
        success: false,
        message: phonePeError.message || 'PhonePe error',
        code: phonePeError.code,
        data: phonePeError.data || null
      });
    }
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    } else if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed'
      });
    } else if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        message: 'Request timeout'
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to check transaction status'
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

    const env = process.env.PHONEPE_ENV || 'sandbox';
    const accessToken = await getPhonePeToken();

    const baseUrl = env === 'production'
      ? 'https://api.phonepe.com/apis/pg'
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

    const env = process.env.PHONEPE_ENV || 'sandbox';
    const accessToken = await getPhonePeToken();

    const baseUrl = env === 'production'
      ? 'https://api.phonepe.com/apis/pg'
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