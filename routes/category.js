const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { isAdmin, authenticateToken } = require('../middleware/auth');
const categoryController = require('../controllers/categoryController');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pawnshop-categories',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm', 'ogg'],
    resource_type: 'auto', // This allows both images and videos
  },
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategory);

// Protected admin routes with file upload
router.post('/', authenticateToken, isAdmin, upload.single('image'), categoryController.createCategory);
router.post('/upload', authenticateToken, isAdmin, upload.single('image'), categoryController.createCategory);
router.put('/:id', authenticateToken, isAdmin, upload.single('image'), categoryController.updateCategory);
router.put('/:id/upload', authenticateToken, isAdmin, upload.single('image'), categoryController.updateCategory);
router.delete('/:id', authenticateToken, isAdmin, categoryController.deleteCategory);

module.exports = router; 