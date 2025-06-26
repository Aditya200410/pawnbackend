const express = require('express');
const router = express.Router();
const { isAdmin, authenticateToken } = require('../middleware/auth');
const multer = require('multer');

const {
  upload,
  getAllCarouselItems,
  getActiveCarouselItems,
  createCarouselItemWithFiles,
  updateCarouselItemWithFiles,
  deleteCarouselItem,
  toggleCarouselActive,
  updateCarouselOrder
} = require('../controllers/heroCarouselController');

// Configure multiple file upload fields
const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 }
]);

// Middleware to handle multer upload
const handleUpload = (req, res, next) => {
  uploadFields(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'File upload error', details: err.message });
    }
    next();
  });
};

// Public routes
router.get('/', getAllCarouselItems);
router.get('/active', getActiveCarouselItems);

// Protected routes
router.post('/', authenticateToken, isAdmin, handleUpload, createCarouselItemWithFiles);
router.put('/:id', authenticateToken, isAdmin, handleUpload, updateCarouselItemWithFiles);
router.delete('/:id', authenticateToken, isAdmin, deleteCarouselItem);
router.patch('/:id/toggle-active', authenticateToken, isAdmin, toggleCarouselActive);
router.put('/order/update', authenticateToken, isAdmin, updateCarouselOrder);

module.exports = router; 