const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const TempUser = require('../models/tempUser');

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register endpoint - Step 1: Create temporary user with OTP
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create temporary user
    const tempUser = new TempUser({
      username,
      email,
      password: hashedPassword,
      otp
    });

    await tempUser.save();

    // In production, you would send this OTP via email
    console.log('Generated OTP:', otp); // For testing purposes

    res.status(201).json({ message: "Please verify your OTP", email });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: "Registration failed" });
  }
};

// Verify OTP endpoint - Step 2: Verify OTP and create actual user
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Find temporary user
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) {
      return res.status(400).json({ message: "Invalid or expired OTP request" });
    }

    // Verify OTP
    if (tempUser.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Create actual user
    const user = new User({
      username: tempUser.username,
      email: tempUser.email,
      password: tempUser.password // Already hashed
    });

    await user.save();

    // Delete temporary user
    await TempUser.deleteOne({ _id: tempUser._id });

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        username: user.username,
        email: user.email
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      message: "Registration successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: "OTP verification failed" });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign(
      { 
        id: user._id,
        username: user.username,
        email: user.email
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: "Login failed" });
  }
};

module.exports = {
  register,
  verifyOTP,
  login
}; 