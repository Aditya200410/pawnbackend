const CommissionHistory = require('../models/CommissionHistory');
const Seller = require('../models/Seller');
const Order = require('../models/Order');

// Get seller's commission history
exports.getCommissionHistory = async (req, res) => {
  try {


    // Check if seller is authenticated
    if (!req.seller || !req.seller.id) {
      return res.status(401).json({
        success: false,
        message: 'Seller authentication required'
      });
    }

    const sellerId = req.seller.id;
    const { page = 1, limit = 10, type, status, startDate, endDate } = req.query;



    const query = { sellerId };

    if (type) query.type = type;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }



    const commissionHistory = await CommissionHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('orderId', 'orderNumber customerName')
      .populate('withdrawalId', 'amount status')
      .populate('processedBy', 'name email');

    const total = await CommissionHistory.countDocuments(query);

    // Get summary statistics
    const summary = await CommissionHistory.aggregate([
      { $match: { sellerId: sellerId } },
      {
        $group: {
          _id: null,
          totalEarned: {
            $sum: {
              $cond: [
                { $in: ['$type', ['earned', 'bonus']] },
                '$amount',
                0
              ]
            }
          },
          totalDeducted: {
            $sum: {
              $cond: [
                { $in: ['$type', ['deducted', 'withdrawn']] },
                '$amount',
                0
              ]
            }
          },
          pendingAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'pending'] },
                '$amount',
                0
              ]
            }
          },
          confirmedAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'confirmed'] },
                '$amount',
                0
              ]
            }
          }
        }
      }
    ]);



    res.json({
      success: true,
      commissionHistory,
      summary: summary[0] || {
        totalEarned: 0,
        totalDeducted: 0,
        pendingAmount: 0,
        confirmedAmount: 0
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get commission history error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commission history',
      error: error.message
    });
  }
};

// Get commission details
exports.getCommissionDetails = async (req, res) => {
  try {
    const { commissionId } = req.params;
    const sellerId = req.seller.id;

    const commission = await CommissionHistory.findOne({
      _id: commissionId,
      sellerId
    })
      .populate('orderId', 'orderNumber customerName items')
      .populate('withdrawalId', 'amount status bankDetails')
      .populate('processedBy', 'name email');

    if (!commission) {
      return res.status(404).json({
        success: false,
        message: 'Commission record not found'
      });
    }

    res.json({
      success: true,
      commission
    });

  } catch (error) {
    console.error('Get commission details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commission details'
    });
  }
};

// Get commission summary
exports.getCommissionSummary = async (req, res) => {
  try {
    const sellerId = req.seller.id;

    // Get summary statistics (same as in getCommissionHistory)
    const summary = await CommissionHistory.aggregate([
      { $match: { sellerId: sellerId } },
      {
        $group: {
          _id: null,
          totalEarned: {
            $sum: {
              $cond: [
                { $in: ['$type', ['earned', 'bonus']] },
                '$amount',
                0
              ]
            }
          },
          totalDeducted: {
            $sum: {
              $cond: [
                { $in: ['$type', ['deducted', 'withdrawn']] },
                '$amount',
                0
              ]
            }
          },
          pendingAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'pending'] },
                '$amount',
                0
              ]
            }
          },
          confirmedAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'confirmed'] },
                '$amount',
                0
              ]
            }
          }
        }
      }
    ]);

    const typeSummary = await CommissionHistory.aggregate([
      { $match: { sellerId: sellerId } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);

    const statusSummary = await CommissionHistory.aggregate([
      { $match: { sellerId: sellerId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Get monthly earnings for the last 12 months
    const monthlyEarnings = await CommissionHistory.aggregate([
      {
        $match: {
          sellerId: sellerId,
          type: 'earned',
          status: 'confirmed'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalEarned: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.json({
      success: true,
      summary: summary[0] || {
        totalEarned: 0,
        totalDeducted: 0,
        pendingAmount: 0,
        confirmedAmount: 0
      },
      typeSummary,
      statusSummary,
      monthlyEarnings
    });

  } catch (error) {
    console.error('Get commission summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commission summary'
    });
  }
};

// Create commission entry (called when order is completed)
// Create commission entry (called when order is completed)
// Create commission entry (called when order is completed)
exports.createCommissionEntry = async (orderId, sellerId, orderAmount, commissionRate = null, agentId = null) => {
  try {
    const Settings = require('../models/Settings');
    const Order = require('../models/Order');
    const Seller = require('../models/Seller');
    const Agent = require('../models/Agent');

    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Default Commission Rates
    let sellerRate = 0.30;
    let agentRate = 0.10;

    // Fetch Rates from Settings
    try {
      const sellerSetting = await Settings.findOne({ key: 'seller_commission_percentage' });
      if (sellerSetting && sellerSetting.value !== undefined) {
        sellerRate = Number(sellerSetting.value) / 100;
      }

      const agentSetting = await Settings.findOne({ key: 'agent_commission_percentage' });
      if (agentSetting && agentSetting.value !== undefined) {
        agentRate = Number(agentSetting.value) / 100;
      }
    } catch (err) {
      console.error('Error fetching commission settings:', err);
    }

    const createdEntries = [];

    // Calculate Amounts
    let sellerCommissionAmount = 0;
    let agentCommissionAmount = 0;

    if (agentId) {
      // Independent Commissions: Both Agent and Seller get their full rates
      agentCommissionAmount = orderAmount * agentRate;
      sellerCommissionAmount = orderAmount * sellerRate;

      // Round to nearest 10
      agentCommissionAmount = Math.round(agentCommissionAmount / 10) * 10;
      sellerCommissionAmount = Math.round(sellerCommissionAmount / 10) * 10;

      const firstProductName = order.items && order.items.length > 0 ? order.items[0].name : '';
      const description = firstProductName
        ? `Commission earned from: ${firstProductName} (#${order.orderNumber || orderId})`
        : `Commission earned from order #${order.orderNumber || orderId}`;

      // 1. Create Agent Commission Entry
      const agentEntry = new CommissionHistory({
        sellerId: sellerId, // Keep reference to seller
        agentId: agentId,   // Main owner of this commission
        orderId,
        type: 'earned',
        amount: agentCommissionAmount,
        commissionRate: agentRate,
        orderAmount,
        description,
        status: 'confirmed',
        orderDetails: {
          orderNumber: order.orderNumber || `Order-${orderId}`,
          customerName: order.customerName || 'Unknown Customer',
          items: order.items ? order.items.map(item => ({
            productId: item.productId || null,
            productName: item.name || 'Unknown Product',
            quantity: item.quantity || 1,
            price: item.price || 0
          })) : []
        }
      });
      await agentEntry.save();
      createdEntries.push(agentEntry);

      // Update Agent Totals
      if (agentId) {
        await Agent.findByIdAndUpdate(agentId, {
          $inc: {
            totalCommission: agentCommissionAmount,
            totalOrders: 1
            // We can add pendingCommission logic here if status starts as pending
          }
        });
      }

    } else {
      // No Agent: Seller gets full rate
      // Use provided commissionRate if overrides, else default sellerRate
      const effectiveRate = commissionRate !== null ? commissionRate : sellerRate;
      sellerCommissionAmount = orderAmount * effectiveRate;
      sellerCommissionAmount = Math.round(sellerCommissionAmount / 10) * 10;
    }

    const sellerDescription = firstProductName
      ? `Commission earned from: ${firstProductName} (#${order.orderNumber || orderId})${agentId ? ' (after Agent deduction)' : ''}`
      : (agentId
        ? `Commission earned from order #${order.orderNumber || orderId} (after Agent deduction)`
        : `Commission earned from order #${order.orderNumber || orderId}`);

    // 2. Create Seller Commission Entry
    const sellerEntry = new CommissionHistory({
      sellerId,
      agentId: null,
      orderId,
      type: 'earned',
      amount: sellerCommissionAmount,
      commissionRate: commissionRate !== null ? commissionRate : sellerRate,
      orderAmount,
      description: sellerDescription,
      status: 'confirmed',
      orderDetails: {
        orderNumber: order.orderNumber || `Order-${orderId}`,
        customerName: order.customerName || 'Unknown Customer',
        items: order.items ? order.items.map(item => ({
          productId: item.productId || null,
          productName: item.name || 'Unknown Product',
          quantity: item.quantity || 1,
          price: item.price || 0
        })) : []
      }
    });

    await sellerEntry.save();
    createdEntries.push(sellerEntry);

    // Update seller's commission totals
    const seller = await Seller.findById(sellerId);
    if (seller) {
      seller.totalCommission = (seller.totalCommission || 0) + sellerCommissionAmount;
      seller.totalOrders = (seller.totalOrders || 0) + 1;
      await seller.save();
    } else {
      console.error('Seller not found for ID:', sellerId);
    }

    return createdEntries;

  } catch (error) {
    console.error('Create commission entry error:', error);
    throw error;
  }
};

// Admin: Get all commission history
exports.getAllCommissionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, sellerId, type, status } = req.query;

    const query = {};
    if (sellerId) query.sellerId = sellerId;
    if (type) query.type = type;
    if (status) query.status = status;

    const commissionHistory = await CommissionHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('sellerId', 'businessName email phone')
      .populate('orderId', 'orderNumber customerName')
      .populate('withdrawalId', 'amount status')
      .populate('processedBy', 'name email');

    const total = await CommissionHistory.countDocuments(query);

    res.json({
      success: true,
      commissionHistory,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get commission history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commission history',
      error: error.message
    });
  }
};

// Get AGENT'S commission history
exports.getAgentCommissionHistory = async (req, res) => {
  try {
    // Check if agent is authenticated
    if (!req.user || !req.user.id || req.user.role !== 'agent') {
      return res.status(401).json({ success: false, message: 'Agent authentication required' });
    }

    const agentId = req.user.id;
    const { page = 1, limit = 10, type, status, startDate, endDate } = req.query;

    const query = { agentId: agentId };

    if (type) query.type = type;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const commissionHistory = await CommissionHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('orderId', 'orderNumber customerName');

    const total = await CommissionHistory.countDocuments(query);

    // Get summary statistics for Agent
    const summary = await CommissionHistory.aggregate([
      { $match: { agentId: agentId } },
      {
        $group: {
          _id: null,
          totalEarned: {
            $sum: { $cond: [{ $in: ['$type', ['earned', 'bonus']] }, '$amount', 0] }
          },
          totalDeducted: {
            $sum: { $cond: [{ $in: ['$type', ['deducted', 'withdrawn']] }, '$amount', 0] }
          },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] }
          },
          confirmedAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$amount', 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      commissionHistory,
      summary: summary[0] || {
        totalEarned: 0,
        totalDeducted: 0,
        pendingAmount: 0,
        confirmedAmount: 0
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get agent commission history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent commission history'
    });
  }
};

// Admin: Confirm commission
exports.confirmCommission = async (req, res) => {
  try {
    const { commissionId } = req.params;
    const adminId = req.admin.id;

    const commission = await CommissionHistory.findById(commissionId);
    if (!commission) {
      return res.status(404).json({
        success: false,
        message: 'Commission record not found'
      });
    }

    // Only confirm if status is pending
    if (commission.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Commission is not in pending status'
      });
    }

    await commission.confirm(adminId);

    // Recalculate available commission using the proper calculation function
    const withdrawalController = require('./withdrawalController');
    const { availableCommission } = await withdrawalController.calculateAvailableCommission(commission.sellerId);

    // Update seller's available commission
    const seller = await Seller.findById(commission.sellerId);
    if (seller) {
      seller.availableCommission = availableCommission;
      await seller.save();
    }

    res.json({
      success: true,
      message: 'Commission confirmed successfully'
    });

  } catch (error) {
    console.error('Confirm commission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm commission'
    });
  }
};

// Admin: Cancel commission
exports.cancelCommission = async (req, res) => {
  try {
    const { commissionId } = req.params;
    const { reason } = req.body;
    const adminId = req.admin.id;

    const commission = await CommissionHistory.findById(commissionId);
    if (!commission) {
      return res.status(404).json({
        success: false,
        message: 'Commission record not found'
      });
    }

    // Only cancel if status is pending
    if (commission.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Commission is not in pending status'
      });
    }

    await commission.cancel(adminId, reason);

    res.json({
      success: true,
      message: 'Commission cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel commission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel commission'
    });
  }
};

// Helper function to recalculate seller's available commission
exports.recalculateSellerCommission = async (sellerId) => {
  try {
    // Use the proper calculation function from withdrawalController
    const withdrawalController = require('./withdrawalController');
    const { availableCommission } = await withdrawalController.calculateAvailableCommission(sellerId);

    // Update seller's available commission
    const seller = await Seller.findById(sellerId);
    if (seller) {
      seller.availableCommission = availableCommission;
      await seller.save();
    }

    return availableCommission;
  } catch (error) {
    console.error('Error recalculating seller commission:', error);
    throw error;
  }
}; 