const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Path to JSON file where products are stored
const dataFilePath = path.join(__dirname, "../data/seller.json");

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
    folder: 'pawnshop-bestsellers',
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
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, "[]", "utf-8");
  }
  const data = fs.readFileSync(dataFilePath, "utf-8");
  return JSON.parse(data);
}

// Helper to write products to JSON file
function writeProducts(products) {
  fs.writeFileSync(dataFilePath, JSON.stringify(products, null, 2));
}

// Get all products
router.get("/", (req, res) => {
  const products = readProducts();
  res.json(products);
});

// Add a new product with file upload
router.post("/upload", (req, res, next) => {
  uploadImages(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      console.error('Other error:', err);
      return res.status(400).json({ error: 'File upload error', details: err.message });
    }
    
    try {
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

      // Create product object
      const newProduct = {
        id: Date.now(),
        name: productData.name,
        price: parseFloat(productData.price),
        regularPrice: parseFloat(productData.regularPrice),
        category: productData.category,
        image: imagePaths[0], // Main image Cloudinary URL
        preview: imagePaths[0], // Use main image as preview
        color: productData.color || "",
        size: productData.size || "",
        font: productData.font || "",
        rating: productData.rating ? parseFloat(productData.rating) : 0,
        reviews: productData.reviews ? parseInt(productData.reviews, 10) : 0,
        inStock: productData.inStock === 'true' || productData.inStock === true,
        description: productData.description,
        images: imagePaths // All Cloudinary URLs
      };

      const products = readProducts();
      products.push(newProduct);
      writeProducts(products);

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

// Add a new product (legacy JSON endpoint)
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

// Update product with file upload
router.put("/:id/upload", (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  
  uploadImages(req, res, async function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      console.error('Other error:', err);
      return res.status(400).json({ error: 'File upload error', details: err.message });
    }
    
    try {
      const files = req.files;
      const productData = req.body;
      let products = readProducts();
      let productIndex = products.findIndex((p) => p.id === id);

      if (productIndex === -1) {
        return res.status(404).json({ error: "Product not found" });
      }

      const existingProduct = products[productIndex];
      
      // Process uploaded files
      const imagePaths = [];
      
      // Main image
      if (files.mainImage && files.mainImage[0]) {
        const mainImageUrl = files.mainImage[0].path;
        imagePaths.push(mainImageUrl);
      } else {
        // Keep existing main image
        imagePaths.push(existingProduct.image);
      }

      // Additional images
      for (let i = 1; i <= 3; i++) {
        if (files[`image${i}`] && files[`image${i}`][0]) {
          const imageUrl = files[`image${i}`][0].path;
          imagePaths.push(imageUrl);
        } else if (existingProduct.images && existingProduct.images[i]) {
          // Keep existing additional image
          imagePaths.push(existingProduct.images[i]);
        }
      }

      // Update product object
      const updatedProduct = {
        id: id,
        name: productData.name || existingProduct.name,
        price: productData.price ? parseFloat(productData.price) : existingProduct.price,
        regularPrice: productData.regularPrice ? parseFloat(productData.regularPrice) : existingProduct.regularPrice,
        category: productData.category || existingProduct.category,
        image: imagePaths[0],
        preview: imagePaths[0],
        color: productData.color || existingProduct.color || "",
        size: productData.size || existingProduct.size || "",
        font: productData.font || existingProduct.font || "",
        rating: productData.rating ? parseFloat(productData.rating) : existingProduct.rating || 0,
        reviews: productData.reviews ? parseInt(productData.reviews, 10) : existingProduct.reviews || 0,
        inStock: productData.inStock !== undefined ? (productData.inStock === 'true' || productData.inStock === true) : existingProduct.inStock,
        description: productData.description || existingProduct.description,
        images: imagePaths
      };

      products[productIndex] = updatedProduct;
      writeProducts(products);

      res.json({ 
        message: "Product updated successfully", 
        product: updatedProduct,
        uploadedFiles: files
      });

    } catch (error) {
      console.error('Error updating product:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to update product', details: error.message });
    }
  });
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

// Update product by id (legacy JSON endpoint)
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
