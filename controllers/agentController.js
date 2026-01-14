const Agent = require('../models/Agent');
const mongoose = require('mongoose');
const withdrawalController = require('./withdrawalController');
const bcrypt = require('bcryptjs'); // Assuming bcrypt is used, though not visible in snippet
const Seller = require('../models/Seller');
const jwt = require('jsonwebtoken');

// Register a new agent
exports.register = async (req, res) => {
    try {
        const { name, email, phone, password, agentCode } = req.body;

        if (!agentCode) {
            return res.status(400).json({ success: false, message: 'Agent Code is required' });
        }

        // 1. Verify Agent Code / Find Seller
        const seller = await Seller.findOne({ sellerAgentCode: agentCode });
        if (!seller) {
            return res.status(404).json({ success: false, message: 'Invalid Agent Code. No seller found.' });
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

        // 3. Create Agent
        const newAgent = await Agent.create({
            name,
            email,
            phone,
            password,
            linkedSeller: seller._id,
            usedAgentCode: agentCode,
            personalAgentCode // Save the new unique code
        });

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
                personalAgentCode: newAgent.personalAgentCode,
                linkedSeller: {
                    id: seller._id,
                    businessName: seller.businessName
                }
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
