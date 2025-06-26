const mongoose = require('mongoose');

const heroCarouselSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    required: false
  },
  description: {
    type: String,
    required: false
  },
  image: {
    type: String,
    required: true
  },
  buttonText: {
    type: String,
    default: 'Shop Now'
  },
  buttonLink: {
    type: String,
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

// Update the updatedAt timestamp before saving
heroCarouselSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('HeroCarousel', heroCarouselSchema); 