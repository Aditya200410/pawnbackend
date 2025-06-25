const Seller = require('../models/Seller');
const jwt = require('jsonwebtoken');

// Helper function to generate JWT token
const generateToken = (seller) => {
  return jwt.sign(
    { id: seller._id, email: seller.email, type: 'seller' },
    process.env.JWT_SECRET_SELLER,
    { expiresIn: '30d' }
  );
};

// Helper function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper function to validate phone number
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s-]{10,}$/;
  return phoneRegex.test(phone);
};

// Register a new seller
exports.register = async (req, res) => {
  try {
    const {
      businessName,
      email,
      password,
      phone,
      address,
      businessType
    } = req.body;

    // Validate required fields
    if (!businessName || !email || !password || !phone || !address || !businessType) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate phone number
    if (!isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if seller already exists
    const existingSeller = await Seller.findOne({ email });
    if (existingSeller) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create new seller
    const seller = await Seller.create({
      businessName,
      email,
      password,
      phone,
      address,
      businessType,
      status: 'pending' // Ensure status is set to pending
    });

    // Generate token
    const token = generateToken(seller);

    // Log successful registration
    console.log('New seller registered:', {
      id: seller._id,
      businessName: seller.businessName,
      email: seller.email
    });

    res.status(201).json({
      success: true,
      token,
      seller: {
        id: seller._id,
        businessName: seller.businessName,
        email: seller.email,
        status: seller.status,
        verified: seller.verified,
        businessType: seller.businessType
      }
    });
  } catch (error) {
    console.error('Seller registration error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error registering seller. Please try again later.'
    });
  }
};

// Login seller
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check if seller exists
    const seller = await Seller.findOne({ email });
    if (!seller) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await seller.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if seller is approved
    if (seller.status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval'
      });
    }

    // Generate token
    const token = generateToken(seller);

    // Log successful login
    console.log('Seller logged in:', {
      id: seller._id,
      email: seller.email
    });

    res.json({
      success: true,
      token,
      seller: {
        id: seller._id,
        businessName: seller.businessName,
        email: seller.email,
        status: seller.status,
        verified: seller.verified,
        businessType: seller.businessType
      }
    });
  } catch (error) {
    console.error('Seller login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in. Please try again later.'
    });
  }
};

// Get seller profile
exports.getProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.seller.id).select('-password');
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    res.json({
      success: true,
      seller
    });
  } catch (error) {
    console.error('Get seller profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile. Please try again later.'
    });
  }
};

// Update seller profile
exports.updateProfile = async (req, res) => {
  try {
    const updates = {
      businessName: req.body.businessName,
      phone: req.body.phone,
      address: req.body.address,
      businessType: req.body.businessType
    };

    // Validate phone number if provided
    if (updates.phone && !isValidPhone(updates.phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    const seller = await Seller.findByIdAndUpdate(
      req.seller.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    res.json({
      success: true,
      seller
    });
  } catch (error) {
    console.error('Update seller profile error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating profile. Please try again later.'
    });
  }
}; 