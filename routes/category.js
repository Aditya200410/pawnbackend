const express = require('express');
const router = express.Router();
const multer = require('multer');
const { isAdmin, authenticateToken } = require('../middleware/auth');

const categoryController = require('../controllers/categoryController');

// Configure storage
const fs = require('fs');
const path = require('path');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/categories');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'category-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Upload multiple files (image + video)
const uploadFiles = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]);

const handleUpload = (req, res, next) => {
  console.log('Multer handleUpload called');
  uploadFiles(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      console.error('Unexpected upload error:', err);
      return res.status(500).json({ error: 'File upload error', details: err.message });
    }
    console.log('Multer upload successful');
    next();
  });
};

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategory);

// Protected admin routes with file upload
router.put('/reorder', authenticateToken, isAdmin, categoryController.reorderCategories);
router.post('/', authenticateToken, isAdmin, handleUpload, categoryController.createCategory);
router.post('/upload', authenticateToken, isAdmin, handleUpload, categoryController.createCategory);
router.put('/:id', authenticateToken, isAdmin, handleUpload, categoryController.updateCategory);
router.put('/:id/upload', authenticateToken, isAdmin, handleUpload, categoryController.updateCategory);
router.delete('/:id', authenticateToken, isAdmin, categoryController.deleteCategory);

module.exports = router; 