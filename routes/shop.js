const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Path to JSON file where products are stored
const dataFilePath = path.join(__dirname, "../data/shop.json");
const userProductDir = path.join(__dirname, "../data/userproduct");

// Ensure userproduct directory exists
if (!fs.existsSync(userProductDir)) {
  fs.mkdirSync(userProductDir, { recursive: true });
}

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pawnshop-products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
  },
});

const upload = multer({ storage: storage });

// Upload multiple images (main image + 3 additional images)
const uploadImages = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 }
]);

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

// Upload images and create product
router.post("/upload", (req, res, next) => {
  uploadImages(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      console.error('Other error:', err);
      return res.status(400).json({ error: 'File upload error', details: err.message });
    }
    
    // If no error, proceed with the upload logic
    try {
      console.log('POST /api/shop/upload - Uploading images and creating product');
      console.log('Request body:', req.body);
      console.log('Request files:', req.files);
      
      if (!req.files) {
        console.error('No files received in the request.');
        return res.status(400).json({ error: 'No files received. Make sure you are uploading as multipart/form-data and the main image field is named "mainImage".' });
      }
      const files = req.files;
      const productData = req.body;
      
      // Validate required fields
      const requiredFields = [
        "name",
        "price",
        "regularPrice",
        "category",
        "description"
      ];

      for (const field of requiredFields) {
        if (!productData[field]) {
          console.error(`Missing required field: ${field}`);
          return res.status(400).json({ error: `Field "${field}" is required` });
        }
      }

      // Process uploaded files
      const imagePaths = [];
      
      // Main image
      if (files.mainImage && files.mainImage[0]) {
        const mainImageUrl = files.mainImage[0].path; // Cloudinary URL
        imagePaths.push(mainImageUrl);
        console.log('Main image Cloudinary URL:', mainImageUrl);
      } else {
        console.error('No main image uploaded');
        return res.status(400).json({ error: "Main image is required" });
      }

      // Additional images
      for (let i = 1; i <= 3; i++) {
        if (files[`image${i}`] && files[`image${i}`][0]) {
          const imageUrl = files[`image${i}`][0].path; // Cloudinary URL
          imagePaths.push(imageUrl);
          console.log(`Additional image ${i} Cloudinary URL:`, imageUrl);
        }
      }

      console.log('All image paths:', imagePaths);

      // Create product object
      const newProduct = {
        id: Date.now(),
        name: productData.name,
        price: parseFloat(productData.price),
        regularPrice: parseFloat(productData.regularPrice),
        category: productData.category,
        subcategory: productData.subcategory || "",
        image: imagePaths[0], // Main image Cloudinary URL
        preview: imagePaths[0], // Use main image as preview
        color: productData.color || "",
        size: productData.size || "",
        font: productData.font || "",
        rating: productData.rating ? parseFloat(productData.rating) : 0,
        popularity: productData.popularity ? parseFloat(productData.popularity) : 0,
        reviews: productData.reviews ? parseInt(productData.reviews, 10) : 0,
        inStock: productData.inStock === 'true' || productData.inStock === true,
        outOfStock: productData.outOfStock === 'true' || productData.outOfStock === false,
        description: productData.description,
        date: new Date().toISOString().split('T')[0],
        images: imagePaths // All Cloudinary URLs
      };

      console.log('New product object:', newProduct);

      const products = readProducts();
      products.push(newProduct);
      writeProducts(products);

      console.log('Product saved successfully');

      res.status(201).json({ 
        message: "Product created successfully", 
        product: newProduct,
        uploadedFiles: files
      });

    } catch (error) {
      console.error('Error uploading product:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to upload product', details: error.message });
    }
  });
});

// Add a new product (legacy route for backward compatibility)
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
 