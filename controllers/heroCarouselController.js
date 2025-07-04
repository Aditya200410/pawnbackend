const HeroCarousel = require('../models/heroCarousel');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Path to JSON file where carousel items are stored
const dataFilePath = path.join(__dirname, '../data/hero-carousel.json');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'hero-carousel',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'webp'],
    transformation: [{ width: 1920, height: 1080, crop: 'limit' }],
    resource_type: 'auto'
  }
});

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for videos
  }
});

// Helper function to read carousel data
const readCarouselData = async () => {
  try {
    const data = await fs.readFile(dataFilePath, 'utf8');
    return JSON.parse(data).carousel || [];
  } catch (error) {
    console.error('Error reading carousel data:', error);
    return [];
  }
};

// Helper function to write carousel data
const writeCarouselData = async (data) => {
  try {
    await fs.writeFile(dataFilePath, JSON.stringify({ carousel: data }, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing carousel data:', error);
    return false;
  }
};

// Get all carousel items
const getAllCarouselItems = async (req, res) => {
  try {
    const items = await HeroCarousel.find().sort('order');
    res.json(items);
  } catch (error) {
    console.error('Error fetching carousel items:', error);
    res.status(500).json({ message: "Error fetching carousel items", error: error.message });
  }
};

// Get single carousel item
const getCarouselItem = async (req, res) => {
  try {
    const item = await HeroCarousel.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Carousel item not found" });
    }
    res.json(item);
  } catch (error) {
    console.error('Error fetching carousel item:', error);
    res.status(500).json({ message: "Error fetching carousel item", error: error.message });
  }
};

// Get active carousel items
const getActiveCarouselItems = async (req, res) => {
  try {
    const items = await HeroCarousel.find({ isActive: true }).sort('order');
    res.json(items);
  } catch (error) {
    console.error('Error fetching active carousel items:', error);
    res.status(500).json({ message: "Error fetching active carousel items", error: error.message });
  }
};

// Create carousel item with file upload
const createCarouselItemWithFiles = async (req, res) => {
  try {
    console.log('=== Starting Hero Carousel Item Creation ===');
    console.log('Headers:', req.headers);
    console.log('Files received:', req.files);
    console.log('Body data:', req.body);

    if (!req.files || (!req.files.desktopImage && !req.files.image)) {
      console.log('Error: Missing desktop image');
      return res.status(400).json({ 
        error: 'Desktop image is required. Make sure you are uploading as multipart/form-data and the file field is named "desktopImage".' 
      });
    }

    const files = req.files;
    const itemData = req.body;
    
    // Validate required fields
    const requiredFields = ["title", "showOn"];
    console.log('Validating required fields...');
    const missingFields = [];
    for (const field of requiredFields) {
      if (!itemData[field]) {
        missingFields.push(field);
        console.log(`Missing required field: ${field}`);
      }
    }

    if (missingFields.length > 0) {
      console.log('Error: Missing required fields:', missingFields);
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    // Process uploaded files
    let desktopImageUrl = null;
    let mobileImageUrl = null;
    if (itemData.showOn === 'desktop' && files.desktopImage && files.desktopImage[0]) {
      desktopImageUrl = files.desktopImage[0].path;
    }
    if (itemData.showOn === 'mobile' && files.mobileImage && files.mobileImage[0]) {
      mobileImageUrl = files.mobileImage[0].path;
    }

    // Get current max order
    const maxOrderItem = await HeroCarousel.findOne().sort('-order');
    const newOrder = maxOrderItem ? maxOrderItem.order + 1 : 0;

    const newItem = new HeroCarousel({
      title: itemData.title.trim(),
      subtitle: (itemData.subtitle || '').trim(),
      description: (itemData.description || '').trim(),
      buttonText: (itemData.buttonText || 'Shop Now').trim(),
      buttonLink: (itemData.buttonLink || '/shop').trim(),
      desktopImage: desktopImageUrl,
      mobileImage: mobileImageUrl,
      showOn: itemData.showOn,
      isActive: itemData.isActive === 'true' || itemData.isActive === true,
      order: newOrder
    });

    console.log('Saving carousel item to database...');
    const savedItem = await newItem.save();
    console.log('Carousel item saved successfully:', savedItem);
    
    res.status(201).json({ 
      message: "Carousel item created successfully", 
      item: savedItem,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('=== Error creating carousel item ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      message: "Error creating carousel item", 
      error: error.message,
      details: error.stack
    });
  }
};

// Update carousel item with file upload
const updateCarouselItemWithFiles = async (req, res) => {
  try {
    console.log('Updating carousel item with files:', req.files);
    console.log('Update data:', req.body);

    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: "Carousel item ID is required" });
    }

    const files = req.files || {};
    const itemData = req.body;
    
    const existingItem = await HeroCarousel.findById(id);
    if (!existingItem) {
      return res.status(404).json({ message: "Carousel item not found" });
    }

    // Handle image/video update
    let desktopImageUrl = existingItem.desktopImage;
    let mobileImageUrl = existingItem.mobileImage;
    if (itemData.showOn === 'desktop' && files.desktopImage && files.desktopImage[0]) {
      desktopImageUrl = files.desktopImage[0].path;
    }
    if (itemData.showOn === 'mobile' && files.mobileImage && files.mobileImage[0]) {
      mobileImageUrl = files.mobileImage[0].path;
    }

    // Update item object
    const updatedItem = {
      title: (itemData.title || existingItem.title).trim(),
      subtitle: (itemData.subtitle || existingItem.subtitle || '').trim(),
      description: (itemData.description || existingItem.description || '').trim(),
      buttonText: (itemData.buttonText || existingItem.buttonText || 'Shop Now').trim(),
      buttonLink: (itemData.buttonLink || existingItem.buttonLink || '/shop').trim(),
      desktopImage: desktopImageUrl,
      mobileImage: mobileImageUrl,
      showOn: itemData.showOn || existingItem.showOn,
      isActive: typeof itemData.isActive !== 'undefined' ? (itemData.isActive === 'true' || itemData.isActive === true) : existingItem.isActive,
      order: typeof itemData.order !== 'undefined' ? itemData.order : existingItem.order
    };

    // Log the update operation
    console.log('Updating carousel item with data:', {
      id,
      imageUrl: desktopImageUrl,
      filesReceived: Object.keys(files)
    });

    const savedItem = await HeroCarousel.findByIdAndUpdate(id, updatedItem, { new: true });

    res.json({ 
      message: "Carousel item updated successfully", 
      item: savedItem,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('Error updating carousel item:', error);
    res.status(500).json({ message: "Error updating carousel item", error: error.message });
  }
};

// Delete carousel item
const deleteCarouselItem = async (req, res) => {
  try {
    const item = await HeroCarousel.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Carousel item not found" });
    }

    // Reorder remaining items
    const remainingItems = await HeroCarousel.find().sort('order');
    for (let i = 0; i < remainingItems.length; i++) {
      await HeroCarousel.findByIdAndUpdate(remainingItems[i]._id, { order: i });
    }

    res.json({ message: "Carousel item deleted successfully" });
  } catch (error) {
    console.error('Error deleting carousel item:', error);
    res.status(500).json({ message: "Error deleting carousel item", error: error.message });
  }
};

// Toggle active status
const toggleCarouselActive = async (req, res) => {
  try {
    const item = await HeroCarousel.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Carousel item not found" });
    }

    item.isActive = !item.isActive;
    await item.save();
    res.json(item);
  } catch (error) {
    console.error('Error toggling carousel item status:', error);
    res.status(500).json({ message: "Error toggling carousel item status", error: error.message });
  }
};

// Update carousel items order
const updateCarouselOrder = async (req, res) => {
  try {
    const items = req.body;
    for (let i = 0; i < items.length; i++) {
      await HeroCarousel.findByIdAndUpdate(items[i]._id, { order: i });
    }
    res.json({ message: "Order updated successfully" });
  } catch (error) {
    console.error('Error updating carousel order:', error);
    res.status(500).json({ message: "Error updating carousel order", error: error.message });
  }
};

module.exports = {
  upload,
  getAllCarouselItems,
  getCarouselItem,
  getActiveCarouselItems,
  createCarouselItemWithFiles,
  updateCarouselItemWithFiles,
  deleteCarouselItem,
  toggleCarouselActive,
  updateCarouselOrder
}; 