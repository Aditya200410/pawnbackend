const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// PhonePe Integration Test Script
// Based on official documentation: https://developer.phonepe.com/v1/reference/pay-api

// Test configuration
const TEST_CONFIG = {
  merchantId: process.env.PHONEPE_MERCHANT_ID || 'MERCHANTUAT',
  merchantSecret: process.env.PHONEPE_CLIENT_SECRET || '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
  env: process.env.PHONEPE_ENV || 'sandbox',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL || 'https://pawnbackend-xmqa.onrender.com'
};

// Helper to generate X-VERIFY header
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

// Test 1: Basic Pay API Request
async function testBasicPayAPI() {
  console.log('\n=== Test 1: Basic Pay API Request ===');
  
  const baseUrl = TEST_CONFIG.env === 'production' 
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  
  const apiEndpoint = '/pg/v1/pay';
  
  const merchantTransactionId = `MT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const merchantUserId = `MU${Date.now()}`;
  
  const payload = {
    merchantId: TEST_CONFIG.merchantId,
    merchantTransactionId: merchantTransactionId,
    merchantUserId: merchantUserId,
    amount: 10000, // 100 rupees in paise
    redirectUrl: `${TEST_CONFIG.frontendUrl}/payment/success?transactionId=${merchantTransactionId}`,
    redirectMode: 'POST',
    callbackUrl: `${TEST_CONFIG.backendUrl}/api/payment/phonepe/callback`,
    paymentInstrument: {
      type: 'PAY_PAGE'
    },
    mobileNumber: '9999999999',
    merchantOrderId: merchantTransactionId,
    message: `Payment for order ${merchantTransactionId}`,
    shortName: 'Test User',
    name: 'Test User',
    email: 'test@example.com'
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify = generateXVerify(payload, apiEndpoint, TEST_CONFIG.merchantSecret);

  console.log('Request URL:', baseUrl + apiEndpoint);
  console.log('Merchant ID:', TEST_CONFIG.merchantId);
  console.log('Transaction ID:', merchantTransactionId);
  console.log('Amount:', payload.amount, 'paise (₹100)');
  console.log('X-VERIFY:', xVerify);

  try {
    const response = await axios.post(
      baseUrl + apiEndpoint,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify
        },
        timeout: 30000
      }
    );

    console.log('✅ Pay API Request Successful!');
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    return {
      success: true,
      transactionId: merchantTransactionId,
      response: response.data
    };
  } catch (error) {
    console.log('❌ Pay API Request Failed!');
    console.log('Error Status:', error.response?.status);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    
    return {
      success: false,
      transactionId: merchantTransactionId,
      error: error.response?.data || error.message
    };
  }
}

// Test 2: Status Check API
async function testStatusCheckAPI(transactionId) {
  console.log('\n=== Test 2: Status Check API ===');
  
  const baseUrl = TEST_CONFIG.env === 'production' 
    ? 'https://api.phonepe.com'
    : 'https://api-preprod.phonepe.com';
  
  const statusEndpoint = `/pg/v1/status/${TEST_CONFIG.merchantId}/${transactionId}`;
  const xVerify = generateStatusXVerify(statusEndpoint, TEST_CONFIG.merchantSecret);

  console.log('Request URL:', baseUrl + statusEndpoint);
  console.log('Transaction ID:', transactionId);
  console.log('X-VERIFY:', xVerify);

  try {
    const response = await axios.get(
      baseUrl + statusEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify
        },
        timeout: 30000
      }
    );

    console.log('✅ Status Check API Successful!');
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    return {
      success: true,
      response: response.data
    };
  } catch (error) {
    console.log('❌ Status Check API Failed!');
    console.log('Error Status:', error.response?.status);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

// Test 3: UPI Intent Flow
async function testUPIIntentFlow() {
  console.log('\n=== Test 3: UPI Intent Flow ===');
  
  const baseUrl = TEST_CONFIG.env === 'production' 
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  
  const apiEndpoint = '/pg/v1/pay';
  
  const merchantTransactionId = `MT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const merchantUserId = `MU${Date.now()}`;
  
  const payload = {
    merchantId: TEST_CONFIG.merchantId,
    merchantTransactionId: merchantTransactionId,
    merchantUserId: merchantUserId,
    amount: 10000,
    callbackUrl: `${TEST_CONFIG.backendUrl}/api/payment/phonepe/callback`,
    mobileNumber: '9999999999',
    deviceContext: {
      deviceOS: 'ANDROID'
    },
    paymentInstrument: {
      type: 'UPI_INTENT',
      targetApp: 'com.phonepe.app'
    }
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify = generateXVerify(payload, apiEndpoint, TEST_CONFIG.merchantSecret);

  console.log('Request URL:', baseUrl + apiEndpoint);
  console.log('Transaction ID:', merchantTransactionId);
  console.log('Payment Type: UPI_INTENT');
  console.log('X-VERIFY:', xVerify);

  try {
    const response = await axios.post(
      baseUrl + apiEndpoint,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify
        },
        timeout: 30000
      }
    );

    console.log('✅ UPI Intent Flow Successful!');
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    return {
      success: true,
      transactionId: merchantTransactionId,
      response: response.data
    };
  } catch (error) {
    console.log('❌ UPI Intent Flow Failed!');
    console.log('Error Status:', error.response?.status);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    
    return {
      success: false,
      transactionId: merchantTransactionId,
      error: error.response?.data || error.message
    };
  }
}

// Test 4: UPI Collect Flow
async function testUPICollectFlow() {
  console.log('\n=== Test 4: UPI Collect Flow ===');
  
  const baseUrl = TEST_CONFIG.env === 'production' 
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  
  const apiEndpoint = '/pg/v1/pay';
  
  const merchantTransactionId = `MT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const merchantUserId = `MU${Date.now()}`;
  
  const payload = {
    merchantId: TEST_CONFIG.merchantId,
    merchantTransactionId: merchantTransactionId,
    merchantUserId: merchantUserId,
    amount: 10000,
    callbackUrl: `${TEST_CONFIG.backendUrl}/api/payment/phonepe/callback`,
    mobileNumber: '9999999999',
    paymentInstrument: {
      type: 'UPI_COLLECT'
    }
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify = generateXVerify(payload, apiEndpoint, TEST_CONFIG.merchantSecret);

  console.log('Request URL:', baseUrl + apiEndpoint);
  console.log('Transaction ID:', merchantTransactionId);
  console.log('Payment Type: UPI_COLLECT');
  console.log('X-VERIFY:', xVerify);

  try {
    const response = await axios.post(
      baseUrl + apiEndpoint,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify
        },
        timeout: 30000
      }
    );

    console.log('✅ UPI Collect Flow Successful!');
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    return {
      success: true,
      transactionId: merchantTransactionId,
      response: response.data
    };
  } catch (error) {
    console.log('❌ UPI Collect Flow Failed!');
    console.log('Error Status:', error.response?.status);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    
    return {
      success: false,
      transactionId: merchantTransactionId,
      error: error.response?.data || error.message
    };
  }
}

// Test 5: Card Payment Flow
async function testCardPaymentFlow() {
  console.log('\n=== Test 5: Card Payment Flow ===');
  
  const baseUrl = TEST_CONFIG.env === 'production' 
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  
  const apiEndpoint = '/pg/v1/pay';
  
  const merchantTransactionId = `MT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const merchantUserId = `MU${Date.now()}`;
  
  const payload = {
    merchantId: TEST_CONFIG.merchantId,
    merchantTransactionId: merchantTransactionId,
    merchantUserId: merchantUserId,
    amount: 10000,
    redirectUrl: `${TEST_CONFIG.frontendUrl}/payment/success?transactionId=${merchantTransactionId}`,
    redirectMode: 'POST',
    callbackUrl: `${TEST_CONFIG.backendUrl}/api/payment/phonepe/callback`,
    paymentInstrument: {
      type: 'CARD',
      card: {
        number: '4111111111111111',
        expiryMonth: '12',
        expiryYear: '25',
        cvv: '123'
      }
    },
    mobileNumber: '9999999999'
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify = generateXVerify(payload, apiEndpoint, TEST_CONFIG.merchantSecret);

  console.log('Request URL:', baseUrl + apiEndpoint);
  console.log('Transaction ID:', merchantTransactionId);
  console.log('Payment Type: CARD');
  console.log('X-VERIFY:', xVerify);

  try {
    const response = await axios.post(
      baseUrl + apiEndpoint,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify
        },
        timeout: 30000
      }
    );

    console.log('✅ Card Payment Flow Successful!');
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    return {
      success: true,
      transactionId: merchantTransactionId,
      response: response.data
    };
  } catch (error) {
    console.log('❌ Card Payment Flow Failed!');
    console.log('Error Status:', error.response?.status);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    
    return {
      success: false,
      transactionId: merchantTransactionId,
      error: error.response?.data || error.message
    };
  }
}

// Test 6: Net Banking Flow
async function testNetBankingFlow() {
  console.log('\n=== Test 6: Net Banking Flow ===');
  
  const baseUrl = TEST_CONFIG.env === 'production' 
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  
  const apiEndpoint = '/pg/v1/pay';
  
  const merchantTransactionId = `MT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const merchantUserId = `MU${Date.now()}`;
  
  const payload = {
    merchantId: TEST_CONFIG.merchantId,
    merchantTransactionId: merchantTransactionId,
    merchantUserId: merchantUserId,
    amount: 10000,
    redirectUrl: `${TEST_CONFIG.frontendUrl}/payment/success?transactionId=${merchantTransactionId}`,
    redirectMode: 'POST',
    callbackUrl: `${TEST_CONFIG.backendUrl}/api/payment/phonepe/callback`,
    paymentInstrument: {
      type: 'NET_BANKING'
    },
    mobileNumber: '9999999999'
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify = generateXVerify(payload, apiEndpoint, TEST_CONFIG.merchantSecret);

  console.log('Request URL:', baseUrl + apiEndpoint);
  console.log('Transaction ID:', merchantTransactionId);
  console.log('Payment Type: NET_BANKING');
  console.log('X-VERIFY:', xVerify);

  try {
    const response = await axios.post(
      baseUrl + apiEndpoint,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify
        },
        timeout: 30000
      }
    );

    console.log('✅ Net Banking Flow Successful!');
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    return {
      success: true,
      transactionId: merchantTransactionId,
      response: response.data
    };
  } catch (error) {
    console.log('❌ Net Banking Flow Failed!');
    console.log('Error Status:', error.response?.status);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    
    return {
      success: false,
      transactionId: merchantTransactionId,
      error: error.response?.data || error.message
    };
  }
}

// Test 7: X-VERIFY Header Validation
async function testXVerifyValidation() {
  console.log('\n=== Test 7: X-VERIFY Header Validation ===');
  
  const baseUrl = TEST_CONFIG.env === 'production' 
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  
  const apiEndpoint = '/pg/v1/pay';
  
  const merchantTransactionId = `MT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const merchantUserId = `MU${Date.now()}`;
  
  const payload = {
    merchantId: TEST_CONFIG.merchantId,
    merchantTransactionId: merchantTransactionId,
    merchantUserId: merchantUserId,
    amount: 10000,
    redirectUrl: `${TEST_CONFIG.frontendUrl}/payment/success?transactionId=${merchantTransactionId}`,
    redirectMode: 'POST',
    callbackUrl: `${TEST_CONFIG.backendUrl}/api/payment/phonepe/callback`,
    paymentInstrument: {
      type: 'PAY_PAGE'
    },
    mobileNumber: '9999999999'
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  
  // Test with incorrect X-VERIFY
  const incorrectXVerify = 'incorrect_checksum###1';

  console.log('Request URL:', baseUrl + apiEndpoint);
  console.log('Transaction ID:', merchantTransactionId);
  console.log('Incorrect X-VERIFY:', incorrectXVerify);

  try {
    const response = await axios.post(
      baseUrl + apiEndpoint,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': incorrectXVerify
        },
        timeout: 30000
      }
    );

    console.log('❌ X-VERIFY Validation Failed - Should have rejected incorrect checksum!');
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    return {
      success: false,
      error: 'Incorrect X-VERIFY was accepted'
    };
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ X-VERIFY Validation Successful - Incorrect checksum rejected!');
      console.log('Error Status:', error.response.status);
      console.log('Error Data:', JSON.stringify(error.response.data, null, 2));
      
      return {
        success: true,
        error: error.response.data
      };
    } else {
      console.log('❌ X-VERIFY Validation - Unexpected error!');
      console.log('Error Status:', error.response?.status);
      console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
      
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting PhonePe API Integration Tests');
  console.log('Environment:', TEST_CONFIG.env);
  console.log('Merchant ID:', TEST_CONFIG.merchantId);
  console.log('Frontend URL:', TEST_CONFIG.frontendUrl);
  console.log('Backend URL:', TEST_CONFIG.backendUrl);
  
  const results = [];
  
  // Run all tests
  const test1 = await testBasicPayAPI();
  results.push({ test: 'Basic Pay API', ...test1 });
  
  if (test1.success && test1.transactionId) {
    // Wait a bit before checking status
    await new Promise(resolve => setTimeout(resolve, 2000));
    const test2 = await testStatusCheckAPI(test1.transactionId);
    results.push({ test: 'Status Check API', ...test2 });
  }
  
  const test3 = await testUPIIntentFlow();
  results.push({ test: 'UPI Intent Flow', ...test3 });
  
  const test4 = await testUPICollectFlow();
  results.push({ test: 'UPI Collect Flow', ...test4 });
  
  const test5 = await testCardPaymentFlow();
  results.push({ test: 'Card Payment Flow', ...test5 });
  
  const test6 = await testNetBankingFlow();
  results.push({ test: 'Net Banking Flow', ...test6 });
  
  const test7 = await testXVerifyValidation();
  results.push({ test: 'X-VERIFY Validation', ...test7 });
  
  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('========================');
  
  let passed = 0;
  let failed = 0;
  
  results.forEach(result => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${result.test}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${JSON.stringify(result.error)}`);
    }
    
    if (result.success) passed++;
    else failed++;
  });
  
  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! PhonePe integration is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testBasicPayAPI,
  testStatusCheckAPI,
  testUPIIntentFlow,
  testUPICollectFlow,
  testCardPaymentFlow,
  testNetBankingFlow,
  testXVerifyValidation,
  runAllTests
}; 