const Agent = require('../models/Agent');
const mongoose = require('mongoose');
const withdrawalController = require('./withdrawalController');
const bcrypt = require('bcryptjs'); // Assuming bcrypt is used, though not visible in snippet
const Seller = require('../models/Seller');
const jwt = require('jsonwebtoken');

// Register a new agent
exports.register = async (req, res) => {
    try {
        const { name, email, phone, password, agentCode, address } = req.body;

        let seller = null;
        let parentAgent = null;

        if (agentCode) {
            // 1. Try to find if it's a Seller's Code
            seller = await Seller.findOne({ sellerAgentCode: agentCode });

            if (!seller) {
                // 2. Try to find if it's another Agent's Code (Sub-Agent flow)
                parentAgent = await Agent.findOne({ personalAgentCode: agentCode });

                if (!parentAgent) {
                    return res.status(404).json({ success: false, message: 'Invalid Agent Code. No distributor or seller found.' });
                }

                // If found a parent agent, inherit the seller
                seller = await Seller.findById(parentAgent.linkedSeller);

                // Check if parent agent has reached THEIR limit
                const currentSubAgentCount = await Agent.countDocuments({ parentAgent: parentAgent._id });
                const agentPlan = parentAgent.agentPlan || { agentLimit: 50, planType: 'starter' }; // Default 50 for agents if not set

                if (agentPlan.planType !== 'unlimited' && currentSubAgentCount >= agentPlan.agentLimit) {
                    return res.status(403).json({
                        success: false,
                        message: 'This distributor has reached their sub-agent limit. Please contact them for assistance.'
                    });
                }
            } else {
                // Check if seller has reached their agent limit
                const currentAgentCount = await Agent.countDocuments({ linkedSeller: seller._id, parentAgent: { $exists: false } });
                const agentPlan = seller.agentPlan || { agentLimit: 0, planType: 'none' };

                if (agentPlan.planType !== 'unlimited' && currentAgentCount >= agentPlan.agentLimit) {
                    return res.status(403).json({
                        success: false,
                        message: 'This distributor has reached their agent limit. Please contact them for assistance.'
                    });
                }
            }
        }

        // 2. Check if agent email already exists
        const existingAgent = await Agent.findOne({ email });
        if (existingAgent) {
            return res.status(400).json({ success: false, message: 'Email already registered as an agent' });
        }

        // Generate Personal Agent Code
        const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        let phoneDigits = '';
        if (phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            // Use 3 random digits from phone if available
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

        // Ensure name part is not empty
        const codePrefix = cleanName.length > 0 ? cleanName : 'AGENT';
        const personalAgentCode = `${codePrefix}${phoneDigits}`;

        // Process uploaded images
        let images = [];
        if (req.files && req.files.length > 0) {
            images = req.files.map(file => ({
                public_id: file.filename,
                url: `uploads/seller-images/${file.filename}`,
                alt: 'Agent image'
            }));
        }

        // 3. Create Agent
        const agentData = {
            name,
            email,
            phone,
            password,
            address,
            images,
            personalAgentCode // Save the new unique code
        };

        if (seller) {
            agentData.linkedSeller = seller._id;
            agentData.usedAgentCode = agentCode;
        }

        if (parentAgent) {
            agentData.parentAgent = parentAgent._id;
        }

        const newAgent = await Agent.create(agentData);

        // 4. Generate Token
        const token = jwt.sign(
            { id: newAgent._id, role: 'agent' },
            process.env.JWT_SECRET || 'your-secret-key', // Use same secret or dedicated one
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            message: 'Agent registered successfully',
            token,
            agent: {
                id: newAgent._id,
                name: newAgent.name,
                email: newAgent.email,
                phone: newAgent.phone,
                address: newAgent.address,
                images: newAgent.images || [],
                personalAgentCode: newAgent.personalAgentCode,
                linkedSeller: seller ? {
                    id: seller._id,
                    businessName: seller.businessName
                } : null
            }
        });

    } catch (error) {
        console.error('Agent registration error:', error);
        res.status(500).json({ success: false, message: 'Error registering agent', error: error.message });
    }
};

// Login Agent
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if agent exists
        const agent = await Agent.findOne({ email }).populate('linkedSeller', 'businessName email phone address');
        if (!agent) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await agent.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Generate Token
        const token = jwt.sign(
            { id: agent._id, role: 'agent' },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            agent: {
                id: agent._id,
                name: agent.name,
                email: agent.email,
                phone: agent.phone,
                address: agent.address,
                images: agent.images || [],
                linkedSeller: agent.linkedSeller
            }
        });

    } catch (error) {
        console.error('Agent login error:', error);
        res.status(500).json({ success: false, message: 'Error logging in' });
    }
};

// Get Agents by Seller (For Seller Dashboard & Admin)
exports.getAgentsBySeller = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const mongoose = require('mongoose');

        if (!mongoose.Types.ObjectId.isValid(sellerId)) {
            return res.json({ success: true, agents: [] });
        }

        const agents = await Agent.find({ linkedSeller: new mongoose.Types.ObjectId(sellerId) }).select('-password');
        res.json({
            success: true,
            agents
        });
    } catch (error) {
        console.error('Get agents error:', error);
        res.status(500).json({ success: false, message: 'Error fetching agents' });
    }
};

// Get Agent Profile (For Agent Dashboard)
exports.getProfile = async (req, res) => {
    try {
        const QRCode = require('qrcode');
        // req.user is set by auth middleware
        const agent = await Agent.findById(req.user.id).populate('linkedSeller', 'businessName email phone address sellerAgentCode sellerToken');
        if (!agent) {
            return res.status(404).json({ success: false, message: 'Agent not found' });
        }

        // Calculate Agent Stats (Total Commission)
        const CommissionHistory = require('../models/CommissionHistory');

        // Ensure personalAgentCode exists (backfill if missing)
        if (!agent.personalAgentCode) {
            const cleanName = agent.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            let phoneDigits = '';
            if (agent.phone) {
                const cleanPhone = agent.phone.replace(/\D/g, '');
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
            agent.personalAgentCode = `${codePrefix}${phoneDigits}`;
            await agent.save();
        }

        const stats = await CommissionHistory.aggregate([
            { $match: { agentId: agent._id, type: 'earned' } },
            {
                $group: {
                    _id: null,
                    totalEarned: { $sum: '$amount' },
                    confirmed: {
                        $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$amount', 0] }
                    },
                    pending: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] }
                    }
                }
            }
        ]);

        const agentObj = agent.toObject();
        agentObj.stats = stats[0] || { totalEarned: 0, confirmed: 0, pending: 0 };

        // Calculate available commission (accounting for withdrawals)
        try {
            const { availableCommission } = await withdrawalController.calculateAvailableAgentCommission(agent._id);
            agentObj.stats.availableCommission = availableCommission;
        } catch (err) {
            console.error('Error calculating available commission in profile:', err);
            agentObj.stats.availableCommission = 0;
        }

        // Get sub-agent count
        try {
            const subAgentCount = await Agent.countDocuments({ parentAgent: agent._id });
            agentObj.subAgentCount = subAgentCount;
        } catch (err) {
            console.error('Error counting sub-agents:', err);
            agentObj.subAgentCount = 0;
        }

        // Generate Dynamic Link and QR if linked seller exists
        if (agent.linkedSeller && agent.linkedSeller.sellerToken) {
            agentObj.websiteLink = `https://www.rikocraft.com/?agent=${agent.linkedSeller.sellerToken}&seller=${agent.personalAgentCode}`;
            try {
                agentObj.qrCode = await QRCode.toDataURL(agentObj.websiteLink);
            } catch (err) {
                console.error('QR Gen Error:', err);
                agentObj.qrCode = null;
            }
        }

        res.json({
            success: true,
            agent: agentObj
        });
    } catch (error) {
        console.error('Get agent profile error:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile' });
    }
};

// Admin: Get all agents
exports.getAllAgents = async (req, res) => {
    try {
        const Agent = require('../models/Agent');
        const agents = await Agent.find({})
            .populate('linkedSeller', 'businessName email phone sellerAgentCode')
            .sort({ createdAt: -1 });

        // Calculate available commission for each agent
        const agentsWithStats = await Promise.all(agents.map(async (agent) => {
            const agentObj = agent.toObject();
            try {
                // Get available commission (balance)
                const { availableCommission } = await withdrawalController.calculateAvailableAgentCommission(agent._id);

                // Get total earned stats
                const CommissionHistory = require('../models/CommissionHistory');
                const stats = await CommissionHistory.aggregate([
                    { $match: { agentId: agent._id, type: 'earned' } },
                    {
                        $group: {
                            _id: null,
                            totalEarned: { $sum: '$amount' },
                            confirmed: {
                                $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$amount', 0] }
                            },
                        }
                    }
                ]);

                agentObj.stats = {
                    totalEarned: stats[0]?.totalEarned || 0,
                    confirmed: stats[0]?.confirmed || 0,
                    availableCommission
                };

                // Map for frontend compatibility if it expects 'totalCommission' at root
                agentObj.totalCommission = agentObj.stats.totalEarned;
            } catch (err) {
                console.error(`Error calculating stats for agent ${agent._id}:`, err);
                agentObj.stats = { totalEarned: 0, confirmed: 0, availableCommission: 0 };
            }
            return agentObj;
        }));

        res.json({
            success: true,
            agents: agentsWithStats
        });
    } catch (error) {
        console.error('Get all agents error:', error);
        res.status(500).json({ success: false, message: 'Error fetching agents' });
    }
};
// Update Agent Profile
exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, bankDetails } = req.body;
        const agent = await Agent.findById(req.user.id);

        if (!agent) {
            return res.status(404).json({ success: false, message: 'Agent not found' });
        }

        if (name) agent.name = name;
        if (phone) agent.phone = phone;
        if (req.body.address) agent.address = req.body.address;

        // Handle image updates
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => ({
                public_id: file.filename,
                url: `uploads/seller-images/${file.filename}`,
                alt: 'Agent image'
            }));
            // Append or replace? Let's append but limit to 10
            const totalImages = [...(agent.images || []), ...newImages];
            agent.images = totalImages.slice(-10); // Keep last 10
        }

        if (bankDetails) {
            agent.bankDetails = {
                ...agent.bankDetails,
                ...bankDetails
            };
        }

        await agent.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            agent: {
                id: agent._id,
                name: agent.name,
                email: agent.email,
                phone: agent.phone,
                address: agent.address,
                images: agent.images || [],
                bankDetails: agent.bankDetails
            }
        });
    } catch (error) {
        console.error('Update agent profile error:', error);
        res.status(500).json({ success: false, message: 'Error updating profile' });
    }
};

// Get My Sub-Agents (For Agent Dashboard)
exports.getMyAgents = async (req, res) => {
    try {
        const agents = await Agent.find({ parentAgent: req.user.id }).select('-password');
        res.json({
            success: true,
            agents
        });
    } catch (error) {
        console.error('Get my agents error:', error);
        res.status(500).json({ success: false, message: 'Error fetching sub-agents' });
    }
};
