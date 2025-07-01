const express = require('express');
const router = express.Router();
const sellerAuthController = require('../controllers/sellerAuthController');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');

// Simple multer setup for image upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/register', sellerAuthController.register);
router.post('/login', sellerAuthController.login);
router.get('/profile', authenticateToken, sellerAuthController.getProfile);
router.put('/profile', authenticateToken, sellerAuthController.updateProfile);
router.post('/upload-images', authenticateToken, sellerAuthController.uploadImages);
router.post('/upload-profile-image', authenticateToken, sellerAuthController.uploadProfileImage);
// Image upload endpoints can be added here as needed

module.exports = router; 