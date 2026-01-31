const Agent = require('../models/Agent');
const mongoose = require('mongoose');
const withdrawalController = require('./withdrawalController');
const bcrypt = require('bcryptjs');
const Seller = require('../models/Seller');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

// Helper function to generate agent login response
const generateAgentLoginResponse = async (agent, res, message = 'Login successful') => {
    // Generate Token
    const token = jwt.sign(
        { id: agent._id, role: 'agent' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
    );

    // Calculate stats if needed, or pass existing
    let stats = { totalEarned: 0, availableCommission: 0, pending: 0 };
    if (agent.stats) {
        stats = agent.stats;
    } else {
        try {
            const CommissionHistory = require('../models/CommissionHistory');
            const result = await CommissionHistory.aggregate([
                { $match: { agentId: agent._id, type: 'earned' } },
                {
                    $group: {
                        _id: null,
                        totalEarned: { $sum: '$amount' },
                        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$amount', 0] } },
                        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }
                    }
                }
            ]);
            if (result.length > 0) {
                stats = {
                    totalEarned: result[0].totalEarned,
                    pending: result[0].pending,
                    availableCommission: 0 // Will be updated below
                };
            }
            const { availableCommission } = await withdrawalController.calculateAvailableAgentCommission(agent._id);
            stats.availableCommission = availableCommission;
        } catch (err) {
            console.error('Error calculating stats for login:', err);
        }
    }

    return res.json({
        success: true,
        message,
        token,
        agent: {
            id: agent._id,
            name: agent.name,
            email: agent.email,
            phone: agent.phone,
            address: agent.address,
            images: agent.images || [],
            personalAgentCode: agent.personalAgentCode,
            linkedSeller: agent.linkedSeller,
            bankDetails: agent.bankDetails || {},
            stats
        }
    });
};

// Register a new agent
exports.register = async (req, res) => {
    try {
        const { name, email, phone, password, agentCode, address } = req.body;
        const normalizedEmail = email && email.toLowerCase().trim();

        let seller = null;
        let parentAgent = null;

        if (agentCode) {
            seller = await Seller.findOne({ sellerAgentCode: agentCode.toUpperCase() });

            if (!seller) {
                parentAgent = await Agent.findOne({ personalAgentCode: agentCode.toUpperCase() });
                if (!parentAgent) {
                    return res.status(404).json({ success: false, message: 'Invalid code. No distributor or seller found.' });
                }
                seller = await Seller.findById(parentAgent.linkedSeller);

                const currentSubAgentCount = await Agent.countDocuments({ parentAgent: parentAgent._id });
                const agentPlan = parentAgent.agentPlan || { agentLimit: 50, planType: 'starter' };

                if (agentPlan.planType !== 'unlimited' && currentSubAgentCount >= agentPlan.agentLimit) {
                    return res.status(403).json({ success: false, message: 'Registration limit reached for this code.' });
                }
            } else {
                const currentAgentCount = await Agent.countDocuments({ linkedSeller: seller._id, parentAgent: { $exists: false } });
                const agentPlan = seller.agentPlan || { agentLimit: 0, planType: 'none' };

                if (agentPlan.planType !== 'unlimited' && currentAgentCount >= agentPlan.agentLimit) {
                    return res.status(403).json({ success: false, message: 'Distributor has reached their shop linking limit.' });
                }
            }
        }

        const existingAgent = await Agent.findOne({ email: normalizedEmail });
        if (existingAgent) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        // Generate Personal Agent Code
        const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        let phoneDigits = '';
        if (phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.length >= 3) {
                for (let i = 0; i < 3; i++) {
                    phoneDigits += cleanPhone[Math.floor(Math.random() * cleanPhone.length)];
                }
            } else {
                phoneDigits = Math.floor(100 + Math.random() * 900).toString();
            }
        } else {
            phoneDigits = Math.floor(100 + Math.random() * 900).toString();
        }

        const codePrefix = cleanName.length > 0 ? cleanName : 'AGENT';
        const personalAgentCode = `${codePrefix}${phoneDigits}`;

        let images = [];
        if (req.files && req.files.length > 0) {
            images = req.files.map(file => ({
                public_id: file.filename,
                url: `uploads/seller-images/${file.filename}`,
                alt: 'Agent image'
            }));
        }

        const agentData = {
            name,
            email: normalizedEmail,
            phone,
            address,
            images,
            personalAgentCode
        };

        if (password) agentData.password = password;
        if (seller) {
            agentData.linkedSeller = seller._id;
            agentData.usedAgentCode = agentCode;
        }
        if (parentAgent) agentData.parentAgent = parentAgent._id;

        const newAgent = await Agent.create(agentData);
        return await generateAgentLoginResponse(newAgent, res, 'Agent registered successfully');

    } catch (error) {
        console.error('Agent registration error:', error);
        res.status(500).json({ success: false, message: 'Error registering agent: ' + error.message });
    }
};

// OTP Login for Agent
exports.otpLogin = async (req, res) => {
    try {
        const { identifier, email } = req.body;
        if (!identifier && !email) {
            return res.status(400).json({ success: false, message: 'Phone or email is required' });
        }

        let agent;
        const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

        // 1. Try by identifier (email or phone)
        if (identifier && emailPattern.test(identifier)) {
            agent = await Agent.findOne({ email: identifier.toLowerCase().trim() });
        } else if (identifier) {
            const phoneDigits = identifier.replace(/\D/g, '');
            if (phoneDigits.length >= 10) {
                agent = await Agent.findOne({ phone: new RegExp(phoneDigits.slice(-10) + '$') });
            }
        }

        // 2. Fallback to provided email
        if (!agent && email) {
            agent = await Agent.findOne({ email: email.toLowerCase().trim() });
        }

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'No seller account found. Please register first.'
            });
        }

        return await generateAgentLoginResponse(agent, res);
    } catch (error) {
        console.error('Agent OTP login error:', error);
        res.status(500).json({ success: false, message: 'Error logging in' });
    }
};

// Standard Password Login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const agent = await Agent.findOne({ email: email.toLowerCase().trim() });

        if (!agent) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await agent.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        return await generateAgentLoginResponse(agent, res);
    } catch (error) {
        console.error('Agent login error:', error);
        res.status(500).json({ success: false, message: 'Error logging in' });
    }
};

// Get Agent Profile
exports.getProfile = async (req, res) => {
    try {
        const agent = await Agent.findById(req.user.id).populate('linkedSeller', 'businessName email phone address sellerAgentCode sellerToken');
        if (!agent) {
            return res.status(404).json({ success: false, message: 'Agent not found' });
        }

        // Backfill code if missing
        if (!agent.personalAgentCode) {
            const cleanName = agent.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const phoneDigits = agent.phone ? agent.phone.slice(-3) : Math.floor(100 + Math.random() * 900).toString();
            agent.personalAgentCode = `${cleanName || 'AGENT'}${phoneDigits}`;
            await agent.save();
        }

        const CommissionHistory = require('../models/CommissionHistory');
        const statsResult = await CommissionHistory.aggregate([
            { $match: { agentId: agent._id, type: 'earned' } },
            {
                $group: {
                    _id: null,
                    totalEarned: { $sum: '$amount' },
                    confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$amount', 0] } },
                    pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }
                }
            }
        ]);

        const stats = statsResult[0] || { totalEarned: 0, confirmed: 0, pending: 0 };
        const { availableCommission } = await withdrawalController.calculateAvailableAgentCommission(agent._id);
        stats.availableCommission = availableCommission;

        const agentObj = agent.toObject();
        agentObj.stats = stats;
        agentObj.subAgentCount = await Agent.countDocuments({ parentAgent: agent._id });

        const storeLink = agent.linkedSeller && agent.linkedSeller.sellerToken
            ? `https://www.rikocraft.com/?agent=${agent.linkedSeller.sellerToken}&seller=${agent.personalAgentCode}`
            : `https://www.rikocraft.com/?seller=${agent.personalAgentCode}`;

        agentObj.websiteLink = storeLink;
        agentObj.qrCode = await QRCode.toDataURL(storeLink);

        res.json({ success: true, agent: agentObj });
    } catch (error) {
        console.error('Get agent profile error:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, address, bankDetails } = req.body;
        const agent = await Agent.findById(req.user.id);
        if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

        if (name) agent.name = name;
        if (phone) agent.phone = phone;
        if (address) agent.address = address;
        if (bankDetails) agent.bankDetails = { ...agent.bankDetails, ...bankDetails };

        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => ({
                public_id: file.filename,
                url: `uploads/seller-images/${file.filename}`,
                alt: 'Agent image'
            }));
            agent.images = [...(agent.images || []), ...newImages].slice(-10);
        }

        await agent.save();
        res.json({ success: true, message: 'Profile updated successfully', agent });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating profile' });
    }
};

exports.getMyAgents = async (req, res) => {
    try {
        const agents = await Agent.find({ parentAgent: req.user.id }).select('-password');
        res.json({ success: true, agents });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching sub-agents' });
    }
};

exports.getAgentsBySeller = async (req, res) => {
    try {
        const { sellerId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(sellerId)) return res.json({ success: true, agents: [] });
        const agents = await Agent.find({ linkedSeller: sellerId }).select('-password');
        res.json({ success: true, agents });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching agents' });
    }
};

exports.getAllAgents = async (req, res) => {
    try {
        const agents = await Agent.find({}).populate('linkedSeller', 'businessName email').sort({ createdAt: -1 });
        const agentsWithStats = await Promise.all(agents.map(async (agent) => {
            const agentObj = agent.toObject();
            const { availableCommission } = await withdrawalController.calculateAvailableAgentCommission(agent._id);
            agentObj.availableCommission = availableCommission;
            return agentObj;
        }));
        res.json({ success: true, agents: agentsWithStats });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching all agents' });
    }
};