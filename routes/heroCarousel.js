const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { isAdmin, authenticateToken } = require('../middleware/auth');

const {
  getAllCarouselItems,
  getActiveCarouselItems,
  createCarouselItem,
  updateCarouselItem,
  deleteCarouselItem,
  toggleCarouselActive,
  updateCarouselOrder
} = require('../controllers/heroCarouselController');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueFileName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFileName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image and video files are allowed!'));
  }
});

// Routes
router.get('/', getAllCarouselItems);
router.get('/active', getActiveCarouselItems);
router.post('/', upload.single('image'), createCarouselItem);
router.put('/:id', upload.single('image'), updateCarouselItem);
router.delete('/:id', deleteCarouselItem);
router.patch('/:id/toggle-active', toggleCarouselActive);
router.put('/order/update', updateCarouselOrder);

// Admin routes
router.get('/admin', authenticateToken, isAdmin, getAllCarouselItems);
router.post('/admin', authenticateToken, isAdmin, upload.single('image'), createCarouselItem);
router.put('/admin/:id', authenticateToken, isAdmin, upload.single('image'), updateCarouselItem);
router.delete('/admin/:id', authenticateToken, isAdmin, deleteCarouselItem);

module.exports = router; 