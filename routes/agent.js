const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const commissionController = require('../controllers/commissionController');
const withdrawalController = require('../controllers/withdrawalController');
const protectAgent = require('../middleware/agentAuth');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const { handleMultipleImages } = require('../middleware/sellerUpload');

// Routes
router.post('/register', handleMultipleImages, agentController.register);
router.post('/login', agentController.login);
router.post('/otp-login', agentController.otpLogin);
// Seller/Admin might use this, but it was public/protected by logic before. keeping as is or using general auth if needed.
// For now, leaving as is from previous state (it was just agentController.getAgentsBySeller)
router.get('/seller/:sellerId', agentController.getAgentsBySeller);

// Protected Agent Routes
router.get('/profile', protectAgent, agentController.getProfile);
router.put('/profile', protectAgent, handleMultipleImages, agentController.updateProfile);
router.get('/my-agents', protectAgent, agentController.getMyAgents);

// Commission History
router.get('/commission-history', protectAgent, commissionController.getAgentCommissionHistory);

// Withdrawal Routes
router.post('/withdrawal/request', protectAgent, withdrawalController.requestAgentWithdrawal);
router.get('/withdrawal/history', protectAgent, withdrawalController.getAgentWithdrawalHistory);

// Admin Routes
router.get('/admin/all', authenticateToken, isAdmin, agentController.getAllAgents);

module.exports = router;