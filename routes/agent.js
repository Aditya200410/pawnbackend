const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const commissionController = require('../controllers/commissionController');
const withdrawalController = require('../controllers/withdrawalController');
const protectAgent = require('../middleware/agentAuth');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Routes
router.post('/register', agentController.register);
router.post('/login', agentController.login);
// Seller/Admin might use this, but it was public/protected by logic before. keeping as is or using general auth if needed.
// For now, leaving as is from previous state (it was just agentController.getAgentsBySeller)
router.get('/seller/:sellerId', agentController.getAgentsBySeller);

// Protected Agent Routes
router.get('/profile', protectAgent, agentController.getProfile);
router.put('/profile', protectAgent, agentController.updateProfile);

// Commission History
router.get('/commission-history', protectAgent, commissionController.getAgentCommissionHistory);

// Withdrawal Routes
router.post('/withdrawal/request', protectAgent, withdrawalController.requestAgentWithdrawal);
router.get('/withdrawal/history', protectAgent, withdrawalController.getAgentWithdrawalHistory);

// Admin Routes
router.get('/admin/all', authenticateToken, isAdmin, agentController.getAllAgents);

module.exports = router;
