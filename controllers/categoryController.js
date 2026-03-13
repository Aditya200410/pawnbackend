const Category = require('../models/cate');

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const categories = await Category.find(filter).sort({ sortOrder: 1, name: 1 });
    res.json({ categories });
  } catch (error) {
    console.error('Error in getAllCategories:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
};

// Get single category
exports.getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json({ category });
  } catch (error) {
    console.error('Error in getCategory:', error);
    res.status(500).json({ message: 'Error fetching category' });
  }
};

// Create new category with file upload
exports.createCategory = async (req, res) => {
  try {
    console.log('=== Starting Category Creation ===');
    console.log('Files received:', req.files);
    console.log('Body data:', req.body);

    if (!req.body.name || !req.body.description) {
      console.log('Validation failed: Name and description required');
      return res.status(400).json({ message: 'Name and description are required' });
    }

    const categoryData = req.body;
    let imageUrl = '';
    let videoUrl = '';

    // Helper to construct URL
    const getFullUrl = (filename) => {
      const protocol = req.protocol;
      const host = req.get('host');
      return `${protocol}://${host}/api/uploads/categories/${filename}`;
    };

    // Process uploaded files if present
    if (req.files) {
      // Handle image upload
      if (req.files.image && req.files.image[0]) {
        imageUrl = getFullUrl(req.files.image[0].filename);
        console.log('Added category image from file:', imageUrl);
      } else if (req.body.image && typeof req.body.image === 'string') {
        imageUrl = req.body.image;
        console.log('Added category image from body:', imageUrl);
      }

      // Handle video upload
      if (req.files.video && req.files.video[0]) {
        videoUrl = getFullUrl(req.files.video[0].filename);
        console.log('Added category video from file:', videoUrl);
      } else if (req.body.video && typeof req.body.video === 'string') {
        videoUrl = req.body.video;
        console.log('Added category video from body:', videoUrl);
      }
    } else {
      // Fallback to body even if no files property (though multer adds it)
      imageUrl = req.body.image || '';
      videoUrl = req.body.video || '';
    }

    let sortOrder = parseInt(categoryData.sortOrder);
    if (isNaN(sortOrder)) {
      try {
        const lastCategory = await Category.findOne().sort({ sortOrder: -1 });
        sortOrder = lastCategory ? lastCategory.sortOrder + 1 : 0;
      } catch (err) {
        console.error('Error getting sort order:', err);
        sortOrder = 0;
      }
    }

    const newCategory = new Category({
      name: categoryData.name,
      description: categoryData.description,
      image: imageUrl,
      video: videoUrl,
      sortOrder: sortOrder,
      isActive: categoryData.isActive !== 'false' && categoryData.isActive !== false
    });

    console.log('Saving category to DB...');
    const savedCategory = await newCategory.save();
    console.log('Category saved successfully:', savedCategory._id);

    res.status(201).json({
      message: "Category created successfully",
      category: savedCategory,
      uploadedFiles: req.files
    });
  } catch (error) {
    console.error('=== Error creating category ===');
    console.error('Error details:', error);
    
    // Check for duplicate key error (MongoDB E11000)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        message: `Category with this ${field} already exists`,
        error: error.message
      });
    }

    res.status(500).json({
      message: "Error creating category",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Update category with file upload
exports.updateCategory = async (req, res) => {
  try {
    console.log('=== Starting Category Update ===');
    console.log('Updating category with files:', req.files);
    console.log('Update data:', req.body);

    const id = req.params.id;
    const categoryData = req.body;

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      console.log('Category not found:', id);
      return res.status(404).json({ message: "Category not found" });
    }

    // Helper to construct URL
    const getFullUrl = (filename) => {
      const protocol = req.protocol;
      const host = req.get('host');
      return `${protocol}://${host}/api/uploads/categories/${filename}`;
    };

    // Handle file updates
    let imageUrl = existingCategory.image;
    let videoUrl = existingCategory.video;

    if (req.files) {
      // Handle image update
      if (req.files.image && req.files.image[0]) {
        imageUrl = getFullUrl(req.files.image[0].filename);
        console.log('Updated category image from file:', imageUrl);
      } else if (req.body.image && typeof req.body.image === 'string') {
        imageUrl = req.body.image;
        console.log('Updated category image from body:', imageUrl);
      }

      // Handle video update
      if (req.files.video && req.files.video[0]) {
        videoUrl = getFullUrl(req.files.video[0].filename);
        console.log('Updated category video from file:', videoUrl);
      } else if (req.body.video && typeof req.body.video === 'string') {
        videoUrl = req.body.video;
        console.log('Updated category video from body:', videoUrl);
      }
    } else {
      // Fallback to body
      if (req.body.image !== undefined) imageUrl = req.body.image;
      if (req.body.video !== undefined) videoUrl = req.body.video;
    }

    // Update category object
    const updateFields = {
      name: categoryData.name || existingCategory.name,
      description: categoryData.description || existingCategory.description,
      image: imageUrl,
      video: videoUrl,
      sortOrder: categoryData.sortOrder ? parseInt(categoryData.sortOrder) : existingCategory.sortOrder,
      isActive: categoryData.isActive !== undefined ? (categoryData.isActive === 'true' || categoryData.isActive === true) : existingCategory.isActive
    };

    console.log('Applying updates to DB...');
    const savedCategory = await Category.findByIdAndUpdate(id, updateFields, { new: true, runValidators: true });
    console.log('Category updated successfully:', savedCategory._id);

    res.json({
      message: "Category updated successfully",
      category: savedCategory,
      uploadedFiles: req.files
    });
  } catch (error) {
    console.error('=== Error updating category ===');
    console.error('Error details:', error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        message: `Category with this ${field} already exists`,
        error: error.message
      });
    }

    res.status(500).json({ 
      message: "Error updating category", 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    res.status(500).json({ message: 'Error deleting category' });
  }
};

// Reorder categories
exports.reorderCategories = async (req, res) => {
  try {
    const { categoryIds } = req.body;

    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({ message: 'categoryIds must be an array' });
    }

    // Update each category's sortOrder
    const updatePromises = categoryIds.map((id, index) => {
      return Category.findByIdAndUpdate(id, { sortOrder: index });
    });

    await Promise.all(updatePromises);

    res.json({ message: 'Categories reordered successfully' });
  } catch (error) {
    console.error('Error in reorderCategories:', error);
    res.status(500).json({ message: 'Error reordering categories', error: error.message });
  }
}; 