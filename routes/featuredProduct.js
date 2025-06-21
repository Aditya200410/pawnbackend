const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Path to JSON file where featured products are stored
const dataFilePath = path.join(__dirname, "../data/featuredProducts.json");

// Helper to read featured products from JSON file
function readFeaturedProducts() {
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, "[]", "utf-8");
  }
  const data = fs.readFileSync(dataFilePath, "utf-8");
  return JSON.parse(data);
}

// Helper to write featured products to JSON file
function writeFeaturedProducts(products) {
  fs.writeFileSync(dataFilePath, JSON.stringify(products, null, 2));
}

// Get all featured products
router.get('/', (req, res) => {
  try {
    const products = readFeaturedProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch featured products' });
  }
});

// Get single featured product
router.get('/:id', (req, res) => {
  try {
    const products = readFeaturedProducts();
    const product = products.find(p => p.id === parseInt(req.params.id));
    if (!product) {
      return res.status(404).json({ error: 'Featured product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch featured product' });
  }
});

// Create new featured product
router.post('/', (req, res) => {
  try {
    const newProduct = req.body;
    if (!newProduct.name || !newProduct.price || !newProduct.image) {
      return res.status(400).json({ error: 'Name, price, and image are required' });
    }

    const products = readFeaturedProducts();
    newProduct.id = Date.now();
    products.push(newProduct);
    writeFeaturedProducts(products);
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create featured product' });
  }
});

// Update featured product
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updatedProduct = req.body;
    let products = readFeaturedProducts();
    const productIndex = products.findIndex(p => p.id === id);

    if (productIndex === -1) {
      return res.status(404).json({ error: 'Featured product not found' });
    }

    products[productIndex] = { ...products[productIndex], ...updatedProduct };
    writeFeaturedProducts(products);
    res.json(products[productIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update featured product' });
  }
});

// Delete featured product
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let products = readFeaturedProducts();
    const productIndex = products.findIndex(p => p.id === id);

    if (productIndex === -1) {
      return res.status(404).json({ error: 'Featured product not found' });
    }

    products.splice(productIndex, 1);
    writeFeaturedProducts(products);
    res.json({ message: 'Featured product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete featured product' });
  }
});

module.exports = router; 