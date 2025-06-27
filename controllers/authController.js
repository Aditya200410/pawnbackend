const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const TempUser = require('../models/TempUser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP via email
const sendOTP = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP for Registration',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Pawn Shop!</h2>
        <p>Your OTP for registration is:</p>
        <h1 style="color: #1a73e8; font-size: 36px; letter-spacing: 5px;">${otp}</h1>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't request this OTP, please ignore this email.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Register new user
const register = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if user already exists in main User collection
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Check if there's a pending registration
    let tempUser = await TempUser.findOne({ email });
    if (tempUser) {
      // Generate new OTP for existing temp user
      const otp = generateOTP();
      tempUser.otp = {
        code: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      };
      await tempUser.save();
      await sendOTP(email, otp);
      // Log OTP for testing
      console.log('\x1b[33m%s\x1b[0m', `[TEST] OTP for ${email}: ${otp}`);
      return res.status(200).json({ 
        message: 'OTP sent successfully',
        email
      });
    }

    // Create new temporary user
    const otp = generateOTP();
    tempUser = new TempUser({
      name,
      email,
      password,
      otp: {
        code: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      }
    });

    await tempUser.save();
    await sendOTP(email, otp);
    // Log OTP for testing
    console.log('\x1b[33m%s\x1b[0m', `[TEST] OTP for ${email}: ${otp}`);

    res.status(200).json({ 
      message: 'OTP sent successfully',
      email
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
};

// Verify OTP and complete registration
const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) {
      return res.status(400).json({ message: 'Invalid or expired registration attempt' });
    }

    // Check OTP validity
    if (tempUser.otp.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Check OTP expiration
    if (new Date() > tempUser.otp.expiresAt) {
      await TempUser.deleteOne({ email });
      return res.status(400).json({ message: 'OTP expired' });
    }

    // Create permanent user
    const user = new User({
      name: tempUser.name,
      email: tempUser.email,
      password: tempUser.password // Already hashed
    });

    await user.save();
    await TempUser.deleteOne({ email });

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) {
      return res.status(400).json({ message: 'No pending registration found' });
    }

    const otp = generateOTP();
    tempUser.otp = {
      code: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    };

    await tempUser.save();
    await sendOTP(email, otp);
    // Log OTP for testing
    console.log('\x1b[33m%s\x1b[0m', `[TEST] OTP for ${email}: ${otp}`);

    res.status(200).json({ message: 'OTP resent successfully' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Failed to resend OTP' });
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;

  // Validate input
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  // For demo purposes, using hardcoded admin credentials
  if (username === "test" && password === "test") {
    const token = jwt.sign(
      { 
        id: 1, 
        username: "test",
        isAdmin: true 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: 1,
        username: "test",
        isAdmin: true
      }
    });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
};

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login
}; 