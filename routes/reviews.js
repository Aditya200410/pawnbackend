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
// We'll create a custom middleware that makes authentication optional
const optionalAuth = (req, res, next) => {
  // Try to authenticate, but don't fail if no token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // If token is provided, try to authenticate
    authenticateToken(req, res, next);
  } else {
    // No token provided, continue without authentication
    req.user = null;
    next();
  }
};

router.post('/', optionalAuth, createReview);
router.put('/:reviewId', optionalAuth, updateReview);
router.delete('/:reviewId', optionalAuth, deleteReview);

module.exports = router; 