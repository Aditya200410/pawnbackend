const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pendingRegistrationSchema = new mongoose.Schema({
    // Transaction / Verification
    merchantTransactionId: { type: String, required: true, unique: true },

    // Basic Info
    businessName: { type: String, required: true },
    email: { type: String, required: true }, // Not unique globally here to allow cleanup, but should check Seller collection
    password: { type: String, required: false }, // Optional for OTP-based signups
    phone: { type: String },
    address: { type: String },
    businessType: { type: String },

    // Plan Info
    agentPlan: {
        planType: { type: String },
        agentLimit: { type: Number },
        amountPaid: { type: Number },
        purchaseDate: { type: Date }
    },

    // Pre-calculated Unique Fields (so we don't regenerate them differently later)
    sellerToken: String,
    sellerAgentCode: String,
    websiteLink: String,
    qrCode: String,

    // Images
    images: [{
        public_id: String,
        url: String,
        alt: String
    }],

    // Timestamps
    createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24 hours if not completed
});

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
