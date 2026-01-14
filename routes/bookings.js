const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');

router.post('/create', bookingController.createBooking);
router.post('/phonepe/callback', bookingController.phonePeBookingCallback);
router.get('/status/:customBookingId', bookingController.getBookingStatus);

module.exports = router;
