// File: admin/backend/routes/products.js
const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const Product = require('../models/Product');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../data/userproduct');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Helper function to handle file upload errors
const handleUpload = (req, res, next) => {
  const uploadMiddleware = upload.array('images', 5); // Allow up to 5 images

  uploadMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({
        error: 'File upload error',
        details: err.message
      });
    } else if (err) {
      console.error('Unknown upload error:', err);
      return res.status(500).json({
        error: 'Unknown upload error',
        details: err.message
      });
    }
    next();
  });
};

// Create a new product
router.post('/', authenticateToken, isAdmin, handleUpload, async (req, res) => {
  try {
    console.log('Creating product with body:', req.body);
    console.log('Files:', req.files);

    const productData = {
      ...req.body,
      images: req.files ? req.files.map(file => file.path.replace(/\\/g, '/')) : []
    };

    const product = new Product(productData);
    const savedProduct = await product.save();
    
    console.log('Product created successfully:', savedProduct);
    res.status(201).json(savedProduct);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      error: 'Error creating product',
      details: error.message
    });
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      error: 'Error fetching products',
      details: error.message
    });
  }
});

// Get a single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      error: 'Error fetching product',
      details: error.message
    });
  }
});

// Update a product
router.put('/:id', authenticateToken, isAdmin, handleUpload, async (req, res) => {
  try {
    console.log('Updating product with body:', req.body);
    console.log('Files:', req.files);

    const productData = { ...req.body };
    if (req.files && req.files.length > 0) {
      productData.images = req.files.map(file => file.path.replace(/\\/g, '/'));
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      productData,
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    console.log('Product updated successfully:', updatedProduct);
    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      error: 'Error updating product',
      details: error.message
    });
  }
});

// Delete a product
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete associated image files
    if (product.images && product.images.length > 0) {
      product.images.forEach(imagePath => {
        const fullPath = path.join(__dirname, '..', imagePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      error: 'Error deleting product',
      details: error.message
    });
  }
});

module.exports = router;
