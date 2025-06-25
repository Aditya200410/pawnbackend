const express = require('express');
const router = express.Router();
const sellerAuthController = require('../controllers/sellerAuthController');
const sellerAuth = require('../middleware/sellerAuth');

// Public routes
router.post('/register', sellerAuthController.register);
router.post('/login', sellerAuthController.login);

// Protected routes
router.get('/profile', sellerAuth, sellerAuthController.getProfile);
router.put('/profile', sellerAuth, sellerAuthController.updateProfile);

module.exports = router; 