const express = require('express');
const router = express.Router();
const {
  createPhonePeOrder,
  phonePeCallback,
  getPhonePeStatus
} = require('../controllers/phonepeController');

// Create a new PhonePe payment order
router.post('/phonepe', createPhonePeOrder);

// Handle callback from PhonePe after payment
router.post('/phonepe/callback', phonePeCallback);

// Check the status of a PhonePe transaction
router.get('/phonepe/status/:transactionId', getPhonePeStatus);

module.exports = router;
