const express = require('express');
const router = express.Router();
const { adminLogin, adminSignup, verifyAdminToken } = require('../controllers/adminAuthController');

// Admin login route
router.post('/login', adminLogin);

// Admin signup route
router.post('/signup', adminSignup);

// Admin token verification route
router.get('/verify', verifyAdminToken);

module.exports = router; 