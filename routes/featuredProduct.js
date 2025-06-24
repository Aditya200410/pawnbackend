const express = require('express');
const router = express.Router();
const multer = require("multer");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const featuredProductController = require('../controllers/featuredProductController');

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
    folder: 'pawnshop-featured',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
  },
});

const upload = multer({ storage: storage });

// Upload multiple images (main image + 3 additional images)
const uploadImages = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 }
]);

// Get all featured products
router.get('/', featuredProductController.getAllFeaturedProducts);

// Get single featured product
router.get('/:id', featuredProductController.getFeaturedProduct);

// Create new featured product with file upload
router.post('/upload', uploadImages, featuredProductController.createFeaturedProductWithFiles);

// Create new featured product (legacy JSON endpoint)
router.post('/', featuredProductController.createFeaturedProduct);

// Update featured product with file upload
router.put('/:id/upload', uploadImages, featuredProductController.updateFeaturedProductWithFiles);

// Update featured product (legacy JSON endpoint)
router.put('/:id', featuredProductController.updateFeaturedProduct);

// Delete featured product
router.delete('/:id', featuredProductController.deleteFeaturedProduct);

module.exports = router; 