const User = require('../models/user');
const TempUser = require('../models/tempUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register User
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists in main users collection
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Check if there's a pending verification
    let tempUser = await TempUser.findOne({ email });
    if (tempUser) {
      await TempUser.deleteOne({ email });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = generateOTP();

    // Create temporary user
    tempUser = new TempUser({
      name,
      email,
      password: hashedPassword,
      otp
    });

    await tempUser.save();

    // Log OTP to console (in production, this would be sent via email/SMS)
    console.log(`OTP for ${email}: ${otp}`);

    res.status(200).json({ 
      message: 'OTP sent successfully',
      email 
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Find temporary user
    const tempUser = await TempUser.findOne({ email });
    
    if (!tempUser) {
      return res.status(400).json({ message: 'OTP expired or invalid request' });
    }

    // Check OTP
    if (tempUser.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Create actual user
    const user = new User({
      name: tempUser.name,
      email: tempUser.email,
      password: tempUser.password
    });

    await user.save();

    // Delete temporary user
    await TempUser.deleteOne({ email });

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

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Login User
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  register,
  verifyOTP,
  login
}; 