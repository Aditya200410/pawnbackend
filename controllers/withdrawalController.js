const Withdrawal = require('../models/Withdrawal');
const CommissionHistory = require('../models/CommissionHistory');
const Seller = require('../models/Seller');

// Request withdrawal
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, sellerNotes } = req.body;
    const sellerId = req.seller.id; // From auth middleware

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid withdrawal amount'
      });
    }

    // Get seller details
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    // Check if seller has sufficient available commission
    if (seller.availableCommission < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient available commission for withdrawal'
      });
    }

    // Validate bank details
    if (!seller.bankAccountNumber || !seller.ifscCode || !seller.bankName || !seller.accountHolderName) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your bank details before requesting withdrawal'
      });
    }

    // Create withdrawal request
    const withdrawal = new Withdrawal({
      sellerId,
      amount,
      sellerNotes,
      bankDetails: {
        accountHolderName: seller.accountHolderName,
        accountNumber: seller.bankAccountNumber,
        ifscCode: seller.ifscCode,
        bankName: seller.bankName
      },
      netAmount: amount // Will be calculated by pre-save middleware
    });

    await withdrawal.save();

    // Update seller's available commission
    seller.availableCommission -= amount;
    await seller.save();

    // Create commission history entry
    const commissionEntry = new CommissionHistory({
      sellerId,
      orderId: null, // Not related to a specific order
      type: 'withdrawn',
      amount: amount,
      orderAmount: 0,
      description: `Withdrawal request of ₹${amount.toFixed(2)}`,
      withdrawalId: withdrawal._id,
      status: 'pending'
    });

    await commissionEntry.save();

    res.json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      withdrawal: {
        id: withdrawal._id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        requestDate: withdrawal.requestDate
      }
    });

  } catch (error) {
    console.error('Withdrawal request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit withdrawal request'
    });
  }
};

// Get seller's withdrawal history
exports.getWithdrawalHistory = async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const { page = 1, limit = 10, status } = req.query;

    const query = { sellerId };
    if (status) {
      query.status = status;
    }

    const withdrawals = await Withdrawal.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('processedBy', 'name email');

    const total = await Withdrawal.countDocuments(query);

    res.json({
      success: true,
      withdrawals,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get withdrawal history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawal history'
    });
  }
};

// Get withdrawal details
exports.getWithdrawalDetails = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const sellerId = req.seller.id;

    const withdrawal = await Withdrawal.findOne({
      _id: withdrawalId,
      sellerId
    }).populate('processedBy', 'name email');

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    res.json({
      success: true,
      withdrawal
    });

  } catch (error) {
    console.error('Get withdrawal details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawal details'
    });
  }
};

// Cancel withdrawal request (only if pending)
exports.cancelWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const sellerId = req.seller.id;

    const withdrawal = await Withdrawal.findOne({
      _id: withdrawalId,
      sellerId,
      status: 'pending'
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found or cannot be cancelled'
      });
    }

    // Update withdrawal status
    withdrawal.status = 'cancelled';
    withdrawal.processedDate = new Date();
    await withdrawal.save();

    // Refund the amount to seller's available commission
    const seller = await Seller.findById(sellerId);
    seller.availableCommission += withdrawal.amount;
    await seller.save();

    // Update commission history
    await CommissionHistory.findOneAndUpdate(
      { withdrawalId: withdrawal._id },
      { status: 'cancelled' }
    );

    res.json({
      success: true,
      message: 'Withdrawal request cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel withdrawal request'
    });
  }
};

// Admin: Get all withdrawal requests
exports.getAllWithdrawals = async (req, res) => {
  try {
    console.log('=== GET ALL WITHDRAWALS REQUEST ===');
    console.log('Request headers:', req.headers);
    console.log('Request user:', req.user);
    console.log('Query params:', req.query);
    
    const { page = 1, limit = 20, status, sellerId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (sellerId) query.sellerId = sellerId;

    console.log('MongoDB query:', query);

    // Get withdrawals from new system (Withdrawal model)
    let newWithdrawals = await Withdrawal.find(query)
      .sort({ createdAt: -1 })
      .populate('sellerId', 'businessName email phone')
      .populate('processedBy', 'name email');

    console.log('New system withdrawals count:', newWithdrawals.length);

    // Get withdrawals from old system (Withdraw model)
    const Withdraw = require('../models/Withdraw');
    const oldQuery = {};
    if (status) oldQuery.status = status;
    if (sellerId) oldQuery.seller = sellerId;

    let oldWithdrawals = await Withdraw.find(oldQuery)
      .sort({ requestedAt: -1 })
      .populate('seller', 'businessName email phone');

    console.log('Old system withdrawals count:', oldWithdrawals.length);

    // Convert old withdrawals to match new format
    const convertedOldWithdrawals = oldWithdrawals.map(w => ({
      _id: w._id,
      amount: w.amount,
      status: w.status,
      requestDate: w.requestedAt,
      processedDate: w.processedAt,
      sellerId: w.seller,
      bankDetails: w.bankDetails,
      adminNotes: null,
      rejectionReason: null,
      createdAt: w.requestedAt,
      updatedAt: w.processedAt || w.requestedAt,
      // Add system identifier
      system: 'old'
    }));

    // Add system identifier to new withdrawals
    const newWithdrawalsWithSystem = newWithdrawals.map(w => ({
      ...w.toObject(),
      system: 'new'
    }));

    // Combine both systems
    let allWithdrawals = [...newWithdrawalsWithSystem, ...convertedOldWithdrawals];

    // Sort by creation date (newest first)
    allWithdrawals.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.requestDate);
      const dateB = new Date(b.createdAt || b.requestDate);
      return dateB - dateA;
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedWithdrawals = allWithdrawals.slice(startIndex, endIndex);

    console.log('Combined withdrawals count:', allWithdrawals.length);
    console.log('Paginated withdrawals count:', paginatedWithdrawals.length);
    console.log('Withdrawals:', paginatedWithdrawals.map(w => ({
      id: w._id,
      amount: w.amount,
      status: w.status,
      sellerId: w.sellerId,
      sellerName: w.sellerId?.businessName || 'Unknown',
      system: w.system
    })));

    const total = allWithdrawals.length;

    res.json({
      success: true,
      withdrawals: paginatedWithdrawals,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get all withdrawals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawals'
    });
  }
};

// Admin: Approve withdrawal
exports.approveWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const adminId = req.user?.id;

    console.log('=== APPROVE WITHDRAWAL REQUEST ===');
    console.log('Withdrawal ID:', withdrawalId);
    console.log('Admin ID:', adminId);
    console.log('Request user:', req.user);
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);

    if (!withdrawalId) {
      console.log('No withdrawal ID provided');
      return res.status(400).json({
        success: false,
        message: 'Withdrawal ID is required'
      });
    }

    // Try to find in new system first
    let withdrawal = await Withdrawal.findById(withdrawalId);
    let system = 'new';

    if (!withdrawal) {
      // Try to find in old system
      const Withdraw = require('../models/Withdraw');
      withdrawal = await Withdraw.findById(withdrawalId);
      system = 'old';
    }

    if (!withdrawal) {
      console.log('Withdrawal not found in either system:', withdrawalId);
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    console.log('Found withdrawal:', {
      id: withdrawal._id,
      status: withdrawal.status,
      amount: withdrawal.amount,
      system: system
    });

    if (withdrawal.status !== 'pending') {
      console.log('Withdrawal cannot be approved - current status:', withdrawal.status);
      return res.status(400).json({
        success: false,
        message: 'Withdrawal cannot be approved in current status'
      });
    }

    if (system === 'new') {
      // New system approval
      withdrawal.status = 'approved';
      withdrawal.processedBy = adminId;
      withdrawal.processedDate = new Date();
      withdrawal.adminNotes = 'Approved - Amount will be credited in 3-5 business days';
      await withdrawal.save();

      // Update commission history
      await CommissionHistory.findOneAndUpdate(
        { withdrawalId: withdrawal._id },
        { status: 'confirmed' }
      );
    } else {
      // Old system approval
      withdrawal.status = 'completed';
      withdrawal.processedAt = new Date();
      await withdrawal.save();
    }

    console.log('Withdrawal approved successfully in', system, 'system');

    res.json({
      success: true,
      message: 'Withdrawal approved successfully. Amount will be credited in 3-5 business days.',
      withdrawal: {
        id: withdrawal._id,
        status: withdrawal.status,
        processedDate: withdrawal.processedDate || withdrawal.processedAt
      }
    });

  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve withdrawal',
      error: error.message
    });
  }
};

// Admin: Reject withdrawal
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.user.id;

    console.log('Rejecting withdrawal:', withdrawalId);

    // Try to find in new system first
    let withdrawal = await Withdrawal.findById(withdrawalId);
    let system = 'new';

    if (!withdrawal) {
      // Try to find in old system
      const Withdraw = require('../models/Withdraw');
      withdrawal = await Withdraw.findById(withdrawalId);
      system = 'old';
    }

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal cannot be rejected in current status'
      });
    }

    if (system === 'new') {
      // New system rejection
      withdrawal.status = 'rejected';
      withdrawal.processedBy = adminId;
      withdrawal.rejectionReason = rejectionReason || 'Withdrawal request rejected';
      withdrawal.processedDate = new Date();
      await withdrawal.save();

      // Refund the amount to seller's available commission
      const seller = await Seller.findById(withdrawal.sellerId);
      if (seller) {
        seller.availableCommission += withdrawal.amount;
        await seller.save();
        console.log('Amount refunded to seller');
      }

      // Update commission history
      await CommissionHistory.findOneAndUpdate(
        { withdrawalId: withdrawal._id },
        { status: 'cancelled' }
      );
    } else {
      // Old system rejection
      withdrawal.status = 'rejected';
      withdrawal.processedAt = new Date();
      await withdrawal.save();
    }

    console.log('Withdrawal rejected successfully in', system, 'system');

    res.json({
      success: true,
      message: 'Withdrawal rejected successfully'
    });

  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject withdrawal'
    });
  }
};

// Admin: Complete withdrawal (optional - for when payment is actually made)
exports.completeWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const adminId = req.user.id;

    console.log('Completing withdrawal:', withdrawalId);

    // Try to find in new system first
    let withdrawal = await Withdrawal.findById(withdrawalId);
    let system = 'new';

    if (!withdrawal) {
      // Try to find in old system
      const Withdraw = require('../models/Withdraw');
      withdrawal = await Withdraw.findById(withdrawalId);
      system = 'old';
    }

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    if (system === 'new') {
      if (withdrawal.status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Withdrawal must be approved before completion'
        });
      }

      // Mark as completed
      withdrawal.status = 'completed';
      withdrawal.processedDate = new Date();
      await withdrawal.save();

      // Update commission history
      await CommissionHistory.findOneAndUpdate(
        { withdrawalId: withdrawal._id },
        { status: 'confirmed' }
      );
    } else {
      if (withdrawal.status !== 'pending' && withdrawal.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Withdrawal cannot be completed in current status'
        });
      }

      // Mark as completed
      withdrawal.status = 'completed';
      withdrawal.processedAt = new Date();
      await withdrawal.save();
    }

    console.log('Withdrawal completed successfully in', system, 'system');

    res.json({
      success: true,
      message: 'Withdrawal marked as completed'
    });

  } catch (error) {
    console.error('Complete withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete withdrawal'
    });
  }
};

// Admin: Get all withdrawals for a specific seller
exports.getWithdrawalsBySeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    if (!sellerId) {
      return res.status(400).json({ success: false, message: 'sellerId is required' });
    }

    console.log('=== GET WITHDRAWALS BY SELLER ===');
    console.log('Seller ID:', sellerId);

    // Get withdrawals from new system (Withdrawal model)
    const newWithdrawals = await Withdrawal.find({ sellerId })
      .sort({ createdAt: -1 })
      .populate('sellerId', 'businessName email phone')
      .populate('processedBy', 'name email');

    console.log('New system withdrawals for seller:', newWithdrawals.length);

    // Get withdrawals from old system (Withdraw model)
    const Withdraw = require('../models/Withdraw');
    const oldWithdrawals = await Withdraw.find({ seller: sellerId })
      .sort({ requestedAt: -1 })
      .populate('seller', 'businessName email phone');

    console.log('Old system withdrawals for seller:', oldWithdrawals.length);

    // Convert old withdrawals to match new format
    const convertedOldWithdrawals = oldWithdrawals.map(w => ({
      _id: w._id,
      amount: w.amount,
      status: w.status,
      requestDate: w.requestedAt,
      processedDate: w.processedAt,
      sellerId: w.seller,
      bankDetails: w.bankDetails,
      adminNotes: null,
      rejectionReason: null,
      createdAt: w.requestedAt,
      updatedAt: w.processedAt || w.requestedAt,
      system: 'old'
    }));

    // Add system identifier to new withdrawals
    const newWithdrawalsWithSystem = newWithdrawals.map(w => ({
      ...w.toObject(),
      system: 'new'
    }));

    // Combine both systems
    let allWithdrawals = [...newWithdrawalsWithSystem, ...convertedOldWithdrawals];

    // Sort by creation date (newest first)
    allWithdrawals.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.requestDate);
      const dateB = new Date(b.createdAt || b.requestDate);
      return dateB - dateA;
    });

    console.log('Combined withdrawals for seller:', allWithdrawals.length);

    res.json({ success: true, withdrawals: allWithdrawals });
  } catch (error) {
    console.error('Get withdrawals by seller error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch withdrawals for seller' });
  }
}; 