const express = require('express');
const router = express.Router();
const { isAdmin, authenticateToken } = require('../middleware/auth');

const {
  upload,
  getAllCarouselItems,
  getActiveCarouselItems,
  createCarouselItem,
  updateCarouselItem,
  deleteCarouselItem,
  toggleCarouselActive,
  updateCarouselOrder
} = require('../controllers/heroCarouselController');

// Public routes
router.get('/', getAllCarouselItems);
router.get('/active', getActiveCarouselItems);

// Admin routes
router.post('/', authenticateToken, isAdmin, upload, createCarouselItem);
router.put('/:id', authenticateToken, isAdmin, upload, updateCarouselItem);
router.delete('/:id', authenticateToken, isAdmin, deleteCarouselItem);
router.patch('/:id/toggle-active', authenticateToken, isAdmin, toggleCarouselActive);
router.put('/order/update', authenticateToken, isAdmin, updateCarouselOrder);

module.exports = router; 