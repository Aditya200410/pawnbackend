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

// Register a new seller
exports.register = async (req, res) => {
  try {
    const {
      businessName,
      email,
      password,
      phone,
      address,
      businessType,
      bankAccountNumber,
      ifscCode,
      bankName,
      accountHolderName
    } = req.body;

    // Check if seller already exists
    const existingSeller = await Seller.findOne({ email });
    if (existingSeller) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create new seller with bank details
    const seller = await Seller.create({
      businessName,
      email,
      password,
      phone,
      address,
      businessType,
      bankAccountNumber,
      ifscCode,
      bankName,
      accountHolderName,
      // Populate bankDetails for backward compatibility
      bankDetails: {
        accountName: accountHolderName,
        accountNumber: bankAccountNumber,
        ifsc: ifscCode,
        bankName: bankName
      }
    });

    // Generate token
    const token = generateToken(seller);

    res.status(201).json({
      success: true,
      token,
      seller: {
        id: seller._id,
        businessName: seller.businessName,
        email: seller.email,
        verified: seller.verified
      }
    });
  } catch (error) {
    console.error('Seller registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering seller'
    });
  }
};

// Login seller
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

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

    // Generate token
    const token = generateToken(seller);

    res.json({
      success: true,
      token,
      seller: {
        id: seller._id,
        businessName: seller.businessName,
        email: seller.email,
        verified: seller.verified
      }
    });
  } catch (error) {
    console.error('Seller login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in'
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
      message: 'Error fetching profile'
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

    const seller = await Seller.findByIdAndUpdate(
      req.seller.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      seller
    });
  } catch (error) {
    console.error('Update seller profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
}; 