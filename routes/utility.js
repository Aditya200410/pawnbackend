const express = require('express');
const router = express.Router();
const utilityController = require('../controllers/utilityController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

router.post('/migrate-images', authenticateToken, isAdmin, utilityController.migrateCloudinary);

module.exports = router;
