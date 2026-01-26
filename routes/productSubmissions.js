const express = require('express');
const router = express.Router();
const productSubmissionController = require('../controllers/productSubmissionController');
const { handleProductSubmissionImage } = require('../middleware/productSubmissionUpload');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Public route to submit product
router.post('/submit', handleProductSubmissionImage, productSubmissionController.submitProduct);

// Admin route to get all submissions
router.get('/all', authenticateToken, isAdmin, productSubmissionController.getAllSubmissions);

// Admin route to delete a submission
router.delete('/:id', authenticateToken, isAdmin, productSubmissionController.deleteSubmission);

module.exports = router;
