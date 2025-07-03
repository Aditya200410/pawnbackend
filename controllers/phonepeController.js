const axios = require('axios');
const crypto = require('crypto');

// Helper to generate X-VERIFY header for PhonePe
function generateXVerify(payload, apiEndpoint, clientSecret) {
  // PhonePe: base64(payload) + "/pg/v1/pay" + clientSecret, then SHA256, then append '###1'
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const stringToHash = base64Payload + apiEndpoint + clientSecret;
  const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
  return sha256 + '###1';
}

// Helper for X-VERIFY for status check
function generateStatusXVerify(apiEndpoint, clientSecret) {
  const stringToHash = apiEndpoint + clientSecret;
  const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
  return sha256 + '###1';
}

// POST /api/payment/phonepe
exports.createPhonePeOrder = async (req, res) => {
  try {
    const { amount, customerName, email, phone } = req.body;
    const clientId = process.env.PHONEPE_CLIENT_ID;
    const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
    const env = process.env.PHONEPE_ENV || 'sandbox';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // PhonePe API endpoint
    const apiEndpoint = '/pg/v1/pay';
    const phonepeBaseUrl = env === 'production'
      ? 'https://api.phonepe.com'
      : 'https://api-preprod.phonepe.com';

    // Prepare payload as per PhonePe docs
    const merchantTransactionId = `txn_${Date.now()}`;
    const payload = {
      merchantId: clientId,
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

    // Generate X-VERIFY header
    const xVerify = generateXVerify(payload, apiEndpoint, clientSecret);
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

    // Make PhonePe API call
    const response = await axios.post(
      phonepeBaseUrl + apiEndpoint,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': clientId,
        },
      }
    );

    // Handle PhonePe response
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
    const clientId = process.env.PHONEPE_CLIENT_ID;
    const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
    const env = process.env.PHONEPE_ENV || 'sandbox';

    const apiEndpoint = `/pg/v1/status/${clientId}/${transactionId}`;
    const phonepeBaseUrl = env === 'production'
      ? 'https://api.phonepe.com'
      : 'https://api-preprod.phonepe.com';

    const xVerify = generateStatusXVerify(apiEndpoint, clientSecret);

    const response = await axios.get(
      phonepeBaseUrl + apiEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': clientId,
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
// PHONEPE_CLIENT_ID=your_client_id
// PHONEPE_CLIENT_SECRET=your_client_secret
// PHONEPE_ENV=sandbox
// FRONTEND_URL=http://localhost:3000 (or your deployed frontend) 