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

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'hero-carousel',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4'],
    resource_type: 'auto'
  }
});

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
}).single('image');

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
const createCarouselItem = async (req, res) => {
  try {
    const { title, subtitle, description, isActive } = req.body;
    let image = '';

    if (req.file) {
      image = req.file.path; // Cloudinary URL
    }

    const newItem = new HeroCarousel({
      title,
      subtitle,
      description,
      image,
      isActive: isActive === 'true',
      order: (await HeroCarousel.countDocuments()) // Put new items at the end
    });

    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating carousel item:', error);
    res.status(500).json({ message: "Error creating carousel item", error: error.message });
  }
};

// Update carousel item with file upload
const updateCarouselItem = async (req, res) => {
  try {
    const { title, subtitle, description, isActive } = req.body;
    const updateData = {
      title,
      subtitle,
      description,
      isActive: isActive === 'true'
    };

    if (req.file) {
      // Delete old image from Cloudinary if exists
      const oldItem = await HeroCarousel.findById(req.params.id);
      if (oldItem && oldItem.image) {
        const publicId = oldItem.image.split('/').pop().split('.')[0];
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error('Error deleting old image from Cloudinary:', err);
        }
      }
      updateData.image = req.file.path; // New Cloudinary URL
    }

    const updatedItem = await HeroCarousel.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({ message: "Carousel item not found" });
    }

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating carousel item:', error);
    res.status(500).json({ message: "Error updating carousel item", error: error.message });
  }
};

// Delete carousel item
const deleteCarouselItem = async (req, res) => {
  try {
    const item = await HeroCarousel.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Carousel item not found" });
    }

    // Delete image from Cloudinary if exists
    if (item.image) {
      const publicId = item.image.split('/').pop().split('.')[0];
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error('Error deleting image from Cloudinary:', err);
      }
    }

    await item.deleteOne();
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
  getActiveCarouselItems,
  createCarouselItem,
  updateCarouselItem,
  deleteCarouselItem,
  toggleCarouselActive,
  updateCarouselOrder
}; 