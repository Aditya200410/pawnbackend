const express = require('express');
const router = express.Router();
const phonepeController = require('../controllers/phonepeController');

// Debugging
console.log('Controller keys:', Object.keys(phonepeController)); // should include 'createPhonePeOrder'

router.post('/phonepe', phonepeController.createPhonePeOrder);
router.post('/phonepe/callback', phonepeController.phonePeCallback);
router.get('/phonepe/status/:transactionId', phonepeController.getPhonePeStatus);

module.exports = router;
