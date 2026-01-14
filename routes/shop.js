const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  getAllProducts,
  getProduct,
  createProductWithFiles,
  updateProductWithFiles,
  deleteProduct,
  getProductsBySection,
  updateProductSections
} = require('../controllers/productController');

// Configure storage
const fs = require('fs');
const path = require('path');

// Ensure upload directory exists (reuse products folder)
const uploadDir = path.join(__dirname, '../public/uploads/products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Upload multiple images (main image + 3 additional images)
const uploadImages = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 }
]);

// Middleware to handle multer upload
const handleUpload = (req, res, next) => {
  uploadImages(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'File upload error', details: err.message });
    }
    next();
  });
};

// Get all products
router.get("/", getAllProducts);

// Get products by section
router.get("/section/:section", getProductsBySection);

// Get single product
router.get("/:id", getProduct);

// Upload images and create product
router.post("/upload", handleUpload, createProductWithFiles);

// Update product by id
router.put("/:id", handleUpload, updateProductWithFiles);

// Update product sections
router.patch("/:id/sections", updateProductSections);

// Delete product by id
router.delete("/:id", deleteProduct);

module.exports = router;
