const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create directories
const uploadsDir = path.join(__dirname, '../public/uploads');
const sellerImagesDir = path.join(uploadsDir, 'seller-images');
const sellerProfilesDir = path.join(uploadsDir, 'seller-profiles');

[sellerImagesDir, sellerProfilesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure storage for multiple images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, sellerImagesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'seller-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure storage for profile image
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, sellerProfilesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Multer configuration
const uploadMultipleImages = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
}).array('images', 10);

const uploadProfileImage = multer({
  storage: profileStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
}).single('profileImage');

// Helper to construct URL
const getFullUrl = (req, folder, filename) => {
  return `uploads/${folder}/${filename}`;
};

// Middleware wrappers
const handleMultipleImages = (req, res, next) => {
  uploadMultipleImages(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    // Fix file paths to be URLs
    if (req.files) {
      req.files.forEach(file => {
        file.path = getFullUrl(req, 'seller-images', file.filename);
      });
    }
    next();
  });
};

const handleProfileImage = (req, res, next) => {
  uploadProfileImage(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    // Fix file path to be URL
    if (req.file) {
      req.file.path = getFullUrl(req, 'seller-profiles', req.file.filename);
    }
    next();
  });
};

module.exports = {
  handleMultipleImages,
  handleProfileImage,
  cloudinary: null // Deprecated but kept for compatibility check
}; 