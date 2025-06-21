const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

// Path to JSON file where products are stored
const dataFilePath = path.join(__dirname, "../data/shop.json");

// Helper to read products from JSON file
function readProducts() {
  console.log('Reading products from:', dataFilePath);
  if (!fs.existsSync(dataFilePath)) {
    console.log('Shop.json file does not exist, creating empty array');
    fs.writeFileSync(dataFilePath, "[]", "utf-8");
  }
  const data = fs.readFileSync(dataFilePath, "utf-8");
  const products = JSON.parse(data);
  console.log(`Loaded ${products.length} products from shop.json`);
  return products;
}

// Helper to write products to JSON file
function writeProducts(products) {
  fs.writeFileSync(dataFilePath, JSON.stringify(products, null, 2));
}

// Get all products
router.get("/", (req, res) => {
  try {
    console.log('GET /api/shop - Fetching all products');
    const products = readProducts();
    console.log(`Returning ${products.length} products`);
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products', details: error.message });
  }
});

// Add a new product
router.post("/", (req, res) => {
  const newProduct = req.body;

  // Validate required fields based on the detailed product schema
  const requiredFields = [
    "id",
    "name",
    "price",
    "regularPrice",
    "category",
    "image",
    "preview",
    "color",
    "size",
    "font",
    "rating",
    "reviews",
    "inStock",
    "description",
  ];

  for (const field of requiredFields) {
    if (newProduct[field] === undefined) {
      return res.status(400).json({ error: `Field "${field}" is required` });
    }
  }

  const products = readProducts();

  // Prevent adding product with duplicate id
  if (products.find((p) => p.id === newProduct.id)) {
    return res.status(400).json({ error: "Product with this id already exists" });
  }

  products.push(newProduct);
  writeProducts(products);
  res.status(201).json({ message: "Product added", product: newProduct });
});

// Delete product by id
router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  let products = readProducts();
  const exists = products.some((p) => p.id === id);
  if (!exists) {
    return res.status(404).json({ error: "Product not found" });
  }
  products = products.filter((p) => p.id !== id);
  writeProducts(products);
  res.json({ message: "Product deleted" });
});

// Update product by id
router.put("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updatedProduct = req.body;

  // Validate required fields
  const requiredFields = [
    "id",
    "name",
    "price",
    "regularPrice",
    "category",
    "image",
    "preview",
    "color",
    "size",
    "font",
    "rating",
    "reviews",
    "inStock",
    "description",
  ];

  for (const field of requiredFields) {
    if (updatedProduct[field] === undefined) {
      return res.status(400).json({ error: `Field "${field}" is required` });
    }
  }

  let products = readProducts();
  let productIndex = products.findIndex((p) => p.id === id);

  if (productIndex === -1) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Make sure the id in URL matches the id in body
  if (updatedProduct.id !== id) {
    return res.status(400).json({ error: "Product ID mismatch" });
  }

  products[productIndex] = updatedProduct;
  writeProducts(products);
  res.json({ message: "Product updated", product: updatedProduct });
});

module.exports = router;
 