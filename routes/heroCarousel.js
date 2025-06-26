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

// Routes
router.get('/', getAllCarouselItems);
router.get('/active', getActiveCarouselItems);
router.post('/', upload, createCarouselItem);
router.put('/:id', upload, updateCarouselItem);
router.delete('/:id', deleteCarouselItem);
router.patch('/:id/toggle-active', toggleCarouselActive);
router.put('/order/update', updateCarouselOrder);

// Admin routes
router.get('/admin', authenticateToken, isAdmin, getAllCarouselItems);
router.post('/admin', authenticateToken, isAdmin, upload, createCarouselItem);
router.put('/admin/:id', authenticateToken, isAdmin, upload, updateCarouselItem);
router.delete('/admin/:id', authenticateToken, isAdmin, deleteCarouselItem);

module.exports = router; 