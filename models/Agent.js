const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const agentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
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
    linkedSeller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: false
    },
    // We store the agent code used just for record, though linkedSeller is the real link
    usedAgentCode: {
        type: String,
        required: false
    },
    parentAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: false
    },
    // The unique code for this agent to share with customers
    personalAgentCode: {
        type: String,
        required: false,
        unique: true,
        sparse: true
    },
    totalOrders: {
        type: Number,
        default: 0
    },
    totalCommission: {
        type: Number,
        default: 0
    },
    pendingCommission: {
        type: Number,
        default: 0
    },
    paidCommission: {
        type: Number,
        default: 0
    },
    bankDetails: {
        accountName: String,
        accountNumber: String,
        ifsc: String,
        bankName: String,
        upi: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    agentPlan: {
        planType: {
            type: String,
            enum: ['none', 'starter', 'pro', 'unlimited'],
            default: 'none'
        },
        agentLimit: {
            type: Number,
            default: 0
        },
        amountPaid: {
            type: Number,
            default: 0
        },
        purchaseDate: {
            type: Date
        }
    }
});

// Hash password before saving
agentSchema.pre('save', async function (next) {
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
agentSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Agent', agentSchema);
