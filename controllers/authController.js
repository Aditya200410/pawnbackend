const User = require('../models/User');
const TempUser = require('../models/TempUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register User
const register = async (req, res) => {
  try {
    console.log('Registration attempt with data:', { ...req.body, password: '[REDACTED]' });
    
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      console.log('Missing required fields:', { name: !!name, email: !!email, password: !!password });
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user already exists in main users collection
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('User already exists:', email);
      return res.status(400).json({ message: 'User already exists' });
    }

    // Check if there's a pending verification
    let tempUser = await TempUser.findOne({ email });
    if (tempUser) {
      console.log('Deleting existing temp user for:', email);
      await TempUser.deleteOne({ email });
    }

    // Generate OTP
    const otp = generateOTP();
    console.log('Generated OTP for:', email, otp);

    try {
      // Create temporary user
      tempUser = new TempUser({
        name,
        email,
        password, // Will be hashed by User model when creating actual user
        otp
      });

      await tempUser.save();
      console.log('Temporary user created successfully:', email);

      // Log OTP to console (in production, this would be sent via email/SMS)
      console.log(`OTP for ${email}: ${otp}`);

      res.status(200).json({ 
        message: 'OTP sent successfully',
        email 
      });
    } catch (saveError) {
      console.error('Error saving temporary user:', saveError);
      throw saveError;
    }

  } catch (error) {
    console.error('Detailed registration error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  try {
    console.log('OTP verification attempt:', { ...req.body, otp: '[REDACTED]' });
    
    const { email, otp } = req.body;

    if (!email || !otp) {
      console.log('Missing required fields:', { email: !!email, otp: !!otp });
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    // Find temporary user
    const tempUser = await TempUser.findOne({ email });
    
    if (!tempUser) {
      console.log('No temporary user found for:', email);
      return res.status(400).json({ message: 'OTP expired or invalid request' });
    }

    // Check OTP
    if (tempUser.otp !== otp) {
      console.log('Invalid OTP for:', email);
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    try {
      // Create actual user
      const user = new User({
        name: tempUser.name,
        email: tempUser.email,
        password: tempUser.password // Will be hashed by User model's pre-save hook
      });

      await user.save();
      console.log('User created successfully:', email);

      // Delete temporary user
      await TempUser.deleteOne({ email });
      console.log('Temporary user deleted:', email);

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      res.status(200).json({
        message: 'Registration successful',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      });
    } catch (saveError) {
      console.error('Error creating user:', saveError);
      throw saveError;
    }

  } catch (error) {
    console.error('Detailed OTP verification error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Login User
const login = async (req, res) => {
  try {
    console.log('Login attempt:', { ...req.body, password: '[REDACTED]' });
    
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('Missing required fields:', { email: !!email, password: !!password });
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('Invalid password for:', email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    console.log('Login successful:', email);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Detailed login error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  register,
  verifyOTP,
  login
}; 