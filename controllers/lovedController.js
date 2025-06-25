const fs = require('fs').promises;
const path = require('path');
const Product = require('../models/Product');

const dataPath = path.join(__dirname, '../data/loved.json');

// Helper function to read data
const readData = async () => {
  try {
    const data = await fs.readFile(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // If file doesn't exist, create it with empty array
      const initialData = { lovedProducts: [] };
      await writeData(initialData);
      return initialData;
    }
    throw error;
  }
};

// Helper function to write data
const writeData = async (data) => {
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
};

// Get all loved products
const getAllLovedProducts = async (req, res) => {
  try {
    const data = await readData();
    res.json(data.lovedProducts);
  } catch (error) {
    console.error('Error fetching loved products:', error);
    res.status(500).json({ message: "Error fetching loved products", error: error.message });
  }
};

// Get single loved product
const getLovedProduct = async (req, res) => {
  try {
    const data = await readData();
    const product = data.lovedProducts.find(p => p.id === parseInt(req.params.id));
    
    if (!product) {
      return res.status(404).json({ message: "Loved product not found" });
    }
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching loved product:', error);
    res.status(500).json({ message: "Error fetching loved product", error: error.message });
  }
};

// Create new loved product with file upload
const createLovedProductWithFiles = async (req, res) => {
  try {
    if (!req.files) {
      return res.status(400).json({ 
        error: 'No files received. Make sure you are uploading as multipart/form-data and the main image field is named "mainImage".' 
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

    for (const field of requiredFields) {
      if (!productData[field]) {
        return res.status(400).json({ error: `Field "${field}" is required` });
      }
    }

    // Process uploaded files
    const imagePaths = [];
    
    // Main image
    if (files.mainImage && files.mainImage[0]) {
      const mainImageUrl = files.mainImage[0].path; // Cloudinary URL
      imagePaths.push(mainImageUrl);
    } else {
      return res.status(400).json({ error: "Main image is required" });
    }

    // Additional images
    for (let i = 1; i <= 3; i++) {
      if (files[`image${i}`] && files[`image${i}`][0]) {
        const imageUrl = files[`image${i}`][0].path; // Cloudinary URL
        imagePaths.push(imageUrl);
      }
    }

    // Create product in MongoDB
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
      image: imagePaths[0], // Main image Cloudinary URL
      images: imagePaths, // All Cloudinary URLs
      inStock: productData.inStock === 'true' || productData.inStock === true
    });
    
    const savedProduct = await newProduct.save();

    // Add to loved products JSON
    const data = await readData();
    const lovedProduct = {
      id: data.lovedProducts.length + 1,
      productId: savedProduct._id, // Reference to MongoDB product
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
      image: imagePaths[0],
      images: imagePaths,
      inStock: productData.inStock === 'true' || productData.inStock === true
    };
    
    data.lovedProducts.push(lovedProduct);
    await writeData(data);
    
    res.status(201).json({ 
      message: "Loved product created successfully", 
      product: lovedProduct,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('Error creating loved product:', error);
    res.status(500).json({ message: "Error creating loved product", error: error.message });
  }
};

// Update loved product with file upload
const updateLovedProductWithFiles = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const files = req.files;
    const productData = req.body;
    
    const data = await readData();
    const index = data.lovedProducts.findIndex(p => p.id === id);
    
    if (index === -1) {
      return res.status(404).json({ message: "Loved product not found" });
    }

    const existingProduct = data.lovedProducts[index];
    
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

    // Update MongoDB product
    const updatedMongoProduct = {
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
      inStock: productData.inStock !== undefined ? (productData.inStock === 'true' || productData.inStock === true) : existingProduct.inStock
    };

    await Product.findByIdAndUpdate(existingProduct.productId, updatedMongoProduct);

    // Update loved product JSON
    const updatedLovedProduct = {
      ...existingProduct,
      ...updatedMongoProduct
    };

    data.lovedProducts[index] = updatedLovedProduct;
    await writeData(data);

    res.json({ 
      message: "Loved product updated successfully", 
      product: updatedLovedProduct,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('Error updating loved product:', error);
    res.status(500).json({ message: "Error updating loved product", error: error.message });
  }
};

// Delete loved product
const deleteLovedProduct = async (req, res) => {
  try {
    const data = await readData();
    const index = data.lovedProducts.findIndex(p => p.id === parseInt(req.params.id));
    
    if (index === -1) {
      return res.status(404).json({ message: "Loved product not found" });
    }

    // Delete from MongoDB
    await Product.findByIdAndDelete(data.lovedProducts[index].productId);
    
    // Delete from loved products JSON
    data.lovedProducts.splice(index, 1);
    await writeData(data);
    
    res.json({ message: "Loved product deleted successfully" });
  } catch (error) {
    console.error('Error deleting loved product:', error);
    res.status(500).json({ message: "Error deleting loved product", error: error.message });
  }
};

module.exports = {
  getAllLovedProducts,
  getLovedProduct,
  createLovedProductWithFiles,
  updateLovedProductWithFiles,
  deleteLovedProduct
}; 