const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:5000';

async function testUpload() {
  console.log('🧪 Testing File Upload Functionality');
  console.log('====================================');
  console.log('');

  try {
    // Create a test image file (1x1 pixel PNG)
    const testImagePath = path.join(__dirname, 'test-image.png');
    const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(testImagePath, testImageData);

    console.log('📁 Created test image file');

    // Create FormData
    const formData = new FormData();
    
    // Add product data
    formData.append('name', 'Test Product');
    formData.append('price', '999.99');
    formData.append('regularPrice', '1299.99');
    formData.append('category', 'Test Category');
    formData.append('description', 'This is a test product for upload functionality');
    formData.append('color', 'Test Color');
    formData.append('size', 'Test Size');
    formData.append('rating', '4.5');
    formData.append('reviews', '10');
    formData.append('inStock', 'true');

    // Add main image
    formData.append('mainImage', fs.createReadStream(testImagePath), {
      filename: 'test-main-image.png',
      contentType: 'image/png'
    });

    // Add additional image
    formData.append('image1', fs.createReadStream(testImagePath), {
      filename: 'test-additional-image.png',
      contentType: 'image/png'
    });

    console.log('📤 Sending upload request...');

    // Make the request
    const response = await axios.post(`${API_BASE_URL}/api/shop/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000, // 30 second timeout
    });

    console.log('✅ Upload successful!');
    console.log('Response status:', response.status);
    console.log('Product created:', response.data.product);
    console.log('Uploaded files:', Object.keys(response.data.uploadedFiles));

    // Clean up test file
    fs.unlinkSync(testImagePath);
    console.log('🧹 Cleaned up test file');

    console.log('');
    console.log('🎉 File upload test completed successfully!');

  } catch (error) {
    console.error('❌ Upload test failed!');
    console.error('Error:', error.response?.data || error.message);
    console.error('Status:', error.response?.status);
    console.error('Headers:', error.response?.headers);
    
    if (error.response?.data?.details) {
      console.error('Details:', error.response.data.details);
    }
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/shop`);
    console.log('✅ Server is running and accessible');
    return true;
  } catch (error) {
    console.error('❌ Server is not running or not accessible');
    console.error('Make sure to start the server with: node server.js');
    return false;
  }
}

async function runTest() {
  console.log('🔍 Checking server status...');
  const serverRunning = await checkServer();
  
  if (serverRunning) {
    await testUpload();
  }
}

runTest(); 