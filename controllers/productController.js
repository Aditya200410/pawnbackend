const Product = require('../models/Product');
const { deleteFromCloudinary } = require('../middleware/upload');

// Get all products
const getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search, sort = 'createdAt' } = req.query;
    
    let query = {};
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { material: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const products = await Product.find(query)
      .sort({ [sort]: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Product.countDocuments(query);
    
    res.json({
      success: true,
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProducts: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching products", 
      error: error.message 
    });
  }
};

// Get single product
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: "Product not found" 
      });
    }
    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching product", 
      error: error.message 
    });
  }
};

// Create new product with file upload
const createProductWithFiles = async (req, res) => {
  try {
    console.log('=== Starting Product Creation ===');
    console.log('Files received:', req.files);
    console.log('Body data:', req.body);

    if (!req.files || !req.files.mainImage) {
      return res.status(400).json({ 
        success: false,
        error: 'Main image is required. Make sure you are uploading as multipart/form-data and the main image field is named "mainImage".' 
      });
    }

    const files = req.files;
    const productData = req.body;
    
    // Validate required fields
    const requiredFields = [
      "name", "material", "description", "size", "colour", 
      "category", "weight", "utility", "care", "price", "regularPrice"
    ];

    const missingFields = requiredFields.filter(field => !productData[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Process uploaded files
    const imagePaths = [];
    const imageIds = [];
    
    // Main image
    if (files.mainImage && files.mainImage[0]) {
      imagePaths.push(files.mainImage[0].path);
      imageIds.push(files.mainImage[0].filename);
    }

    // Additional images
    for (let i = 1; i <= 3; i++) {
      if (files[`image${i}`] && files[`image${i}`][0]) {
        imagePaths.push(files[`image${i}`][0].path);
        imageIds.push(files[`image${i}`][0].filename);
      }
    }

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
      image: imagePaths[0],
      images: imagePaths,
      imageIds: imageIds,
      inStock: productData.inStock === 'true' || productData.inStock === true
    });
    
    const savedProduct = await newProduct.save();
    
    res.status(201).json({ 
      success: true,
      message: "Product created successfully", 
      product: savedProduct
    });
  } catch (error) {
    console.error('=== Error creating product ===');
    console.error('Error details:', error);
    
    // Clean up uploaded files if product creation fails
    if (req.files) {
      try {
        for (const fileKey in req.files) {
          for (const file of req.files[fileKey]) {
            if (file.filename) {
              await deleteFromCloudinary(file.filename);
            }
          }
        }
      } catch (cleanupError) {
        console.error('Error cleaning up files:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      success: false,
      message: "Error creating product", 
      error: error.message
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
      return res.status(404).json({ 
        success: false,
        message: "Product not found" 
      });
    }

    // Initialize imagePaths and imageIds with existing images
    let imagePaths = existingProduct.images || [];
    let imageIds = existingProduct.imageIds || [];
    
    if (!Array.isArray(imagePaths)) {
      imagePaths = existingProduct.image ? [existingProduct.image] : [];
      imageIds = [];
    }

    // Track old image IDs for cleanup
    const oldImageIds = [...imageIds];

    // Handle main image update
    if (files.mainImage && files.mainImage[0]) {
      const mainImageUrl = files.mainImage[0].path;
      const mainImageId = files.mainImage[0].filename;
      
      if (imagePaths.length === 0) {
        imagePaths.push(mainImageUrl);
        imageIds.push(mainImageId);
      } else {
        imagePaths[0] = mainImageUrl;
        imageIds[0] = mainImageId;
      }
    }

    // Handle additional images
    for (let i = 1; i <= 3; i++) {
      if (files[`image${i}`] && files[`image${i}`][0]) {
        const imageUrl = files[`image${i}`][0].path;
        const imageId = files[`image${i}`][0].filename;
        
        if (i < imagePaths.length) {
          imagePaths[i] = imageUrl;
          imageIds[i] = imageId;
        } else {
          imagePaths.push(imageUrl);
          imageIds.push(imageId);
        }
      }
    }

    // Ensure we have at least one image
    if (imagePaths.length === 0 && existingProduct.image) {
      imagePaths.push(existingProduct.image);
    }

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
      imageIds: imageIds,
      inStock: productData.inStock !== undefined ? (productData.inStock === 'true' || productData.inStock === true) : existingProduct.inStock
    };

    const savedProduct = await Product.findByIdAndUpdate(id, updatedProduct, { new: true });

    // Clean up old images that were replaced
    try {
      const newImageIds = new Set(imageIds);
      for (const oldId of oldImageIds) {
        if (!newImageIds.has(oldId)) {
          await deleteFromCloudinary(oldId);
        }
      }
    } catch (cleanupError) {
      console.error('Error cleaning up old images:', cleanupError);
    }

    res.json({ 
      success: true,
      message: "Product updated successfully", 
      product: savedProduct
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ 
      success: false,
      message: "Error updating product", 
      error: error.message 
    });
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: "Product not found" 
      });
    }

    // Delete images from Cloudinary
    if (product.imageIds && product.imageIds.length > 0) {
      try {
        for (const imageId of product.imageIds) {
          await deleteFromCloudinary(imageId);
        }
      } catch (cleanupError) {
        console.error('Error deleting images from Cloudinary:', cleanupError);
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    
    res.json({ 
      success: true,
      message: "Product deleted successfully" 
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ 
      success: false,
      message: "Error deleting product", 
      error: error.message 
    });
  }
};

// Get products by category
const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10, sort = 'createdAt' } = req.query;
    
    const skip = (page - 1) * limit;
    
    const products = await Product.find({ category })
      .sort({ [sort]: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Product.countDocuments({ category });
    
    res.json({
      success: true,
      products,
      category,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProducts: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching products by category", 
      error: error.message 
    });
  }
};

module.exports = {
  getAllProducts,
  getProduct,
  createProductWithFiles,
  updateProductWithFiles,
  deleteProduct,
  getProductsByCategory
}; 