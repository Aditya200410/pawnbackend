const axios = require('axios');

// Load credentials from environment variables
const PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID;
const PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET;
const PHONEPE_CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '1';
const PHONEPE_ENV = process.env.PHONEPE_ENV || 'production';

// PhonePe API endpoints
const PHONEPE_AUTH_URL = 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';
const PHONEPE_PAY_URL = 'https://api.phonepe.com/apis/pg/checkout/v2/pay';
const PHONEPE_STATUS_URL = 'https://api.phonepe.com/apis/pg/checkout/v2/order/'; // Append {merchantOrderId}/status

let phonepeToken = null;
let tokenExpiresAt = 0;

// Helper: Get or refresh PhonePe access token
async function getPhonePeToken() {
  const now = Math.floor(Date.now() / 1000);
  if (phonepeToken && tokenExpiresAt > now + 60) {
    return phonepeToken;
  }
  const params = new URLSearchParams();
  params.append('client_id', PHONEPE_CLIENT_ID);
  params.append('client_version', PHONEPE_CLIENT_VERSION);
  params.append('client_secret', PHONEPE_CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');
  const { data } = await axios.post(PHONEPE_AUTH_URL, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  phonepeToken = data.access_token;
  tokenExpiresAt = data.expires_at;
  return phonepeToken;
}

// POST /api/payment/phonepe
exports.createPhonePeOrder = async (req, res) => {
  try {
    const token = await getPhonePeToken();
    const { merchantOrderId, amount, metaInfo, redirectUrl } = req.body;
    const payload = {
      merchantOrderId,
      amount,
      expireAfter: 1200,
      metaInfo: metaInfo || {},
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl },
      },
    };
    const { data } = await axios.post(PHONEPE_PAY_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `O-Bearer ${token}`,
      },
    });
    if (data && data.redirectUrl && data.orderId) {
      res.json({ success: true, redirectUrl: data.redirectUrl, orderId: data.orderId });
    } else {
      res.status(400).json({ success: false, message: 'Failed to create PhonePe order', data });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/payment/phonepe/status/:merchantOrderId
exports.getPhonePeStatus = async (req, res) => {
  try {
    const token = await getPhonePeToken();
    const { merchantOrderId } = req.params;
    const url = `${PHONEPE_STATUS_URL}${merchantOrderId}/status`;
    const { data } = await axios.get(url, {
      headers: {
        Authorization: `O-Bearer ${token}`,
      },
    });
    res.json({ success: true, status: data.state, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/payment/phonepe/callback
exports.phonePeCallback = async (req, res) => {
  // Implement callback verification if needed (PhonePe will POST here after payment)
  // For now, just log and acknowledge
  console.log('PhonePe callback received:', req.body);
  res.status(200).json({ success: true });
};

// Refund and refund status handlers (optional, stubbed)
exports.refundPayment = (req, res) => {
  res.status(501).json({ success: false, message: 'Refund not implemented' });
};
exports.getRefundStatus = (req, res) => {
  res.status(501).json({ success: false, message: 'Refund status not implemented' });
};

