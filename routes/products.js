// File: admin/backend/routes/products.js
const express = require("express");
const router = express.Router();
const { productMultipleUpload } = require('../middleware/upload');
const { isAdmin, authenticateToken } = require('../middleware/auth');
const {
  getAllProducts,
  getProduct,
  createProductWithFiles,
  updateProductWithFiles,
  deleteProduct,
  getProductsByCategory
} = require('../controllers/productController');

// Public routes
router.get("/", getAllProducts);
router.get("/category/:category", getProductsByCategory);
router.get("/:id", getProduct);

// Admin routes
router.post("/", authenticateToken, isAdmin, productMultipleUpload, createProductWithFiles);
router.put("/:id", authenticateToken, isAdmin, productMultipleUpload, updateProductWithFiles);
router.delete("/:id", authenticateToken, isAdmin, deleteProduct);

module.exports = router;
