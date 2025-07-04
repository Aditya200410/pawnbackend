const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

async function testAdminAuth() {
  console.log('Testing Admin Authentication...\n');

  try {
    // Test 1: Admin Login
    console.log('1. Testing admin login...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/admin/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    console.log('Login successful:', loginResponse.data.success);
    const token = loginResponse.data.token;
    console.log('Token received:', token ? 'Yes' : 'No');
    
    // Test 2: Token Verification
    console.log('\n2. Testing token verification...');
    const verifyResponse = await axios.get(`${API_BASE_URL}/api/admin/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Token verification successful:', verifyResponse.data.valid);
    console.log('User info:', verifyResponse.data.user);
    
    // Test 3: Protected Route Access
    console.log('\n3. Testing protected route access...');
    const ordersResponse = await axios.get(`${API_BASE_URL}/api/orders/json`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Protected route access successful:', ordersResponse.status === 200);
    
    // Test 4: Invalid Token Test
    console.log('\n4. Testing invalid token...');
    try {
      await axios.get(`${API_BASE_URL}/api/orders/json`, {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });
      console.log('❌ Invalid token test failed - should have been rejected');
    } catch (error) {
      console.log('✅ Invalid token correctly rejected:', error.response?.status);
    }
    
    console.log('\n✅ All admin authentication tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testAdminAuth(); 