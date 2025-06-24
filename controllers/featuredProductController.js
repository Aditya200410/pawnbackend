const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, '../data/featuredProducts.json');

// Helper function to read data
const readData = async () => {
  try {
    const data = await fs.readFile(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // If file doesn't exist, create it with empty array
      const initialData = { featuredProducts: [] };
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

// Get all featured products
const getAllFeaturedProducts = async (req, res) => {
  try {
    const data = await readData();
    res.json(data.featuredProducts);
  } catch (error) {
    console.error('Error fetching featured products:', error);
    res.status(500).json({ message: "Error fetching featured products", error: error.message });
  }
};

// Get single featured product
const getFeaturedProduct = async (req, res) => {
  try {
    const data = await readData();
    const product = data.featuredProducts.find(p => p.id === parseInt(req.params.id));
    
    if (!product) {
      return res.status(404).json({ message: "Featured product not found" });
    }
    
    res.json(product);
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
      "price",
      "regularPrice",
      "category",
      "description"
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

    const data = await readData();
    
    const newProduct = {
      id: data.featuredProducts.length + 1,
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
    
    data.featuredProducts.push(newProduct);
    await writeData(data);
    
    res.status(201).json({ 
      message: "Featured product created successfully", 
      product: newProduct,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('Error creating featured product:', error);
    res.status(500).json({ message: "Error creating featured product", error: error.message });
  }
};

// Create new featured product (legacy JSON endpoint)
const createFeaturedProduct = async (req, res) => {
  try {
    const data = await readData();
    const newProduct = {
      id: data.featuredProducts.length + 1,
      ...req.body
    };
    
    data.featuredProducts.push(newProduct);
    await writeData(data);
    
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error creating featured product:', error);
    res.status(500).json({ message: "Error creating featured product", error: error.message });
  }
};

// Update featured product with file upload
const updateFeaturedProductWithFiles = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const files = req.files;
    const productData = req.body;
    
    const data = await readData();
    const index = data.featuredProducts.findIndex(p => p.id === id);
    
    if (index === -1) {
      return res.status(404).json({ message: "Featured product not found" });
    }

    const existingProduct = data.featuredProducts[index];
    
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

    data.featuredProducts[index] = updatedProduct;
    await writeData(data);

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

// Update featured product (legacy JSON endpoint)
const updateFeaturedProduct = async (req, res) => {
  try {
    const data = await readData();
    const index = data.featuredProducts.findIndex(p => p.id === parseInt(req.params.id));
    
    if (index === -1) {
      return res.status(404).json({ message: "Featured product not found" });
    }
    
    data.featuredProducts[index] = {
      ...data.featuredProducts[index],
      ...req.body,
      id: parseInt(req.params.id)
    };
    
    await writeData(data);
    res.json(data.featuredProducts[index]);
  } catch (error) {
    console.error('Error updating featured product:', error);
    res.status(500).json({ message: "Error updating featured product", error: error.message });
  }
};

// Delete featured product
const deleteFeaturedProduct = async (req, res) => {
  try {
    const data = await readData();
    const index = data.featuredProducts.findIndex(p => p.id === parseInt(req.params.id));
    
    if (index === -1) {
      return res.status(404).json({ message: "Featured product not found" });
    }
    
    data.featuredProducts.splice(index, 1);
    await writeData(data);
    
    res.json({ message: "Featured product deleted successfully" });
  } catch (error) {
    console.error('Error deleting featured product:', error);
    res.status(500).json({ message: "Error deleting featured product", error: error.message });
  }
};

module.exports = {
  getAllFeaturedProducts,
  getFeaturedProduct,
  createFeaturedProduct,
  createFeaturedProductWithFiles,
  updateFeaturedProduct,
  updateFeaturedProductWithFiles,
  deleteFeaturedProduct
}; 