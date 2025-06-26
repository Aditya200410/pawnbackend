const FeaturedProduct = require('../models/FeaturedProduct');

// Get all featured products
const getAllFeaturedProducts = async (req, res) => {
  try {
    const products = await FeaturedProduct.find();
    res.json({ products: products.map(product => ({
      ...product.toObject(),
      id: product._id // Ensure id is set for frontend compatibility
    }))});
  } catch (error) {
    console.error('Error fetching featured products:', error);
    res.status(500).json({ message: "Error fetching featured products", error: error.message });
  }
};

// Get single featured product
const getFeaturedProduct = async (req, res) => {
  try {
    const product = await FeaturedProduct.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: "Featured product not found" });
    }
    
    const productObj = product.toObject();
    res.json({ 
      product: {
        ...productObj,
        id: productObj._id
      }
    });
  } catch (error) {
    console.error('Error fetching featured product:', error);
    res.status(500).json({ message: "Error fetching featured product", error: error.message });
  }
};

// Create new featured product with file upload
const createFeaturedProductWithFiles = async (req, res) => {
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
    const newProduct = new FeaturedProduct({
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
      inStock: productData.inStock === 'true' || productData.inStock === true,
      rating: 0,
      reviews: 0
    });
    
    const savedProduct = await newProduct.save();
    
    res.status(201).json({ 
      message: "Featured product created successfully", 
      product: savedProduct,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('Error creating featured product:', error);
    res.status(500).json({ message: "Error creating featured product", error: error.message });
  }
};

// Update featured product with file upload
const updateFeaturedProductWithFiles = async (req, res) => {
  try {
    const id = req.params.id;
    const files = req.files;
    const productData = req.body;
    
    const existingProduct = await FeaturedProduct.findById(id);
    
    if (!existingProduct) {
      return res.status(404).json({ message: "Featured product not found" });
    }

    // Process uploaded files
    const imagePaths = [...existingProduct.images]; // Start with existing images
    
    // Main image
    if (files.mainImage && files.mainImage[0]) {
      const mainImageUrl = files.mainImage[0].path;
      imagePaths[0] = mainImageUrl; // Replace main image
    }

    // Additional images
    for (let i = 1; i <= 3; i++) {
      if (files[`image${i}`] && files[`image${i}`][0]) {
        const imageUrl = files[`image${i}`][0].path;
        imagePaths[i] = imageUrl; // Replace additional image at index
      }
    }

    // Update MongoDB product
    const updatedProduct = await FeaturedProduct.findByIdAndUpdate(id, {
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
    }, { new: true });

    res.json({ 
      message: "Featured product updated successfully", 
      product: updatedProduct,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('Error updating featured product:', error);
    res.status(500).json({ message: "Error updating featured product", error: error.message });
  }
};

// Delete featured product
const deleteFeaturedProduct = async (req, res) => {
  try {
    const product = await FeaturedProduct.findByIdAndDelete(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: "Featured product not found" });
    }

    res.json({ message: "Featured product deleted successfully" });
  } catch (error) {
    console.error('Error deleting featured product:', error);
    res.status(500).json({ message: "Error deleting featured product", error: error.message });
  }
};

module.exports = {
  getAllFeaturedProducts,
  getFeaturedProduct,
  createFeaturedProductWithFiles,
  updateFeaturedProductWithFiles,
  deleteFeaturedProduct
}; 