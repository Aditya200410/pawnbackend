const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const sellerSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  address: {
    type: String,
    required: [true, 'Address is required']
  },
  couponToken: {
    type: String,
    unique: true
  },
  documents: [{
    type: String // URLs to business documents
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Generate coupon token before saving
sellerSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Extract username from email
    const username = this.email.split('@')[0];
    // Get first three digits of phone
    const phonePrefix = this.phone.replace(/\D/g, '').slice(0, 3);
    // Generate coupon token
    this.couponToken = `${username}@${phonePrefix}`;
  }
  next();
});

// Hash password before saving
sellerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
sellerSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Seller', sellerSchema); 