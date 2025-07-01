const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SellerSchema = new mongoose.Schema({
  businessName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  businessType: { type: String, required: true },
  accountHolderName: { type: String, required: true },
  bankAccountNumber: { type: String, required: true },
  ifscCode: { type: String, required: true },
  bankName: { type: String, required: true },
  images: [{ url: String, alt: String }],
  profileImage: { url: String, alt: String },
  sellerToken: { type: String },
  websiteLink: { type: String },
  qrCode: { type: String },
  totalOrders: { type: Number, default: 0 },
  totalCommission: { type: Number, default: 0 },
  availableCommission: { type: Number, default: 0 }
}, { timestamps: true });

SellerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

SellerSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Seller', SellerSchema); 