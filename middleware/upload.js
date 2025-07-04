const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let transformation = [];
    if (file.fieldname === 'mobileImage') {
      // Portrait for mobile
      transformation = [{ width: 720, height: 1280, crop: 'limit' }];
    } else if (file.fieldname === 'desktopImage') {
      // Landscape for desktop
      transformation = [{ width: 1920, height: 1080, crop: 'limit' }];
    }
    return {
      folder: 'hero-carousel',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4'],
      resource_type: 'auto',
      transformation
    };
  }
});

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

module.exports = upload; 