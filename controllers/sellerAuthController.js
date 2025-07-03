const Seller = require('../models/Seller');
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Register a new seller
exports.register = async (req, res) => {
  try {
    const { businessName, email, password, phone, address, businessType } = req.body;
    const normalizedEmail = email && email.toLowerCase().trim();
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const existingSeller = await Seller.findOne({ email: normalizedEmail });
    if (existingSeller) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }
    const requiredFields = ['businessName', 'email', 'password'];
    const missingFields = requiredFields.filter(field => !req.body[field] || req.body[field].toString().trim() === '');
    if (missingFields.length > 0) {
      return res.status(400).json({ success: false, message: `Missing required fields: ${missingFields.join(', ')}` });
    }
    // Generate unique sellerToken
    const sellerToken = uuidv4();
    // Create websiteLink with sellerToken
    const websiteLink = `${process.env.FRONTEND_URL || 'https://pawn-shop-git-local-host-api-used-aditya200410s-projects.vercel.app'}/shop?sellerToken=${sellerToken}`;
    // Generate QR code for websiteLink
    const qrCode = await QRCode.toDataURL(websiteLink);
    // Create seller with all info
    const seller = await Seller.create({
      businessName,
      email: normalizedEmail,
      password,
      phone,
      address,
      businessType,
      sellerToken,
      websiteLink,
      qrCode
    });
    // Create JWT token for seller
    const token = jwt.sign(
      {
        id: seller._id,
        email: seller.email,
        businessName: seller.businessName,
        isSeller: true,
        type: 'seller'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    res.status(201).json({
      success: true,
      message: 'Seller registered successfully',
      token,
      seller: {
        id: seller._id,
        businessName: seller.businessName,
        email: seller.email,
        phone: seller.phone,
        address: seller.address,
        businessType: seller.businessType,
        sellerToken: seller.sellerToken,
        websiteLink: seller.websiteLink,
        qrCode: seller.qrCode,
        createdAt: seller.createdAt,
        verified: seller.verified
      }
    });
  } catch (error) {
    console.error('Seller registration error:', error);
    res.status(500).json({ success: false, message: 'Error registering seller' });
  }
};

// Login seller
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    // Check if seller exists
    const seller = await Seller.findOne({ email: normalizedEmail });
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
    // Create JWT token for seller
    const token = jwt.sign(
      {
        id: seller._id,
        email: seller.email,
        businessName: seller.businessName,
        isSeller: true,
        type: 'seller'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    res.json({
      success: true,
      message: 'Login successful',
      token,
      seller: {
        id: seller._id,
        businessName: seller.businessName,
        email: seller.email,
        phone: seller.phone,
        address: seller.address,
        businessType: seller.businessType,
        accountHolderName: seller.accountHolderName,
        bankAccountNumber: seller.bankAccountNumber,
        ifscCode: seller.ifscCode,
        bankName: seller.bankName,
        sellerToken: seller.sellerToken,
        websiteLink: seller.websiteLink,
        qrCode: seller.qrCode,
        images: seller.images || [],
        profileImage: seller.profileImage || null,
        totalOrders: seller.totalOrders || 0,
        totalCommission: seller.totalCommission || 0,
        availableCommission: seller.availableCommission || 0,
        bankDetails: seller.bankDetails || {},
        withdrawals: seller.withdrawals || [],
        createdAt: seller.createdAt,
        verified: seller.verified,
        blocked: seller.blocked
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

// Get seller profile by JWT
exports.getProfileByJWT = async (req, res) => {
  try {
    const seller = req.seller;
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    res.json({
      success: true,
      seller: {
        id: seller._id,
        businessName: seller.businessName,
        email: seller.email,
        phone: seller.phone,
        address: seller.address,
        businessType: seller.businessType,
        accountHolderName: seller.accountHolderName,
        bankAccountNumber: seller.bankAccountNumber,
        ifscCode: seller.ifscCode,
        bankName: seller.bankName,
        sellerToken: seller.sellerToken,
        websiteLink: seller.websiteLink,
        qrCode: seller.qrCode,
        images: seller.images || [],
        profileImage: seller.profileImage || null,
        totalOrders: seller.totalOrders || 0,
        totalCommission: seller.totalCommission || 0,
        availableCommission: seller.availableCommission || 0,
        bankDetails: seller.bankDetails || {},
        withdrawals: seller.withdrawals || [],
        createdAt: seller.createdAt,
        verified: seller.verified,
        blocked: seller.blocked
      }
    });
  } catch (error) {
    console.error('Get seller profile by JWT error:', error);
    res.status(500).json({ success: false, message: 'Error fetching profile' });
  }
};

// Update seller profile by JWT
exports.updateProfileByJWT = async (req, res) => {
  try {
    const seller = req.seller;
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    const updates = req.body;
    Object.assign(seller, updates);
    await seller.save();
    res.json({
      success: true,
      seller: {
        id: seller._id,
        businessName: seller.businessName,
        email: seller.email,
        phone: seller.phone,
        address: seller.address,
        businessType: seller.businessType,
        accountHolderName: seller.accountHolderName,
        bankAccountNumber: seller.bankAccountNumber,
        ifscCode: seller.ifscCode,
        bankName: seller.bankName,
        sellerToken: seller.sellerToken,
        websiteLink: seller.websiteLink,
        qrCode: seller.qrCode,
        images: seller.images || [],
        profileImage: seller.profileImage || null,
        totalOrders: seller.totalOrders || 0,
        totalCommission: seller.totalCommission || 0,
        availableCommission: seller.availableCommission || 0,
        bankDetails: seller.bankDetails || {},
        withdrawals: seller.withdrawals || [],
        createdAt: seller.createdAt,
        verified: seller.verified,
        blocked: seller.blocked
      }
    });
  } catch (error) {
    console.error('Update seller profile by JWT error:', error);
    res.status(500).json({ success: false, message: 'Error updating profile' });
  }
};

// Upload multiple images
exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images uploaded'
      });
    }

    const images = req.files.map(file => ({
      public_id: file.filename,
      url: file.path,
      alt: 'Seller image'
    }));

    const seller = await Seller.findByIdAndUpdate(
      req.seller.id,
      { $push: { images: { $each: images } } },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Images uploaded successfully',
      images: seller.images
    });
  } catch (error) {
    console.error('Upload images error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading images'
    });
  }
};

// Upload profile image
exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No profile image uploaded'
      });
    }

    const profileImage = {
      public_id: req.file.filename,
      url: req.file.path,
      alt: 'Profile image'
    };

    const seller = await Seller.findByIdAndUpdate(
      req.seller.id,
      { profileImage },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile image uploaded successfully',
      profileImage: seller.profileImage
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading profile image'
    });
  }
};

// Delete image
exports.deleteImage = async (req, res) => {
  try {
    const { imageId } = req.params;
    const { cloudinary } = require('../middleware/sellerUpload');

    // Find the image in the seller's images array
    const seller = await Seller.findById(req.seller.id);
    const image = seller.images.id(imageId);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    // Delete from Cloudinary if available
    if (cloudinary) {
      try {
        await cloudinary.uploader.destroy(image.public_id);
      } catch (cloudinaryError) {
        console.error('Cloudinary delete error:', cloudinaryError);
        // Continue with database deletion even if Cloudinary fails
      }
    }

    // Remove from database
    seller.images.pull(imageId);
    await seller.save();

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting image'
    });
  }
};

// Get all sellers (for admin panel)
exports.getAllSellers = async (req, res) => {
  try {
    const sellers = await Seller.find({}, '-password');
    res.json({
      success: true,
      sellers
    });
  } catch (error) {
    console.error('Error fetching all sellers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sellers'
    });
  }
};

// Update unique fields for existing sellers
exports.updateUniqueFields = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const seller = await Seller.findOne({ email: normalizedEmail });
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    // Generate unique fields if they don't exist
    if (!seller.sellerToken || !seller.websiteLink) {
      const sellerToken = `seller_${seller._id.toString().slice(-8)}_${Date.now()}`;
      const websiteLink = `${'https://pawn-shop-git-local-host-api-used-aditya200410s-projects.vercel.app'}/shop?seller=${sellerToken}`;
      
      const updatedSeller = await Seller.findByIdAndUpdate(
        seller._id,
        { sellerToken, websiteLink },
        { new: true }
      );

      res.json({
        success: true,
        message: 'Unique fields updated successfully',
        seller: updatedSeller
      });
    } else {
      res.json({
        success: true,
        message: 'Seller already has unique fields',
        seller
      });
    }
  } catch (error) {
    console.error('Update unique fields error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating unique fields'
    });
  }
};

// Test endpoint to list all sellers (for debugging)
exports.listAllSellers = async (req, res) => {
  try {
    const sellers = await Seller.find({}, 'email businessName createdAt');
    res.json({
      success: true,
      count: sellers.length,
      sellers: sellers.map(s => ({
        email: s.email,
        businessName: s.businessName,
        createdAt: s.createdAt
      }))
    });
  } catch (error) {
    console.error('List all sellers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error listing sellers',
      error: error.message
    });
  }
};

// Test endpoint to verify seller controller is working
exports.test = async (req, res) => {
  try {
    // Test database connection
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    res.json({
      success: true,
      message: 'Seller controller is working',
      database: dbStates[dbState] || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Test endpoint error',
      error: error.message
    });
  }
};

// Block or unblock a seller (admin only)
exports.setBlockedStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked } = req.body;
    if (typeof blocked !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Blocked status must be boolean' });
    }
    const seller = await Seller.findByIdAndUpdate(id, { blocked }, { new: true });
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    res.json({ success: true, message: `Seller ${blocked ? 'blocked' : 'unblocked'} successfully`, seller });
  } catch (error) {
    console.error('Set blocked status error:', error);
    res.status(500).json({ success: false, message: 'Error updating blocked status' });
  }
};

// Delete a seller (admin only)
exports.deleteSeller = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await Seller.findByIdAndDelete(id);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    res.json({ success: true, message: 'Seller deleted successfully' });
  } catch (error) {
    console.error('Delete seller error:', error);
    res.status(500).json({ success: false, message: 'Error deleting seller' });
  }
};

// In the order placement logic (createOrder or addCommission), before adding commission:
// if (seller.blocked) { /* do not add commission, optionally log or return */ return; } 