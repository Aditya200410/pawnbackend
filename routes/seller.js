const express = require('express');
const router = express.Router();
const sellerAuthController = require('../controllers/sellerAuthController');
const sellerAuth = require('../middleware/sellerAuth');
const { handleMultipleImages, handleProfileImage } = require('../middleware/sellerUpload');

// Public routes
router.post('/register', handleMultipleImages, sellerAuthController.register);
router.post('/login', sellerAuthController.login);

// Admin route to get all sellers
router.get('/all', sellerAuthController.getAllSellers);

// Protected routes
router.get('/profile', sellerAuth, sellerAuthController.getProfile);
router.put('/profile', sellerAuth, sellerAuthController.updateProfile);
router.post('/upload-images', sellerAuth, handleMultipleImages, sellerAuthController.uploadImages);
router.post('/upload-profile-image', sellerAuth, handleProfileImage, sellerAuthController.uploadProfileImage);
router.delete('/delete-image/:imageId', sellerAuth, sellerAuthController.deleteImage);

module.exports = router; 