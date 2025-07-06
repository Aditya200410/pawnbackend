// Improved Express Auth Routes with better structure, security, and async handling
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const TempUser = require('../models/TempUser');
const axios = require('axios');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// Setup nodemailer transporter using only EMAIL_USER and EMAIL_PASS
const transporter = nodemailer.createTransport({
  service: 'gmail', // or leave blank for auto
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Middleware to protect routes
const auth = (req, res, next) => {
  // Check for token in Authorization header first
  let token = req.header('Authorization')?.replace('Bearer ', '');
  
  // If not in header, check cookies
  if (!token) {
    token = req.cookies?.token;
  }
  
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// GET /me - Get current user information
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(401).json({ message: 'Invalid user' });

    res.json({ user });
  } catch (err) {
    console.error('Error in /me route:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/validate-token', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(401).json({ message: 'Invalid user' });

    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper to send OTP via MSG91
async function sendOtpViaMsg91(phone, otp) {
  console.log('📤 Sending OTP via MSG91:', { phone, otp: otp ? '***' : 'undefined' });
  
  const apiKey = process.env.MSG91_API_KEY;
  
  console.log('🔧 MSG91 Configuration:', {
    apiKey: apiKey ? '✅ Set' : '❌ Missing'
  });

  if (!apiKey) {
    console.error('❌ MSG91 API key missing');
    throw new Error('MSG91 configuration incomplete');
  }

  const url = `https://api.msg91.com/api/v5/otp`;
  const payload = {
    mobile: phone,
    otp: otp
  };

  const headers = {
    'authkey': apiKey,
    'Content-Type': 'application/json'
  };

  try {
    console.log('📡 Making MSG91 API request to:', url);
    console.log('📋 Request payload:', { ...payload, otp: '***' });
    
    const response = await axios.post(url, payload, { headers });
    
    console.log('✅ MSG91 API response:', {
      status: response.status,
      data: response.data
    });
    
    return response.data;
  } catch (err) {
    console.error('❌ MSG91 OTP send error:', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status
    });
    throw new Error('Failed to send OTP via SMS');
  }
}

// POST /register (alias for /signup)
router.post('/register', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password || !phone) {
    return res.status(400).json({ message: 'Name, email, password, and phone are required' });
  }
  try {
    const existingUser = await User.findOne({ email });
    const existingTemp = await TempUser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    if (existingTemp) {
      return res.status(400).json({ message: 'OTP already sent to this email. Please verify OTP or wait 10 min.' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await TempUser.create({ username: name, email, password, phone, otp });
    console.log(`OTP for ${email} (${phone}): ${otp}`);
    // Send OTP via MSG91
    try {
      await sendOtpViaMsg91(phone, otp);
      console.log(`OTP SMS sent to ${phone}`);
    } catch (smsErr) {
      console.error('Error sending OTP SMS:', smsErr);
    }
    return res.json({ message: 'OTP sent to your phone', phone });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /verify-otp
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required' });
  }
  try {
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) {
      return res.status(400).json({ message: 'OTP expired or not found. Please register again.' });
    }
    if (tempUser.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    const user = new User({ name: tempUser.username, email: tempUser.email, password: tempUser.password, phone: tempUser.phone });
    await user.save();
    await TempUser.deleteOne({ _id: tempUser._id });
    return res.json({ message: 'OTP verified, registration complete. Please login.' });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /forgot-password (send OTP for password reset)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'No user found with this email' });
    }
    // Generate OTP and expiry
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    // Save OTP and expiry in TempUser (or create if not exists)
    let temp = await TempUser.findOne({ email });
    if (!temp) {
      temp = await TempUser.create({ email, otp, otpExpires: expiresAt });
    } else {
      temp.otp = otp;
      temp.otpExpires = expiresAt;
      await temp.save();
    }
    // Send OTP via email (nodemailer)
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}`,
      html: `<p>Your OTP for password reset is: <b>${otp}</b></p>`
    });
    return res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Error processing password reset request' });
  }
});

// POST /verify-forgot-otp (verify OTP and set new password)
router.post('/verify-forgot-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: 'Email, OTP, and new password are required' });
  }
  try {
    const temp = await TempUser.findOne({ email });
    if (!temp || temp.otp !== otp || !temp.otpExpires || temp.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'No user found with this email' });
    }
    user.password = newPassword;
    await user.save();
    await TempUser.deleteOne({ email });
    return res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    console.error('Verify forgot OTP error:', err);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

// POST /logout
router.post('/logout', async (req, res) => {
  try {
    // Clear the token cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Error in logout:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /register-with-msg91 - Register user with MSG91 token verification
router.post('/register-with-msg91', async (req, res) => {
  console.log('🔍 /register-with-msg91 endpoint called');
  console.log('📋 Request body:', {
    name: req.body.name ? '✅ Present' : '❌ Missing',
    email: req.body.email ? '✅ Present' : '❌ Missing',
    phone: req.body.phone ? '✅ Present' : '❌ Missing',
    hasPassword: !!req.body.password,
    hasToken: !!req.body.msg91Token
  });

  const { name, email, password, phone, msg91Token } = req.body;

  if (!name || !email || !password || !phone || !msg91Token) {
    console.error('❌ Missing required fields:', {
      name: !name,
      email: !email,
      password: !password,
      phone: !phone,
      msg91Token: !msg91Token
    });
    return res.status(400).json({ 
      message: 'All fields are required: name, email, password, phone, msg91Token' 
    });
  }

  try {
    // Check if user already exists
    console.log('🔍 Checking for existing user with email:', email);
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ User already exists with email:', email);
      return res.status(400).json({ message: 'Email already registered' });
    }

    console.log('✅ No existing user found, proceeding with verification');

    // Step 1: Verify the token from OTP widget using MSG91 API
    const verifyUrl = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';
    const apiKey = process.env.MSG91_API_KEY;

    console.log('🔧 MSG91 Verification Configuration:', {
      verifyUrl,
      apiKey: apiKey ? '✅ Set' : '❌ Missing',
      tokenLength: msg91Token?.length || 0
    });

    if (!apiKey) {
      console.error('❌ MSG91 API key not configured');
      return res.status(500).json({ 
        message: 'Server configuration error',
        details: 'MSG91 API key not configured'
      });
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const body = {
      authkey: apiKey,
      'access-token': msg91Token
    };

    console.log('📡 Making MSG91 verification request...');
    console.log('📋 Verification payload:', { ...body, authkey: '***' });

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    console.log('📥 MSG91 verification response status:', verifyResponse.status);

    const result = await verifyResponse.json();
    console.log('📥 MSG91 verification response:', result);

    // Check if OTP verification was successful
    if (!result || result.type !== 'success') {
      console.error('❌ MSG91 verification failed:', {
        result,
        type: result?.type,
        message: result?.message
      });
      return res.status(400).json({
        message: 'OTP verification failed',
        details: result?.message || 'Verification error'
      });
    }

    console.log('✅ MSG91 OTP verification passed');

    // Step 2: Save the user
    console.log('💾 Creating new user...');
    const user = new User({ name, email, password, phone });
    await user.save();

    console.log('✅ User created successfully:', {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone
    });

    return res.status(201).json({ 
      message: 'Registration successful with MSG91 OTP verification',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });

  } catch (err) {
    console.error('❌ Error in register-with-msg91:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ 
      message: 'Server error during registration',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// PUT /update-profile (Protected)
router.put('/update-profile', auth, async (req, res) => {
  const { name, email, phone, address, currentPassword, newPassword } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (address) user.address = address;

    // Handle password change securely
    if (currentPassword && newPassword) {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      user.password = newPassword; // Will be hashed by pre-save hook
    }

    await user.save();

    return res.json({ message: 'Profile updated', user: { id: user._id, name: user.name, email: user.email, phone: user.phone, address: user.address } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

module.exports = router;