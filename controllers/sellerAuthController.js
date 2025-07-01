const Seller = require('../models/Seller');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'seller-images',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});

const upload = multer({ storage });

const generateToken = (seller) => {
  return jwt.sign({ id: seller._id, email: seller.email }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
};

exports.register = async (req, res) => {
  try {
    const { businessName, email, password, phone, address, businessType, accountHolderName, bankAccountNumber, ifscCode, bankName } = req.body;
    if (!businessName || !email || !password || !phone || !address || !businessType || !accountHolderName || !bankAccountNumber || !ifscCode || !bankName) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const existing = await Seller.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });
    const seller = new Seller({ businessName, email, password, phone, address, businessType, accountHolderName, bankAccountNumber, ifscCode, bankName });
    await seller.save();
    const token = generateToken(seller);
    res.json({ success: true, token, seller });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const seller = await Seller.findOne({ email });
    if (!seller) return res.status(400).json({ success: false, message: 'Invalid credentials' });
    const isMatch = await seller.comparePassword(password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });
    const token = generateToken(seller);
    res.json({ success: true, token, seller });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id);
    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });
    res.json({ success: true, seller });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const updateFields = req.body;
    const seller = await Seller.findByIdAndUpdate(req.user.id, updateFields, { new: true });
    res.json({ success: true, seller });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.uploadImages = [upload.array('images', 5), async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id);
    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });
    const uploadedImages = req.files.map(file => ({ url: file.path, alt: file.originalname }));
    seller.images = seller.images.concat(uploadedImages);
    await seller.save();
    res.json({ success: true, images: seller.images });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}];

exports.uploadProfileImage = [upload.single('profileImage'), async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id);
    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });
    seller.profileImage = { url: req.file.path, alt: req.file.originalname };
    await seller.save();
    res.json({ success: true, profileImage: seller.profileImage });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}];

// For image upload, you can use multer in the route and update seller.images/profileImage accordingly. 