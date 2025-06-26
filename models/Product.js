const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  material: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
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
    required: [true, 'Product category is required'],
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
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative']
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
    type: String,
    required: [true, 'At least one product image is required']
  }],
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add indexes for better query performance
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });

// Add pre-save middleware to ensure price validation
productSchema.pre('save', function(next) {
  if (this.price > this.regularPrice) {
    next(new Error('Price cannot be greater than regular price'));
  }
  this.updatedAt = new Date();
  next();
});

// Pre-update middleware to update timestamps
productSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Virtual for formatted price
productSchema.virtual('formattedPrice').get(function() {
  return `$${this.price.toFixed(2)}`;
});

// Instance method to check if product is in stock
productSchema.methods.isInStock = function() {
  return this.stock > 0;
};

// Static method to find products by category
productSchema.statics.findByCategory = function(category) {
  return this.find({ category, isActive: true });
};

// Static method to find products in price range
productSchema.statics.findByPriceRange = function(minPrice, maxPrice) {
  return this.find({
    price: { $gte: minPrice, $lte: maxPrice },
    isActive: true
  });
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product; 