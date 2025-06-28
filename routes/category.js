const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { categoryUpload } = require('../middleware/upload');
const auth = require('../middleware/auth');

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategory);
router.get('/slug/:slug', categoryController.getCategoryBySlug);

// Protected admin routes with file upload
router.post('/', auth, categoryUpload.single('image'), categoryController.createCategory);
router.put('/:id', auth, categoryUpload.single('image'), categoryController.updateCategory);
router.delete('/:id', auth, categoryController.deleteCategory);

module.exports = router; 