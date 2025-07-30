const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

// Test admin credentials update
async function testAdminCredentialsUpdate() {
  try {
    console.log('Testing admin credentials update...');
    
    // First, login to get a token
    const loginResponse = await axios.post(`${API_BASE_URL}/admin/auth/login`, {
      email: 'admin@example.com', // Replace with actual admin email
      password: 'admin123' // Replace with actual admin password
    });
    
    const token = loginResponse.data.token;
    console.log('Login successful, token obtained');
    
    // Test updating credentials
    const updateResponse = await axios.put(`${API_BASE_URL}/admin/auth/update-credentials`, {
      username: 'newadmin',
      email: 'newadmin@example.com',
      currentPassword: 'admin123',
      newPassword: 'newpassword123'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Credentials update successful:', updateResponse.data);
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testAdminCredentialsUpdate(); 