const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed', 'failed'],
    default: 'pending'
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  processedDate: {
    type: Date
  },
  bankDetails: {
    accountHolderName: {
      type: String,
      required: true
    },
    accountNumber: {
      type: String,
      required: true
    },
    ifscCode: {
      type: String,
      required: true
    },
    bankName: {
      type: String,
      required: true
    }
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true
  },
  adminNotes: {
    type: String
  },
  rejectionReason: {
    type: String
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'check'],
    default: 'bank_transfer'
  },
  processingFee: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    required: true
  },
  requestType: {
    type: String,
    enum: ['manual', 'automatic'],
    default: 'manual'
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  sellerNotes: {
    type: String
  },
  // For tracking purposes
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
withdrawalSchema.index({ sellerId: 1, status: 1 });
withdrawalSchema.index({ createdAt: -1 });
withdrawalSchema.index({ transactionId: 1 });

// Pre-save middleware to calculate net amount
withdrawalSchema.pre('save', function(next) {
  this.netAmount = this.amount - this.processingFee;
  this.updatedAt = new Date();
  next();
});

// Virtual for formatted amount
withdrawalSchema.virtual('formattedAmount').get(function() {
  return `₹${this.amount.toFixed(2)}`;
});

// Virtual for formatted net amount
withdrawalSchema.virtual('formattedNetAmount').get(function() {
  return `₹${this.netAmount.toFixed(2)}`;
});

// Method to approve withdrawal
withdrawalSchema.methods.approve = function(adminId, transactionId) {
  this.status = 'approved';
  this.processedBy = adminId;
  this.transactionId = transactionId;
  this.processedDate = new Date();
  return this.save();
};

// Method to reject withdrawal
withdrawalSchema.methods.reject = function(adminId, reason) {
  this.status = 'rejected';
  this.processedBy = adminId;
  this.rejectionReason = reason;
  this.processedDate = new Date();
  return this.save();
};

// Method to complete withdrawal
withdrawalSchema.methods.complete = function(transactionId) {
  this.status = 'completed';
  this.transactionId = transactionId;
  this.processedDate = new Date();
  return this.save();
};

module.exports = mongoose.model('Withdrawal', withdrawalSchema); 