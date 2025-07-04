const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const sellerAuth = require('../middleware/sellerAuth');
const adminAuth = require('../middleware/auth');

// Seller routes (protected by sellerAuth)
router.post('/request', sellerAuth, withdrawalController.requestWithdrawal);
router.get('/history', sellerAuth, withdrawalController.getWithdrawalHistory);
router.get('/details/:withdrawalId', sellerAuth, withdrawalController.getWithdrawalDetails);
router.put('/cancel/:withdrawalId', sellerAuth, withdrawalController.cancelWithdrawal);

// Admin routes (protected by adminAuth)
router.get('/admin/all', adminAuth, withdrawalController.getAllWithdrawals);
router.put('/admin/approve/:withdrawalId', adminAuth, withdrawalController.approveWithdrawal);
router.put('/admin/reject/:withdrawalId', adminAuth, withdrawalController.rejectWithdrawal);
router.put('/admin/complete/:withdrawalId', adminAuth, withdrawalController.completeWithdrawal);

module.exports = router; 