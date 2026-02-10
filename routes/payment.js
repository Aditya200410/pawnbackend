const express = require('express');
const router = express.Router();
const razorpayController = require('../controllers/razorpayController');

// Razorpay Payment Routes
router.post('/razorpay/create-order', razorpayController.createRazorpayOrder);
router.post('/razorpay/verify', razorpayController.verifySignature);
router.get('/razorpay/status/:orderId', razorpayController.getRazorpayStatus);

// Magic Checkout Mandatory Endpoints (Public)
router.post('/razorpay/shipping-info', razorpayController.getShippingInfo);
router.post('/razorpay/get-promotions', razorpayController.getPromotions);
router.post('/razorpay/apply-promotion', razorpayController.applyPromotion);

module.exports = router;
