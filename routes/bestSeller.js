const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { 
  getAllBestSellers, 
  getBestSeller, 
  createBestSellerWithFiles, 
  updateBestSellerWithFiles, 
  deleteBestSeller 
} = require('../controllers/bestSellerController');

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
    folder: 'pawnshop-bestsellers',
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

// Middleware to handle multer upload
const handleUpload = (req, res, next) => {
  uploadImages(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'File upload error', details: err.message });
    }
    next();
  });
};

// Get all best seller products
router.get("/", getAllBestSellers);

// Get single best seller product
router.get("/:id", getBestSeller);

// Upload images and create best seller product
router.post("/upload", handleUpload, createBestSellerWithFiles);

// Update best seller product by id
router.put("/:id", handleUpload, updateBestSellerWithFiles);

// Delete best seller product by id
router.delete("/:id", deleteBestSeller);

module.exports = router;
