const express = require("express");
const router = express.Router();
const multer = require('multer');
const { isAdmin, authenticateToken } = require('../middleware/auth');
const {
  getAllBestSellers,
  getBestSeller,
  createBestSellerWithFiles,
  updateBestSellerWithFiles,
  deleteBestSeller
} = require('../controllers/bestSellerController');

// Configure storage
const fs = require('fs');
const path = require('path');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/bestsellers');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bestseller-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Configure multiple file upload fields
const uploadFields = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 }
]);

// Middleware to handle multer upload
const handleUpload = (req, res, next) => {
  uploadFields(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'File upload error', details: err.message });
    }
    next();
  });
};

// Public routes
router.get("/", getAllBestSellers);
router.get("/:id", getBestSeller);

// Admin routes
router.post("/", authenticateToken, isAdmin, handleUpload, createBestSellerWithFiles);
router.put("/:id", authenticateToken, isAdmin, handleUpload, updateBestSellerWithFiles);
router.delete("/:id", authenticateToken, isAdmin, deleteBestSeller);

module.exports = router;
