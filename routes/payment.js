const express = require('express');
const router = express.Router();
const razorpayController = require('../controllers/razorpayController');

// Razorpay Payment Routes
router.post('/razorpay/create-order', razorpayController.createRazorpayOrder);
router.post('/razorpay/verify', razorpayController.verifySignature);
router.get('/razorpay/status/:orderId', razorpayController.getRazorpayStatus);

// Magic Checkout Mandatory Endpoints (Public)
router.post('/razorpay/shipping-info', razorpayController.getShippingInfo);
router.get('/razorpay/shipping-info', (req, res) => res.status(200).json({ message: "Magic Checkout Shipping API is active. Please use POST and 'api/api' path." }));

router.post('/razorpay/get-promotions', razorpayController.getPromotions);
router.get('/razorpay/get-promotions', (req, res) => res.status(200).json({ message: "Magic Checkout Promotions API is active. Please use POST and 'api/api' path." }));

router.post('/razorpay/apply-promotion', razorpayController.applyPromotion);
router.get('/razorpay/apply-promotion', (req, res) => res.status(200).json({ message: "Magic Checkout Apply API is active. Please use POST and 'api/api' path." }));

module.exports = router;
