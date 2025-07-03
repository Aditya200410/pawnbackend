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
    const { amount, customerName, email, phone } = req.body;
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const merchantSecret = process.env.PHONEPE_CLIENT_SECRET;
    const env = process.env.PHONEPE_ENV || 'sandbox';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const apiEndpoint = '/pg/v1/pay';
    const phonepeBaseUrl = env === 'production'
      ? 'https://api.phonepe.com'
      : 'https://api-preprod.phonepe.com';

    const merchantTransactionId = `txn_${Date.now()}`;
    const payload = {
      merchantId, // Use merchantId from env
      merchantTransactionId,
      merchantUserId: email || phone,
      amount: Math.round(amount * 100), // paise
      redirectUrl: `${frontendUrl}/payment/success`,
      redirectMode: 'POST',
      callbackUrl: `${frontendUrl}/payment/success`,
      paymentInstrument: {
        type: 'PAY_PAGE',
      },
    };

    const xVerify = generateXVerify(payload, apiEndpoint, merchantSecret);
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

    const response = await axios.post(
      phonepeBaseUrl + apiEndpoint,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': merchantId, // Use merchantId in header
        },
      }
    );

    if (response.data && response.data.success && response.data.data && response.data.data.instrumentResponse && response.data.data.instrumentResponse.redirectInfo && response.data.data.instrumentResponse.redirectInfo.url) {
      const redirectUrl = response.data.data.instrumentResponse.redirectInfo.url;
      return res.json({ success: true, redirectUrl });
    } else {
      return res.status(500).json({ success: false, message: 'Failed to get PhonePe redirect URL', data: response.data });
    }
  } catch (error) {
    console.error('PhonePe order error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to create PhonePe order', error: error.response?.data || error.message });
  }
};

// GET /api/payment/phonepe/status/:transactionId
exports.getPhonePeStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const merchantSecret = process.env.PHONEPE_CLIENT_SECRET;
    const env = process.env.PHONEPE_ENV || 'sandbox';

    const apiEndpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
    const phonepeBaseUrl = env === 'production'
      ? 'https://api.phonepe.com'
      : 'https://api-preprod.phonepe.com';

    const xVerify = generateStatusXVerify(apiEndpoint, merchantSecret);

    const response = await axios.get(
      phonepeBaseUrl + apiEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': merchantId, // Use merchantId in header
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('PhonePe status error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to verify PhonePe payment', error: error.response?.data || error.message });
  }
};

// .env variables to add:
// PHONEPE_MERCHANT_ID=your_merchant_id
// PHONEPE_CLIENT_SECRET=your_client_secret
// PHONEPE_ENV=sandbox
// FRONTEND_URL=http://localhost:3000 (or your deployed frontend) 