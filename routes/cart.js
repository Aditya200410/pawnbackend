const express = require('express');
const router = express.Router();
const { 
  getCart, 
  addToCart, 
  updateQuantity, 
  removeFromCart, 
  clearCart 
} = require('../controllers/cartController');
const auth = require('../middleware/auth');

// All cart routes require authentication
router.use(auth);

// Get user's cart
router.get('/', getCart);

// Add item to cart
router.post('/add', addToCart);

// Update item quantity
router.put('/update', updateQuantity);

// Remove item from cart
router.delete('/remove/:productId', removeFromCart);

// Clear cart
router.delete('/clear', clearCart);

module.exports = router; 