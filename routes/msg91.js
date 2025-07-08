const express = require('express');
const router = express.Router();
const msg91Controller = require('../controllers/msg91Controller');

router.post('/send-otp', msg91Controller.sendOtp);
router.post('/verify-otp', msg91Controller.verifyOtp);

module.exports = router; 