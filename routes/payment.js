const express = require('express');
const router = express.Router();
const phonepeController = require('../controllers/phonepeController');

// Add PhonePe payment route
router.post('/phonepe', phonepeController.createPhonePeOrder);

// PhonePe callback endpoint
router.post('/phonepe/callback', phonepeController.phonePeCallback);

// Get PhonePe payment status
router.get('/phonepe/status/:transactionId', phonepeController.getPhonePeStatus);

module.exports = router;

module.exports = router; 