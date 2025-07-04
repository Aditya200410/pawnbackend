const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

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
    const env = process.env.PHONEPE_ENV || 'sandbox';
    const frontendUrl = process.env.FRONTEND_URL;
    const backendUrl = process.env.BACKEND_URL;

    // Basic validation
    if (!merchantId || !merchantSecret || !frontendUrl || !backendUrl) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway configuration missing in environment variables',
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount provided' 
      });
    }

    // Set base URL
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/hermes' 
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

    const apiEndpoint = '/pg/v1/pay';

    const merchantTransactionId = `MT${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
    const merchantUserId = email || phone || `MU${Date.now()}`;

    const payload = {
      merchantId: merchantId,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: merchantUserId,
      amount: Math.round(amount * 100),
      redirectUrl: `${frontendUrl.replace(/\/+$/, '')}/payment/success?transactionId=${merchantTransactionId}`,
      redirectMode: 'POST',
      callbackUrl: `${backendUrl.replace(/\/+$/, '')}/api/payment/phonepe/callback`,
      paymentInstrument: {
        type: 'PAY_PAGE'
      },
      mobileNumber: phone,
      merchantOrderId: merchantTransactionId,
      message: `Payment for order ${merchantTransactionId}`,
      shortName: customerName,
      name: customerName,
      email: email
    };

    // Generate base64 payload
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

    // Generate X-VERIFY header (based on base64Payload!)
    const stringToHash = base64Payload + apiEndpoint + merchantSecret;
    const xVerify = crypto.createHash('sha256').update(stringToHash).digest('hex') + '###1';

    console.log(`Making PhonePe API request to: ${baseUrl}${apiEndpoint}`);
    
    const response = await axios.post(
      baseUrl + apiEndpoint,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-CLIENT-ID': merchantId
        },
        timeout: 30000
      }
    );

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

        return res.json({ 
          success: true, 
          redirectUrl,
          transactionId: merchantTransactionId,
          orderData 
        });
      } else {
        return res.status(500).json({ 
          success: false, 
          message: 'PhonePe did not return a redirect URL.',
          data: response.data 
        });
      }
    } else {
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
    const { merchantTransactionId, transactionId, amount, status, code, merchantId } = req.body;
    
    console.log('PhonePe callback received:', req.body);
    
    // Verify the callback data
    if (!merchantTransactionId || !status) {
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
    console.log(`Payment ${status} for transaction: ${merchantTransactionId}`);
    
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
    
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const merchantSecret = process.env.PHONEPE_CLIENT_SECRET;
    const env = process.env.PHONEPE_ENV || 'sandbox';
    
    // Set base URL
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/hermes' 
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    
    const apiEndpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
    
    // Generate X-VERIFY header
    const stringToHash = apiEndpoint + merchantSecret;
    const xVerify = crypto.createHash('sha256').update(stringToHash).digest('hex') + '###1';
    
    const response = await axios.get(
      baseUrl + apiEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-CLIENT-ID': merchantId
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
