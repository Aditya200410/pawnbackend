const express = require('express');
const router = express.Router();
const commissionController = require('../controllers/commissionController');
const sellerAuth = require('../middleware/sellerAuth');
const adminAuth = require('../middleware/auth');

// Seller routes (protected by sellerAuth)
router.get('/history', sellerAuth, commissionController.getCommissionHistory);
router.get('/details/:commissionId', sellerAuth, commissionController.getCommissionDetails);
router.get('/summary', sellerAuth, commissionController.getCommissionSummary);

// Admin routes (protected by adminAuth)
router.get('/admin/all', adminAuth, commissionController.getAllCommissionHistory);
router.put('/admin/confirm/:commissionId', adminAuth, commissionController.confirmCommission);
router.put('/admin/cancel/:commissionId', adminAuth, commissionController.cancelCommission);

module.exports = router; 