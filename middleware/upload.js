const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create storage for different folders
const createStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folder,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi'],
      resource_type: 'auto',
      transformation: [
        { width: 800, height: 600, crop: 'limit' },
        { quality: 'auto' }
      ]
    }
  });
};

// Configure multer for different upload types
const createUpload = (folder) => {
  return multer({
    storage: createStorage(folder),
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Check file type
      if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
      }
    }
  });
};

// Export different upload configurations
module.exports = {
  // Hero carousel upload
  heroUpload: createUpload('hero-carousel'),
  
  // Category upload
  categoryUpload: createUpload('categories'),
  
  // Product upload
  productUpload: createUpload('products'),
  
  // General upload
  generalUpload: createUpload('general'),
  
  // Multiple files upload for products
  productMultipleUpload: multer({
    storage: createStorage('products'),
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
      }
    }
  }).array('images', 5), // Allow up to 5 files
  
  // Cloudinary instance for direct uploads
  cloudinary: cloudinary,
  
  // Helper function to delete file from Cloudinary
  deleteFromCloudinary: async (publicId) => {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (error) {
      console.error('Error deleting from Cloudinary:', error);
      throw error;
    }
  },
  
  // Helper function to upload file directly to Cloudinary
  uploadToCloudinary: async (file, folder = 'general') => {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: folder,
        resource_type: 'auto',
        transformation: [
          { width: 800, height: 600, crop: 'limit' },
          { quality: 'auto' }
        ]
      });
      return {
        url: result.secure_url,
        publicId: result.public_id
      };
    } catch (error) {
      console.error('Error uploading to Cloudinary:', error);
      throw error;
    }
  }
}; 