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
  businessType: {
    type: String,
    required: [true, 'Business type is required']
  },
  // Bank Details - Required fields
  bankAccountNumber: {
    type: String,
    required: [true, 'Bank account number is required'],
    trim: true
  },
  ifscCode: {
    type: String,
    required: [true, 'IFSC code is required'],
    trim: true,
    uppercase: true
  },
  bankName: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true
  },
  accountHolderName: {
    type: String,
    required: [true, 'Account holder name is required'],
    trim: true
  },
  sellerToken: {
    type: String,
    unique: true
  },
  websiteLink: {
    type: String,
    unique: true
  },
  qrCode: {
    type: String // Base64 encoded QR code image
  },
  // Multiple images for seller profile
  images: [{
    public_id: { type: String, required: true },
    url: { type: String, required: true },
    alt: { type: String, default: 'Seller image' }
  }],
  profileImage: {
    public_id: { type: String },
    url: { type: String },
    alt: { type: String, default: 'Profile image' }
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  totalCommission: {
    type: Number,
    default: 0
  },
  availableCommission: {
    type: Number,
    default: 0
  },
  bankDetails: {
    accountName: { type: String },
    accountNumber: { type: String },
    ifsc: { type: String },
    bankName: { type: String }
  },
  withdrawals: [
    {
      amount: Number,
      requestedAt: Date,
      status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
      processedAt: Date
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Generate seller token and website link before saving
sellerSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Generate unique seller token
    this.sellerToken = `seller_${this._id.toString().slice(-8)}`;
    // Generate website link
    this.websiteLink = `${'https://pawn-shop-git-local-host-api-used-aditya200410s-projects.vercel.app'}/shop?seller=${this.sellerToken}`;
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

// Method to add commission
sellerSchema.methods.addCommission = async function(orderAmount) {
  const commission = orderAmount * 0.10; // 10% commission
  this.totalCommission += commission;
  this.totalOrders += 1;
  await this.save();
  return commission;
};

module.exports = mongoose.model('Seller', sellerSchema); 