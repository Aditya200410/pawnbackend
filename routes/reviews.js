const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  createReview,
  getProductReviews,
  getUserReview,
  updateReview,
  deleteReview
} = require('../controllers/reviewController');

// Public routes (no authentication required)
router.get('/product/:productId', getProductReviews);
router.get('/user/:productId', getUserReview);

// Routes that support both authenticated and unauthenticated users
router.post('/', createReview); // Authentication optional
router.put('/:reviewId', updateReview); // Authentication optional
router.delete('/:reviewId', deleteReview); // Authentication optional

module.exports = router; 