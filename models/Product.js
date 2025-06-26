const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  material: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  size: {
    type: String,
    required: true,
    trim: true
  },
  colour: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  weight: {
    type: String,
    required: true,
    trim: true
  },
  utility: {
    type: String,
    required: true,
    trim: true
  },
  care: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  regularPrice: {
    type: Number,
    required: true,
    min: 0
  },
  image: {
    type: String,
    required: true
  },
  images: [{
    type: String
  }],
  inStock: {
    type: Boolean,
    default: true
  },
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Add timestamps
});

// Add index for faster lookups
productSchema.index({ category: 1 });
productSchema.index({ name: 'text', description: 'text' });

// Add pre-save middleware to ensure price validation
productSchema.pre('save', function(next) {
  if (this.price > this.regularPrice) {
    next(new Error('Price cannot be greater than regular price'));
  }
  next();
});

module.exports = mongoose.model('Product', productSchema); 