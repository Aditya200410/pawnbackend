const Product = require('../models/Product');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

// Get all products
const getAllProducts = async (req, res) => {
  try {
    const { category, minPrice, maxPrice } = req.query;
    let query = {};

    if (category) query.category = category;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Exclude heavy fields for the catalogue view to speed up initial load
    const products = await Product.find(query)
      .select('name price regularPrice category subcategory item image images rating reviews inStock stock date displayOrder')
      .sort({ displayOrder: 1, date: -1 });

    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: "Error fetching products", error: error.message });
  }
};

/**
 * Reorder product (Move up or down)
 */
const reorderProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { direction, section } = req.body; // 'up', 'down' and 'section' (all, featured, etc.)

    const currentProduct = await Product.findById(id);
    if (!currentProduct) return res.status(404).json({ message: "Product not found" });

    // Determine filter query based on section
    let query = {};
    if (section === 'bestsellers') query = { isBestSeller: true };
    else if (section === 'featured') query = { isFeatured: true };
    else if (section === 'mostloved') query = { isMostLoved: true };

    // Get products in this section sorted by displayOrder
    const products = await Product.find(query).sort({ displayOrder: 1, date: -1 });
    const currentIndex = products.findIndex(p => p._id.toString() === id);

    if (currentIndex === -1) return res.status(404).json({ message: "Product not in current view" });

    let targetIndex = -1;
    if (direction === 'up' && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < products.length - 1) {
      targetIndex = currentIndex + 1;
    }

    if (targetIndex !== -1) {
      const targetProduct = products[targetIndex];

      // Swap displayOrder values
      const currentOrder = currentProduct.displayOrder || 0;
      const targetOrder = targetProduct.displayOrder || 0;

      // If they have the same order (e.g., both 0), we need to normalize everyone first
      if (currentOrder === targetOrder) {
        // Normalize all products with sequential orders
        for (let i = 0; i < products.length; i++) {
          await Product.findByIdAndUpdate(products[i]._id, { displayOrder: i });
        }
        // Refetch and retry index
        const updatedProducts = await Product.find(query).sort({ displayOrder: 1, date: -1 });
        const newCurrentIndex = updatedProducts.findIndex(p => p._id.toString() === id);
        let newTargetIndex = direction === 'up' ? newCurrentIndex - 1 : newCurrentIndex + 1;

        const p1 = updatedProducts[newCurrentIndex];
        const p2 = updatedProducts[newTargetIndex];

        await Product.findByIdAndUpdate(p1._id, { displayOrder: p2.displayOrder });
        await Product.findByIdAndUpdate(p2._id, { displayOrder: p1.displayOrder });
      } else {
        await Product.findByIdAndUpdate(currentProduct._id, { displayOrder: targetOrder });
        await Product.findByIdAndUpdate(targetProduct._id, { displayOrder: currentOrder });
      }

      return res.json({ message: "Reordered successfully" });
    }

    res.status(400).json({ message: "Cannot move in that direction" });
  } catch (error) {
    console.error('Error reordering product:', error);
    res.status(500).json({ message: "Error reordering product", error: error.message });
  }
};

// Get products by section
const getProductsBySection = async (req, res) => {
  try {
    const { section } = req.params;
    let query = {};

    switch (section) {
      case 'bestsellers':
        query = { isBestSeller: true };
        break;
      case 'featured':
        query = { isFeatured: true };
        break;
      case 'mostloved':
        query = { isMostLoved: true };
        break;
      default:
        return res.status(400).json({ message: "Invalid section" });
    }

    const products = await Product.find(query)
      .select('name price regularPrice category subcategory item image images rating reviews inStock stock date displayOrder')
      .sort({ displayOrder: 1, date: -1 });

    res.json(products);
  } catch (error) {
    console.error(`Error fetching ${req.params.section} products:`, error);
    res.status(500).json({ message: `Error fetching ${req.params.section} products`, error: error.message });
  }
};

// Get single product
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: "Error fetching product", error: error.message });
  }
};

// Create new product with file upload
const createProductWithFiles = async (req, res) => {
  try {
    console.log('=== Starting Product Creation ===');
    console.log('Headers:', req.headers);
    console.log('Files received:', req.files);
    console.log('Body data:', req.body);
    console.log('Auth token:', req.headers.authorization);

    if (!req.files || !req.files.mainImage) {
      console.log('Error: Missing main image');
      return res.status(400).json({
        error: 'Main image is required. Make sure you are uploading as multipart/form-data and the main image field is named "mainImage".'
      });
    }

    const files = req.files;
    const productData = req.body;

    // Validate required fields
    const requiredFields = [
      "name",
      "material",
      "description",
      "size",
      "colour",
      "category",
      "weight",
      "utility",
      "care",
      "price",
      "regularPrice"
    ];

    console.log('Validating required fields...');
    const missingFields = [];
    for (const field of requiredFields) {
      if (!productData[field]) {
        missingFields.push(field);
        console.log(`Missing required field: ${field}`);
      }
    }

    if (missingFields.length > 0) {
      console.log('Error: Missing required fields:', missingFields);
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    // Process uploaded files
    console.log('Processing uploaded files...');
    const imagePaths = [];

    // Helper to construct URL
    const getFullUrl = (filename) => {
      return `uploads/products/${filename}`;
    };

    // Main image
    if (files.mainImage && files.mainImage[0]) {
      const mainImageUrl = getFullUrl(files.mainImage[0].filename);
      imagePaths.push(mainImageUrl);
      console.log('Added main image:', mainImageUrl);
    }

    // Additional images
    for (let i = 1; i <= 3; i++) {
      if (files[`image${i}`] && files[`image${i}`][0]) {
        const imageUrl = getFullUrl(files[`image${i}`][0].filename);
        imagePaths.push(imageUrl);
        console.log(`Added image${i}:`, imageUrl);
      }
    }

    console.log('Creating new product with data:', {
      name: productData.name,
      category: productData.category,
      price: productData.price,
      images: imagePaths
    });

    const newProduct = new Product({
      name: productData.name,
      material: productData.material,
      description: productData.description,
      size: productData.size,
      colour: productData.colour,
      category: productData.category,
      weight: productData.weight,
      utility: productData.utility,
      care: productData.care,
      price: parseFloat(productData.price),
      regularPrice: parseFloat(productData.regularPrice),
      image: imagePaths[0], // Main image URL
      images: imagePaths, // All URLs
      inStock: productData.inStock === 'true' || productData.inStock === true,
      isBestSeller: productData.isBestSeller === 'true' || productData.isBestSeller === true,
      isFeatured: productData.isFeatured === 'true' || productData.isFeatured === true,
      isMostLoved: productData.isMostLoved === 'true' || productData.isMostLoved === true,
      codAvailable: productData.codAvailable === 'false' ? false : true,
      stock: typeof productData.stock !== 'undefined' ? Number(productData.stock) : 0
    });

    console.log('Saving product to database...');
    const savedProduct = await newProduct.save();
    console.log('Product saved successfully:', savedProduct);

    res.status(201).json({
      message: "Product created successfully",
      product: savedProduct,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('=== Error creating product ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      message: "Error creating product",
      error: error.message,
      details: error.stack
    });
  }
};

// Update product with file upload
const updateProductWithFiles = async (req, res) => {
  try {
    console.log('Updating product with files:', req.files);
    console.log('Update data:', req.body);

    const id = req.params.id;
    const files = req.files || {};
    const productData = req.body;

    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Initialize imagePaths with existing images
    let imagePaths = existingProduct.images || [];
    if (!Array.isArray(imagePaths)) {
      // If images is not an array, initialize it with the main image if it exists
      imagePaths = existingProduct.image ? [existingProduct.image] : [];
    }

    // Handle deleted images
    if (req.body.deletedImages) {
      const deletedImages = JSON.parse(req.body.deletedImages);
      // Map field names to indices
      const fieldToIndex = {
        'mainImage': 0,
        'image1': 1,
        'image2': 2,
        'image3': 3
      };

      deletedImages.forEach(field => {
        const index = fieldToIndex[field];
        if (index !== undefined && index < imagePaths.length) {
          imagePaths[index] = null; // Mark for removal
        }
      });
    }

    // Helper to construct URL
    const getFullUrl = (filename) => {
      return `uploads/products/${filename}`;
    };

    // Handle main image update
    if (files.mainImage && files.mainImage[0]) {
      const mainImageUrl = getFullUrl(files.mainImage[0].filename);
      if (imagePaths.length === 0) {
        imagePaths.push(mainImageUrl);
      } else {
        imagePaths[0] = mainImageUrl;
      }
    }

    // Handle additional images
    for (let i = 1; i <= 3; i++) {
      if (files[`image${i}`] && files[`image${i}`][0]) {
        const imageUrl = getFullUrl(files[`image${i}`][0].filename);
        if (i < imagePaths.length) {
          imagePaths[i] = imageUrl;
        } else {
          // Fill gaps if necessary
          while (imagePaths.length < i) imagePaths.push(null);
          imagePaths.push(imageUrl);
        }
      }
    }

    // Filter out null values (deleted images) and update existingProduct.image
    imagePaths = imagePaths.filter(img => img !== null);

    // Ensure we have at least one image if not all were deleted
    // If all were deleted, imagePaths is empty []

    // Update product object
    const updatedProduct = {
      name: productData.name || existingProduct.name,
      material: productData.material || existingProduct.material,
      description: productData.description || existingProduct.description,
      size: productData.size || existingProduct.size,
      colour: productData.colour || existingProduct.colour,
      category: productData.category || existingProduct.category,
      weight: productData.weight || existingProduct.weight,
      utility: productData.utility || existingProduct.utility,
      care: productData.care || existingProduct.care,
      price: productData.price ? parseFloat(productData.price) : existingProduct.price,
      regularPrice: productData.regularPrice ? parseFloat(productData.regularPrice) : existingProduct.regularPrice,
      image: imagePaths[0],
      images: imagePaths,
      inStock: productData.inStock !== undefined ? (productData.inStock === 'true' || productData.inStock === true) : existingProduct.inStock,
      isBestSeller: productData.isBestSeller !== undefined ? (productData.isBestSeller === 'true' || productData.isBestSeller === true) : existingProduct.isBestSeller,
      isFeatured: productData.isFeatured !== undefined ? (productData.isFeatured === 'true' || productData.isFeatured === true) : existingProduct.isFeatured,
      isMostLoved: productData.isMostLoved !== undefined ? (productData.isMostLoved === 'true' || productData.isMostLoved === true) : existingProduct.isMostLoved,
      codAvailable: productData.codAvailable === 'false' ? false : true,
      stock: typeof productData.stock !== 'undefined' ? Number(productData.stock) : existingProduct.stock
    };

    const result = await Product.findByIdAndUpdate(id, updatedProduct, { new: true });
    res.json({ message: "Product updated successfully", product: result });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: "Error updating product", error: error.message });
  }
};

// Update product section flags
const updateProductSections = async (req, res) => {
  try {
    console.log('=== Starting Section Update ===');
    console.log('Product ID:', req.params.id);
    console.log('Update data:', req.body);

    const { id } = req.params;
    const { isBestSeller, isFeatured, isMostLoved } = req.body;

    // Validate that at least one section flag is provided
    if (isBestSeller === undefined && isFeatured === undefined && isMostLoved === undefined) {
      console.log('Error: No section flags provided');
      return res.status(400).json({ message: "At least one section flag must be provided" });
    }

    // Find the product
    const product = await Product.findById(id);
    if (!product) {
      console.log('Error: Product not found');
      return res.status(404).json({ message: "Product not found" });
    }

    console.log('Current product sections:', {
      isBestSeller: product.isBestSeller,
      isFeatured: product.isFeatured,
      isMostLoved: product.isMostLoved
    });

    // Build update object with only the provided flags
    const updates = {};
    if (isBestSeller !== undefined) updates.isBestSeller = isBestSeller;
    if (isFeatured !== undefined) updates.isFeatured = isFeatured;
    if (isMostLoved !== undefined) updates.isMostLoved = isMostLoved;

    console.log('Applying updates:', updates);

    // Update the product with new section flags
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    console.log('Updated product sections:', {
      isBestSeller: updatedProduct.isBestSeller,
      isFeatured: updatedProduct.isFeatured,
      isMostLoved: updatedProduct.isMostLoved
    });

    res.json({
      message: "Product sections updated successfully",
      product: updatedProduct
    });
  } catch (error) {
    console.error('=== Error Updating Sections ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      message: "Error updating product sections",
      error: error.message,
      details: error.stack
    });
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: "Error deleting product", error: error.message });
  }
};

module.exports = {
  getAllProducts,
  getProductsBySection,
  getProduct,
  createProductWithFiles,
  updateProductWithFiles,
  updateProductSections,
  reorderProduct,
  deleteProduct
}; 