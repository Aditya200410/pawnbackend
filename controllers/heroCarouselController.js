const fs = require('fs');
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

// Configure multer for local storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../data');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to allow only images and MP4 videos
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'video/mp4') {
    cb(null, true);
  } else {
    cb(new Error('Only images and MP4 videos are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Helper function to read carousel data
const readCarouselData = () => {
  try {
    const data = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(data).carousel || [];
  } catch (error) {
    console.error('Error reading carousel data:', error);
    return [];
  }
};

// Helper function to write carousel data
const writeCarouselData = (data) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify({ carousel: data }, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing carousel data:', error);
    return false;
  }
};

// Get all carousel items
const getCarouselItems = async (req, res) => {
  try {
    const items = readCarouselData();
    res.json(items);
  } catch (error) {
    console.error('Error getting carousel items:', error);
    res.status(500).json({ message: 'Error getting carousel items' });
  }
};

// Get active carousel items
const getActiveCarouselItems = async (req, res) => {
  try {
    const items = readCarouselData().filter(item => item.isActive);
    res.json(items);
  } catch (error) {
    console.error('Error getting active carousel items:', error);
    res.status(500).json({ message: 'Error getting active carousel items' });
  }
};

// Create new carousel item
const createCarouselItem = async (req, res) => {
  try {
    const items = readCarouselData();
    const newItem = {
      id: Date.now().toString(),
      ...req.body,
      order: items.length + 1,
      isActive: true
    };

    if (req.file) {
      newItem.image = `/pawnbackend/data/${req.file.filename}`;
    }

    items.push(newItem);
    writeCarouselData(items);

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating carousel item:', error);
    res.status(500).json({ message: 'Error creating carousel item' });
  }
};

// Update carousel item
const updateCarouselItem = async (req, res) => {
  try {
    const { id } = req.params;
    let items = readCarouselData();
    const index = items.findIndex(item => item.id === id);

    if (index === -1) {
      return res.status(404).json({ message: 'Carousel item not found' });
    }

    const updatedItem = {
      ...items[index],
      ...req.body
    };

    if (req.file) {
      // Delete old image if exists
      const oldImage = items[index].image;
      if (oldImage && oldImage.startsWith('/pawnbackend/data/')) {
        const oldImagePath = path.join(__dirname, '..', oldImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updatedItem.image = `/pawnbackend/data/${req.file.filename}`;
    }

    items[index] = updatedItem;
    writeCarouselData(items);

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating carousel item:', error);
    res.status(500).json({ message: 'Error updating carousel item' });
  }
};

// Delete carousel item
const deleteCarouselItem = async (req, res) => {
  try {
    const { id } = req.params;
    let items = readCarouselData();
    const index = items.findIndex(item => item.id === id);

    if (index === -1) {
      return res.status(404).json({ message: 'Carousel item not found' });
    }

    // Delete image if exists
    const oldImage = items[index].image;
    if (oldImage && oldImage.startsWith('/pawnbackend/data/')) {
      const oldImagePath = path.join(__dirname, '..', oldImage);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    items.splice(index, 1);
    
    // Update order of remaining items
    items = items.map((item, idx) => ({
      ...item,
      order: idx + 1
    }));

    writeCarouselData(items);

    res.json({ message: 'Carousel item deleted successfully' });
  } catch (error) {
    console.error('Error deleting carousel item:', error);
    res.status(500).json({ message: 'Error deleting carousel item' });
  }
};

// Update carousel items order
const updateCarouselOrder = async (req, res) => {
  try {
    const { items } = req.body;
    const currentItems = readCarouselData();
    
    // Update order while preserving other properties
    const updatedItems = items.map((itemId, index) => {
      const item = currentItems.find(i => i.id === itemId);
      return {
        ...item,
        order: index + 1
      };
    });

    writeCarouselData(updatedItems);

    res.json(updatedItems);
  } catch (error) {
    console.error('Error updating carousel order:', error);
    res.status(500).json({ message: 'Error updating carousel order' });
  }
};

// Toggle carousel item active status
const toggleCarouselActive = async (req, res) => {
  try {
    const { id } = req.params;
    let items = readCarouselData();
    const index = items.findIndex(item => item.id === id);

    if (index === -1) {
      return res.status(404).json({ message: 'Carousel item not found' });
    }

    items[index].isActive = !items[index].isActive;
    writeCarouselData(items);

    res.json(items[index]);
  } catch (error) {
    console.error('Error toggling carousel item status:', error);
    res.status(500).json({ message: 'Error toggling carousel item status' });
  }
};

module.exports = {
  upload,
  getCarouselItems,
  getActiveCarouselItems,
  createCarouselItem,
  updateCarouselItem,
  deleteCarouselItem,
  updateCarouselOrder,
  toggleCarouselActive
}; 