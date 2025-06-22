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

// Helper to get all images from a product folder
function getProductImages(productImagePath) {
  try {
    console.log('Getting images for product with image path:', productImagePath);
    
    // Extract the folder path from the image path
    const folderPath = path.dirname(productImagePath);
    console.log('Extracted folder path:', folderPath);
    
    const fullFolderPath = path.join(__dirname, '..', folderPath);
    console.log('Full folder path:', fullFolderPath);
    
    if (!fs.existsSync(fullFolderPath)) {
      console.log(`Folder does not exist: ${fullFolderPath}`);
      return [];
    }
    
    const files = fs.readdirSync(fullFolderPath);
    console.log('Files in folder:', files);
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      const isImage = imageExtensions.includes(ext);
      console.log(`File: ${file}, Extension: ${ext}, Is Image: ${isImage}`);
      return isImage;
    });
    
    console.log('Image files found:', imageFiles);
    
    // Convert to full URLs
    const imageUrls = imageFiles.map(file => {
      return `${folderPath}/${file}`;
    });
    
    console.log(`Found ${imageUrls.length} images for product: ${imageUrls}`);
    return imageUrls;
  } catch (error) {
    console.error('Error getting product images:', error);
    return [];
  }
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

// Get product images by product ID - This must come before other /:id routes
router.get("/:id/images", (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const products = readProducts();
    const product = products.find(p => p.id === productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const images = getProductImages(product.image);
    res.json({ images });
  } catch (error) {
    console.error('Error fetching product images:', error);
    res.status(500).json({ error: 'Failed to fetch product images', details: error.message });
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
 