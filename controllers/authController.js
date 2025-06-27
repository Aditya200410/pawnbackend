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
    // First check if user exists in main User collection
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered and verified' });
    }

    // Then check TempUser collection
    let tempUser = await TempUser.findOne({ email });
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (tempUser) {
      // Update existing temp user
      tempUser.name = name;
      tempUser.password = hashedPassword;
      tempUser.otp = {
        code: otp,
        expiresAt: otpExpiry
      };
    } else {
      // Create new temporary user
      tempUser = new TempUser({
        name,
        email,
        password: hashedPassword,
        otp: {
          code: otp,
          expiresAt: otpExpiry
        }
      });
    }

    // Save the temporary user
    await tempUser.save();

    // Send OTP
    try {
      await sendOTP(email, otp);
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError);
      // Even if email fails, we'll show OTP in console for testing
    }

    // Log OTP for testing
    console.log('\x1b[33m%s\x1b[0m', `[TEST] OTP for ${email}: ${otp}`);

    // Return success response
    res.status(200).json({ 
      message: 'Registration initiated. Please verify your email with OTP.',
      email
    });

  } catch (error) {
    console.error('Registration error:', error);
    // Delete any partially created temp user in case of error
    try {
      await TempUser.deleteOne({ email });
    } catch (deleteError) {
      console.error('Error cleaning up temp user:', deleteError);
    }
    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
};

// Verify OTP and complete registration
const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Find temp user
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) {
      return res.status(400).json({ 
        message: 'No pending registration found. Please register again.' 
      });
    }

    // Check if user already exists in main collection
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Clean up temp user
      await TempUser.deleteOne({ email });
      return res.status(400).json({ 
        message: 'Email already registered and verified. Please login.' 
      });
    }

    // Check OTP validity
    if (tempUser.otp.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    // Check OTP expiration
    if (new Date() > tempUser.otp.expiresAt) {
      await TempUser.deleteOne({ email });
      return res.status(400).json({ 
        message: 'OTP expired. Please register again.' 
      });
    }

    // Create permanent user from temp user data
    const user = new User({
      name: tempUser.name,
      email: tempUser.email,
      password: tempUser.password
    });

    await user.save();
    await TempUser.deleteOne({ email });

    res.status(201).json({
      success: true,
      message: 'Account verified successfully. Please login to continue.'
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Verification failed. Please try again.' });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) {
      return res.status(400).json({ 
        message: 'No pending registration found. Please register again.' 
      });
    }

    const otp = generateOTP();
    tempUser.otp = {
      code: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    };

    await tempUser.save();

    try {
      await sendOTP(email, otp);
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError);
      // Even if email fails, we'll show OTP in console for testing
    }

    // Log OTP for testing
    console.log('\x1b[33m%s\x1b[0m', `[TEST] OTP for ${email}: ${otp}`);

    res.status(200).json({ message: 'OTP resent successfully' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Failed to resend OTP. Please try again.' });
  }
};

// Login
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login
}; 