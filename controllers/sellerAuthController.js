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
    const existingSeller = await Seller.findOne({ email });
    if (existingSeller) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Process uploaded images
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => {
        // Handle both Cloudinary uploads and memory storage
        const public_id = file.filename || file.originalname || `img_${Date.now()}`;
        const url = file.path || (file.buffer ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : '');
        
        return {
          public_id,
          url,
          alt: `${businessName} image`
        };
      });
    }

    // Create new seller with bank details and images
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
      images,
      // Populate bankDetails for backward compatibility
      bankDetails: {
        accountName: accountHolderName,
        accountNumber: bankAccountNumber,
        ifsc: ifscCode,
        bankName: bankName
      }
    });

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

    const seller = await Seller.findOne({ email }).select('-password');
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

    const updates = {
      businessName: req.body.businessName,
      phone: req.body.phone,
      address: req.body.address,
      businessType: req.body.businessType
    };

    const seller = await Seller.findOneAndUpdate(
      { email },
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