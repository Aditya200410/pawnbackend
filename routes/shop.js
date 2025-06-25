const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { 
  getAllProducts, 
  getProduct, 
  createProductWithFiles, 
  updateProductWithFiles, 
  deleteProduct 
} = require('../controllers/productController');

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
    folder: 'pawnshop-products',
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

// Get all products
router.get("/", getAllProducts);

// Get single product
router.get("/:id", getProduct);

// Upload images and create product
router.post("/upload", uploadImages, createProductWithFiles);

// Update product by id
router.put("/:id", uploadImages, updateProductWithFiles);

// Delete product by id
router.delete("/:id", deleteProduct);

module.exports = router;
 