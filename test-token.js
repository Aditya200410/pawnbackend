const jwt = require('jsonwebtoken');

// Test JWT token generation and verification
function testJWTToken() {
  // Check if JWT_SECRET_SELLER is set
  if (!process.env.JWT_SECRET_SELLER) {
    console.log('JWT_SECRET_SELLER is not set. Generating a test one...');
    process.env.JWT_SECRET_SELLER = require('crypto').randomBytes(64).toString('hex');
  }

  console.log('JWT_SECRET_SELLER:', process.env.JWT_SECRET_SELLER ? 'SET' : 'NOT SET');

  // Create a test seller payload
  const testSeller = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test@example.com'
  };

  try {
    // Generate token
    const token = jwt.sign(
      { id: testSeller._id, email: testSeller.email, type: 'seller' },
      process.env.JWT_SECRET_SELLER,
      { expiresIn: '30d' }
    );

    console.log('Generated token:', token);

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET_SELLER);
    console.log('Decoded token:', decoded);

    // Check token type
    if (decoded.type === 'seller') {
      console.log('✅ Token type verification passed');
    } else {
      console.log('❌ Token type verification failed');
    }

    console.log('✅ JWT token generation and verification working correctly');

  } catch (error) {
    console.error('❌ JWT token test failed:', error.message);
  }
}

testJWTToken(); 