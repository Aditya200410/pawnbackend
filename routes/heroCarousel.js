const express = require('express');
const router = express.Router();
const { 
  upload,
  getCarouselItems,
  getActiveCarouselItems,
  createCarouselItem,
  updateCarouselItem,
  deleteCarouselItem,
  updateCarouselOrder,
  toggleCarouselActive
} = require('../controllers/heroCarouselController');
const { isAdmin, authenticateToken } = require('../middleware/auth');

// Public routes
router.get('/active', getActiveCarouselItems);

// Admin routes
router.get('/', authenticateToken, isAdmin, getCarouselItems);
router.post('/', authenticateToken, isAdmin, upload.single('image'), createCarouselItem);
router.put('/:id', authenticateToken, isAdmin, upload.single('image'), updateCarouselItem);
router.delete('/:id', authenticateToken, isAdmin, deleteCarouselItem);
router.put('/order/update', authenticateToken, isAdmin, updateCarouselOrder);
router.put('/toggle/:id', authenticateToken, isAdmin, toggleCarouselActive);

module.exports = router; 