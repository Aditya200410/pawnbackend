const http = require('http');

const postData = JSON.stringify({
  businessName: 'Test Business',
  email: 'test@example.com',
  password: 'password123',
  phone: '1234567890',
  address: 'Test Address',
  businessType: 'Test Type',
  accountHolderName: 'Test Holder',
  bankAccountNumber: '1234567890',
  ifscCode: 'TEST0001234',
  bankName: 'Test Bank'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/seller/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log('Response status:', res.statusCode);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const jsonData = JSON.parse(data);
      console.log('Response data:', JSON.stringify(jsonData, null, 2));
    } catch (error) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(postData);
req.end(); 