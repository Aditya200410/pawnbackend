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
const { isAdmin } = require('../middleware/auth');

// Public routes
router.get('/active', getActiveCarouselItems);

// Admin routes
router.get('/', isAdmin, getCarouselItems);
router.post('/', isAdmin, upload.single('image'), createCarouselItem);
router.put('/:id', isAdmin, upload.single('image'), updateCarouselItem);
router.delete('/:id', isAdmin, deleteCarouselItem);
router.put('/order/update', isAdmin, updateCarouselOrder);
router.put('/toggle/:id', isAdmin, toggleCarouselActive);

module.exports = router; 