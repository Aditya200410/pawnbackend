const Seller = require('../models/Seller');

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
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Checking for existing seller with email:', normalizedEmail);
    const existingSeller = await Seller.findOne({ email: normalizedEmail });
    console.log('Existing seller found:', existingSeller ? 'Yes' : 'No');
    if (existingSeller) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Validate required fields
    const requiredFields = ['businessName', 'email', 'password', 'phone', 'address', 'businessType', 'bankAccountNumber', 'ifscCode', 'bankName', 'accountHolderName'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Process uploaded images
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => {
        // Handle both Cloudinary uploads and memory storage
        const public_id = file.filename || file.originalname || `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const url = file.path || (file.buffer ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : '');
        
        // Only include images with valid URLs and public_ids
        if (url && public_id) {
          return {
            public_id,
            url,
            alt: `${businessName} image`
          };
        }
        return null;
      }).filter(img => img !== null); // Remove any null entries
    }

    // Ensure images array is always defined
    if (!images || images.length === 0) {
      images = [];
    }

    // Create new seller with all required fields (without unique fields initially)
    let seller;
    try {
      seller = await Seller.create({
        businessName,
        email: normalizedEmail,
        password,
        phone,
        address,
        businessType,
        bankAccountNumber,
        ifscCode,
        bankName,
        accountHolderName,
        images,
        // Populate bankDetails for backward compatibility
        bankDetails: {
          accountName: accountHolderName || '',
          accountNumber: bankAccountNumber || '',
          ifsc: ifscCode || '',
          bankName: bankName || ''
        }
      });

      // Generate unique seller token and website link after successful creation
      const sellerToken = `seller_${seller._id.toString().slice(-8)}_${Date.now()}`;
      const websiteLink = `${'https://pawn-shop-git-local-host-api-used-aditya200410s-projects.vercel.app'}/shop?seller=${sellerToken}`;
      
      // Update seller with unique fields
      try {
        const updatedSeller = await Seller.findByIdAndUpdate(
          seller._id,
          { sellerToken, websiteLink },
          { new: true }
        );
        seller = updatedSeller;
      } catch (updateError) {
        console.error('Failed to update seller with unique fields:', updateError);
        // Continue with the seller without unique fields - they can be updated later
        console.log('Seller created successfully but unique fields update failed');
      }
    } catch (createError) {
      console.error('Seller creation error:', createError);
      console.error('Seller creation error details:', createError.message);
      if (createError.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'A seller with this email already exists'
        });
      }
      throw createError;
    }

    res.status(201).json({
      success: true,
      message: 'Seller registered successfully',
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
        verified: seller.verified
      }
    });
  } catch (error) {
    console.error('Seller registration error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('Request files:', req.files);
    
    res.status(500).json({
      success: false,
      message: 'Error registering seller',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

    res.json({
      success: true,
      message: 'Login successful',
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

// Get seller profile by email (for simple authentication)
exports.getProfile = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const seller = await Seller.findOne({ email: normalizedEmail }).select('-password');
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

// Update seller profile by email
exports.updateProfile = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const updates = {
      businessName: req.body.businessName,
      phone: req.body.phone,
      address: req.body.address,
      businessType: req.body.businessType
    };

    const seller = await Seller.findOneAndUpdate(
      { email: normalizedEmail },
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
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
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