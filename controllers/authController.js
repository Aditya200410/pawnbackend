const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const TempUser = require('../models/TempUser');

// Generate a random 6-digit OTP
const generateOTP = () => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('Generated new OTP:', otp);
  return otp;
};

// Register endpoint - Step 1: Create temporary user with OTP
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // Remove any existing temp user with the same email or username
    await TempUser.deleteMany({ $or: [{ email }, { username }] });

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists. Please login instead." });
    }

    // Generate OTP
    const otp = generateOTP();
    // Only show OTP in console
    console.log('OTP for verification:', otp);

    // Create temporary user
    const tempUser = new TempUser({
      username,
      email,
      password, // store plain password
      otp
    });
    await tempUser.save();

    res.status(201).json({ message: "Please verify your OTP", email });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message, stack: error.stack });
  }
};

// Verify OTP endpoint - Step 2: Verify OTP and create actual user
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) {
      return res.status(400).json({ message: "Invalid or expired OTP request. Please register again." });
    }
    if (tempUser.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP. Please check and try again." });
    }
    const userData = {
      username: tempUser.username,
      email: tempUser.email,
      password: tempUser.password // Already hashed
    };
    const user = new User(userData);
    await user.save();
    await TempUser.deleteOne({ _id: tempUser._id });
    res.json({
      message: "Registration successful! You can now login.",
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ message: "OTP verification failed", error: error.message, stack: error.stack });
  }
};

const login = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const loginId = username || email;
    if (!loginId || !password) {
      return res.status(400).json({ message: "Username/email and password are required" });
    }
    const user = await User.findOne({ 
      $or: [
        { email: loginId }, 
        { username: loginId }
      ]
    });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (typeof password === 'string' && password.startsWith('$2a$')) {
      return res.status(400).json({ message: 'Do not send hashed password. Please enter your plain password.' });
    }
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message, stack: error.stack });
  }
};

module.exports = {
  register,
  verifyOTP,
  login
}; 