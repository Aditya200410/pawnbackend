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

// Middleware to log all requests
router.use((req, res, next) => {
  console.log('🔍 Auth Route Request:', {
    method: req.method,
    path: req.path,
    body: req.body,
    timestamp: new Date().toISOString()
  });
  next();
});

// Middleware to protect routes
const auth = (req, res, next) => {
  console.log('🔐 Auth middleware called');
  const token = req.header('Authorization')?.replace('Bearer ', '') || req.cookies?.token;
  
  console.log('🔐 Token check:', {
    hasToken: !!token,
    tokenLength: token?.length || 0
  });

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token verified:', { userId: decoded.id, email: decoded.email });
    req.user = decoded;
    next();
  } catch (err) {
    console.error('❌ Token verification failed:', err.message);
    res.status(401).json({ message: 'Token is not valid' });
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

// Helper to send OTP via Email using nodemailer
async function sendOtpViaEmail(email, otp) {
  console.log('📧 Sending OTP via Email:', { email, otp: otp ? '***' : 'undefined' });
  
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  
  console.log('🔧 Email Configuration:', {
    emailUser: emailUser ? '✅ Set' : '❌ Missing',
    emailPass: emailPass ? '✅ Set' : '❌ Missing'
  });

  if (!emailUser || !emailPass) {
    console.error('❌ Email configuration missing');
    throw new Error('Email configuration incomplete');
  }

  try {
    console.log('📡 Sending email OTP to:', email);
    
    const mailOptions = {
      from: emailUser,
      to: email,
      subject: 'Your Registration OTP',
      text: `Your OTP for registration is: ${otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">Registration OTP</h2>
          <p style="color: #666; font-size: 16px;">Your OTP for registration is:</p>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 4px;">${otp}</h1>
          </div>
          <p style="color: #666; font-size: 14px;">This OTP will expire in 10 minutes.</p>
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
            If you didn't request this OTP, please ignore this email.
          </p>
        </div>
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email OTP sent successfully:', {
      messageId: result.messageId,
      response: result.response
    });
    
    return result;
  } catch (err) {
    console.error('❌ Email OTP send error:', {
      message: err.message,
      code: err.code
    });
    throw new Error('Failed to send OTP via email');
  }
}

// POST /register (alias for /signup)
router.post('/register', async (req, res) => {
  console.log('📝 /register endpoint called');
  console.log('📋 Request body:', req.body);
  
  const { name, email, password, phone } = req.body;
  
  console.log('🔍 Validating required fields:', {
    hasName: !!name,
    hasEmail: !!email,
    hasPassword: !!password,
    hasPhone: !!phone
  });
  
  if (!name || !email || !password || !phone) {
    console.log('❌ Missing required fields');
    return res.status(400).json({ message: 'Name, email, password, and phone are required' });
  }
  
  try {
    console.log('🔍 Checking for existing user with email:', email);
    const existingUser = await User.findOne({ email });
    const existingTemp = await TempUser.findOne({ email });
    
    console.log('🔍 Existing user check:', {
      existingUser: !!existingUser,
      existingTemp: !!existingTemp
    });
    
    if (existingUser) {
      console.log('❌ User already exists with email:', email);
      return res.status(400).json({ message: 'Email already registered' });
    }
    if (existingTemp) {
      console.log('❌ OTP already sent to email:', email);
      return res.status(400).json({ message: 'OTP already sent to this email. Please verify OTP or wait 10 min.' });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    console.log('🔢 Generated OTP for', email, ':', otp);
    console.log('⏰ OTP expires at:', expiresAt);
    
    console.log('💾 Creating TempUser...');
    await TempUser.create({ username: name, email, password, phone, otp, otpExpires: expiresAt });
    console.log('✅ TempUser created successfully');
    
    console.log('📧 Sending OTP via Email...');
    try {
      await sendOtpViaEmail(email, otp);
      console.log('✅ OTP Email sent to', email);
    } catch (emailErr) {
      console.error('❌ Error sending OTP Email:', emailErr);
      // Delete the TempUser if email fails
      await TempUser.deleteOne({ email });
      throw emailErr;
    }
    
    console.log('✅ Registration process completed successfully');
    return res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('❌ Registration error:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /verify-otp
router.post('/verify-otp', async (req, res) => {
  console.log('📝 /verify-otp endpoint called');
  console.log('📋 Request body:', req.body);
  
  const { email, otp } = req.body;
  
  console.log('🔍 Validating required fields:', {
    hasEmail: !!email,
    hasOtp: !!otp
  });
  
  if (!email || !otp) {
    console.log('❌ Missing required fields');
    return res.status(400).json({ message: 'Email and OTP are required' });
  }
  
  try {
    console.log('🔍 Looking for TempUser with email:', email);
    const tempUser = await TempUser.findOne({ email });
    
    console.log('🔍 TempUser found:', !!tempUser);
    
    if (!tempUser) {
      console.log('❌ No TempUser found for email:', email);
      return res.status(400).json({ message: 'OTP expired or not found. Please register again.' });
    }
    
    // Check if OTP is expired
    if (tempUser.otpExpires && tempUser.otpExpires < new Date()) {
      console.log('❌ OTP expired');
      await TempUser.deleteOne({ _id: tempUser._id });
      return res.status(400).json({ message: 'OTP has expired. Please register again.' });
    }
    
    console.log('🔍 Comparing OTPs:', {
      provided: otp,
      stored: tempUser.otp,
      match: tempUser.otp === otp
    });
    
    if (tempUser.otp !== otp) {
      console.log('❌ OTP mismatch');
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    
    console.log('✅ OTP verified successfully');
    console.log('💾 Creating new User...');
    
    const user = new User({ name: tempUser.username, email: tempUser.email, password: tempUser.password, phone: tempUser.phone });
    await user.save();
    
    console.log('✅ User created successfully:', {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone
    });
    
    console.log('🗑️ Deleting TempUser...');
    await TempUser.deleteOne({ _id: tempUser._id });
    console.log('✅ TempUser deleted successfully');
    
    return res.json({ message: 'OTP verified, registration complete. Please login.' });
  } catch (err) {
    console.error('❌ Verify OTP error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  console.log('📝 /login endpoint called');
  console.log('📋 Request body:', req.body);
  
  const { email, password } = req.body;
  
  console.log('🔍 Validating required fields:', {
    hasEmail: !!email,
    hasPassword: !!password
  });
  
  if (!email || !password) {
    console.log('❌ Missing required fields');
    return res.status(400).json({ message: 'Email and password are required' });
  }
  
  try {
    console.log('🔍 Looking for user with email:', email);
    const user = await User.findOne({ email });
    
    console.log('🔍 User found:', !!user);
    
    if (!user) {
      console.log('❌ No user found with email:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    console.log('🔍 Comparing passwords...');
    const isMatch = await bcrypt.compare(password, user.password);
    
    console.log('🔍 Password match:', isMatch);
    
    if (!isMatch) {
      console.log('❌ Password mismatch');
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    console.log('✅ Login successful, generating JWT token...');
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    
    console.log('✅ JWT token generated successfully');
    
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /forgot-password (send OTP for password reset)
router.post('/forgot-password', async (req, res) => {
  console.log('📝 /forgot-password endpoint called');
  console.log('📋 Request body:', req.body);
  
  const { email } = req.body;
  
  console.log('🔍 Validating required fields:', {
    hasEmail: !!email
  });
  
  if (!email) {
    console.log('❌ Missing email');
    return res.status(400).json({ message: 'Email is required' });
  }
  
  try {
    console.log('🔍 Looking for user with email:', email);
    const user = await User.findOne({ email });
    
    console.log('🔍 User found:', !!user);
    
    if (!user) {
      console.log('❌ No user found with email:', email);
      return res.status(400).json({ message: 'No user found with this email' });
    }
    
    console.log('🔢 Generating OTP for password reset...');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    
    console.log('🔢 Generated OTP:', otp);
    console.log('⏰ OTP expires at:', expiresAt);
    
    console.log('💾 Saving OTP to TempUser...');
    let temp = await TempUser.findOne({ email });
    if (!temp) {
      temp = await TempUser.create({ email, otp, otpExpires: expiresAt });
      console.log('✅ New TempUser created for password reset');
    } else {
      temp.otp = otp;
      temp.otpExpires = expiresAt;
      await temp.save();
      console.log('✅ Existing TempUser updated for password reset');
    }
    
    console.log('📧 Sending OTP via email...');
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}`,
      html: `<p>Your OTP for password reset is: <b>${otp}</b></p>`
    });
    
    console.log('✅ Password reset OTP sent successfully');
    return res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('❌ Forgot password error:', err);
    res.status(500).json({ message: 'Error processing password reset request' });
  }
});

// POST /verify-forgot-otp (verify OTP and set new password)
router.post('/verify-forgot-otp', async (req, res) => {
  console.log('📝 /verify-forgot-otp endpoint called');
  console.log('📋 Request body:', req.body);
  
  const { email, otp, newPassword } = req.body;
  
  console.log('🔍 Validating required fields:', {
    hasEmail: !!email,
    hasOtp: !!otp,
    hasNewPassword: !!newPassword
  });
  
  if (!email || !otp || !newPassword) {
    console.log('❌ Missing required fields');
    return res.status(400).json({ message: 'Email, OTP, and new password are required' });
  }
  
  try {
    console.log('🔍 Looking for TempUser with email:', email);
    const temp = await TempUser.findOne({ email });
    
    console.log('🔍 TempUser found:', !!temp);
    
    if (!temp || temp.otp !== otp || !temp.otpExpires || temp.otpExpires < new Date()) {
      console.log('❌ Invalid or expired OTP');
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    
    console.log('✅ OTP verified successfully');
    console.log('🔍 Looking for user with email:', email);
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ No user found with email:', email);
      return res.status(400).json({ message: 'No user found with this email' });
    }
    
    console.log('💾 Updating user password...');
    user.password = newPassword;
    await user.save();
    
    console.log('✅ Password updated successfully');
    console.log('🗑️ Deleting TempUser...');
    await TempUser.deleteOne({ email });
    console.log('✅ TempUser deleted successfully');
    
    return res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    console.error('❌ Verify forgot OTP error:', err);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

// POST /logout
router.post('/logout', async (req, res) => {
  console.log('📝 /logout endpoint called');
  
  try {
    console.log('🍪 Clearing token cookie...');
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    console.log('✅ Logout successful');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('❌ Error in logout:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



// PUT /update-profile (Protected)
router.put('/update-profile', auth, async (req, res) => {
  console.log('📝 /update-profile endpoint called');
  console.log('📋 Request body:', req.body);
  console.log('👤 User ID from token:', req.user.id);
  
  const { name, email, phone, address, currentPassword, newPassword } = req.body;
  
  try {
    console.log('🔍 Looking for user with ID:', req.user.id);
    const user = await User.findById(req.user.id);
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ message: 'User not found' });
    }
    
    console.log('✅ User found:', { name: user.name, email: user.email });

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (address) user.address = address;

    // Handle password change securely
    if (currentPassword && newPassword) {
      console.log('🔍 Verifying current password...');
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        console.log('❌ Current password is incorrect');
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      console.log('✅ Current password verified');
      user.password = newPassword; // Will be hashed by pre-save hook
    }

    console.log('💾 Saving updated user...');
    await user.save();

    console.log('✅ Profile updated successfully');
    return res.json({ 
      message: 'Profile updated', 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        phone: user.phone, 
        address: user.address 
      } 
    });
  } catch (err) {
    console.error('❌ Update profile error:', err);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

module.exports = router;