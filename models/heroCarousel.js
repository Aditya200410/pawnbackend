const mongoose = require('mongoose');

const heroCarouselSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  subtitle: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  desktopImage: {
    type: String,
    required: false
  },
  mobileImage: {
    type: String,
    required: false
  },
  showOn: {
    type: String,
    enum: ['desktop', 'mobile'],
    required: true
  },
  buttonText: {
    type: String,
    trim: true,
    default: 'Shop Now'
  },
  buttonLink: {
    type: String,
    trim: true,
    default: '/shop'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Add index for faster lookups
heroCarouselSchema.index({ order: 1 });
heroCarouselSchema.index({ isActive: 1 });

// Update the updatedAt timestamp before saving
heroCarouselSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('HeroCarousel', heroCarouselSchema); 