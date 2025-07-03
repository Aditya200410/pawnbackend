// Improved Express Auth Routes with better structure, security, and async handling
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const TempUser = require('../models/TempUser');
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

// POST /register (alias for /signup)
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
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
    await TempUser.create({ username: name, email, password, otp });
    console.log(`OTP for ${email}: ${otp}`);
    // Send OTP via email
    try {
      await transporter.sendMail({
        from: "rikoenterprises25@gmail.com" ,
        to: email,
        subject: 'Your OTP Code',
        text: `Your OTP code is: ${otp}`,
        html: `<p>Your OTP code is: <b>${otp}</b></p>`
      });
      console.log(`OTP email sent to ${email}`);
    } catch (mailErr) {
      console.error('Error sending OTP email:', mailErr);
    }
    return res.json({ message: 'OTP sent to your email', email });
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
    const user = new User({ name: tempUser.username, email: tempUser.email, password: tempUser.password });
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

// POST /forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  
  try {
    console.log('Forgot password request for email:', email);
    
    const user = await User.findOne({ email });
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = await bcrypt.hash(resetToken, 10);
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
      await user.save();
      
      console.log('Reset token generated for user:', user.email);
      
      // In a real application, you would send an email here
      // For now, we'll just return a success message
      return res.json({ 
        message: 'If an account with this email exists, a password reset link has been sent.',
        resetToken: resetToken // Remove this in production - only for testing
      });
    } else {
      console.log('No user found with email:', email);
      // For security reasons, don't reveal if the email exists or not
      return res.json({ 
        message: 'If an account with this email exists, a password reset link has been sent.' 
      });
    }
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Error processing password reset request' });
  }
});

// POST /reset-password/:token
router.post('/reset-password/:token', async (req, res) => {
  const { password } = req.body;
  const { token } = req.params;

  if (!password) return res.status(400).json({ message: 'New password required' });

  try {
    const users = await User.find({ resetPasswordExpires: { $gt: Date.now() } });
    let matchedUser = null;
    for (let user of users) {
      if (await bcrypt.compare(token, user.resetPasswordToken || '')) {
        matchedUser = user;
        break;
      }
    }
    if (!matchedUser) return res.status(400).json({ message: 'Invalid or expired token' });

    matchedUser.password = password;
    matchedUser.resetPasswordToken = undefined;
    matchedUser.resetPasswordExpires = undefined;
    await matchedUser.save();

    return res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error(err);
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

// PUT /update-profile (Protected)
router.put('/update-profile', auth, async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (password) user.password = password;
    await user.save();

    return res.json({ message: 'Profile updated', user: { id: user._id, name: user.name, email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

module.exports = router;