const Category = require('../models/cate');
const { deleteFromCloudinary } = require('../middleware/upload');

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ 
      success: true,
      categories: categories.map(cat => ({
        id: cat._id,
        name: cat.name,
        description: cat.description,
        image: cat.image,
        slug: cat.slug,
        isActive: cat.isActive,
        createdAt: cat.createdAt
      }))
    });
  } catch (error) {
    console.error('Error in getAllCategories:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching categories' 
    });
  }
};

// Get single category
exports.getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }
    res.json({ 
      success: true,
      category: {
        id: category._id,
        name: category.name,
        description: category.description,
        image: category.image,
        slug: category.slug,
        isActive: category.isActive,
        createdAt: category.createdAt
      }
    });
  } catch (error) {
    console.error('Error in getCategory:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching category' 
    });
  }
};

// Create new category with file upload
exports.createCategory = async (req, res) => {
  try {
    if (!req.body.name || !req.body.description) {
      return res.status(400).json({ 
        success: false,
        message: 'Name and description are required' 
      });
    }

    // Check if category with same name already exists
    const existingCategory = await Category.findOne({ name: req.body.name });
    if (existingCategory) {
      return res.status(400).json({ 
        success: false,
        message: 'Category with this name already exists' 
      });
    }

    const categoryData = {
      name: req.body.name,
      description: req.body.description,
      image: req.file ? req.file.path : '',
      imageId: req.file ? req.file.filename : ''
    };

    const newCategory = new Category(categoryData);
    await newCategory.save();
    
    console.log('New category created:', newCategory);
    res.status(201).json({ 
      success: true,
      message: 'Category created successfully',
      category: {
        id: newCategory._id,
        name: newCategory.name,
        description: newCategory.description,
        image: newCategory.image,
        slug: newCategory.slug,
        isActive: newCategory.isActive,
        createdAt: newCategory.createdAt
      }
    });
  } catch (error) {
    console.error('Error in createCategory:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error creating category' 
    });
  }
};

// Update category with file upload
exports.updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }

    // Check if name is being changed and if it already exists
    if (req.body.name && req.body.name !== category.name) {
      const existingCategory = await Category.findOne({ 
        name: req.body.name,
        _id: { $ne: req.params.id }
      });
      if (existingCategory) {
        return res.status(400).json({ 
          success: false,
          message: 'Category with this name already exists' 
        });
      }
    }

    // Delete old image from Cloudinary if new image is uploaded
    if (req.file && category.imageId) {
      try {
        await deleteFromCloudinary(category.imageId);
      } catch (error) {
        console.error('Error deleting old image:', error);
      }
    }

    // Update category data
    const updateData = {
      name: req.body.name || category.name,
      description: req.body.description || category.description,
      image: req.file ? req.file.path : category.image,
      imageId: req.file ? req.file.filename : category.imageId
    };

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({ 
      success: true,
      message: 'Category updated successfully',
      category: {
        id: updatedCategory._id,
        name: updatedCategory.name,
        description: updatedCategory.description,
        image: updatedCategory.image,
        slug: updatedCategory.slug,
        isActive: updatedCategory.isActive,
        updatedAt: updatedCategory.updatedAt
      }
    });
  } catch (error) {
    console.error('Error in updateCategory:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating category' 
    });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }

    // Delete image from Cloudinary if exists
    if (category.imageId) {
      try {
        await deleteFromCloudinary(category.imageId);
      } catch (error) {
        console.error('Error deleting image from Cloudinary:', error);
      }
    }

    // Soft delete by setting isActive to false
    await Category.findByIdAndUpdate(req.params.id, { isActive: false });

    res.json({ 
      success: true,
      message: 'Category deleted successfully' 
    });
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting category' 
    });
  }
};

// Get category by slug
exports.getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findOne({ 
      slug: req.params.slug,
      isActive: true 
    });
    
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: 'Category not found' 
      });
    }
    
    res.json({ 
      success: true,
      category: {
        id: category._id,
        name: category.name,
        description: category.description,
        image: category.image,
        slug: category.slug,
        isActive: category.isActive,
        createdAt: category.createdAt
      }
    });
  } catch (error) {
    console.error('Error in getCategoryBySlug:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching category' 
    });
  }
}; 