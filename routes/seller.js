const express = require('express');
const router = express.Router();
const sellerAuthController = require('../controllers/sellerAuthController');
const { handleMultipleImages, handleProfileImage } = require('../middleware/sellerUpload');

// Public routes
router.post('/register', handleMultipleImages, sellerAuthController.register);
router.post('/login', sellerAuthController.login);

// Admin route to get all sellers
router.get('/all', sellerAuthController.getAllSellers);

// Profile routes (using email-based authentication)
router.get('/profile', sellerAuthController.getProfile);
router.put('/profile', sellerAuthController.updateProfile);
router.post('/upload-images', handleMultipleImages, sellerAuthController.uploadImages);
router.post('/upload-profile-image', handleProfileImage, sellerAuthController.uploadProfileImage);
router.delete('/delete-image/:imageId', sellerAuthController.deleteImage);

module.exports = router; 