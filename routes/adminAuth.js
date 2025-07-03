const express = require('express');
const router = express.Router();
const { adminLogin, adminSignup } = require('../controllers/adminAuthController');

// Admin login route
router.post('/login', adminLogin);

// Admin signup route
router.post('/signup', adminSignup);

module.exports = router; 