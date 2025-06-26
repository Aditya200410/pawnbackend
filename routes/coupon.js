const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { auth } = require('../middleware/auth');

// Admin routes (protected)
router.get('/', auth, couponController.getAllCoupons);
router.post('/', auth, couponController.createCoupon);
router.put('/:id', auth, couponController.updateCoupon);
router.delete('/:id', auth, couponController.deleteCoupon);

// Public routes
router.post('/validate', couponController.validateCoupon);
router.post('/apply', couponController.applyCoupon);

module.exports = router; 