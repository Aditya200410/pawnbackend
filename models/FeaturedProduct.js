const mongoose = require("mongoose");

const featuredProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  material: { type: String, required: true },
  description: { type: String, required: true },
  size: { type: String, required: true },
  colour: { type: String, required: true },
  category: { type: String, required: true },
  weight: { type: String, required: true },
  utility: { type: String, required: true },
  care: { type: String, required: true },
  price: { type: Number, required: true },
  regularPrice: { type: Number, required: true },
  image: { type: String, required: true }, // Main image URL
  images: [{ type: String }], // Array of all image URLs
  inStock: { type: Boolean, default: true },
  rating: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

module.exports = mongoose.model('FeaturedProduct', featuredProductSchema); 