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
    const { page = 1, limit = 20, status, sellerId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (sellerId) query.sellerId = sellerId;

    let withdrawals = await Withdrawal.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('sellerId', 'businessName email phone')
      .populate('processedBy', 'name email');

    // Defensive: check if population worked, log if not
    withdrawals.forEach(w => {
      if (!w.sellerId || typeof w.sellerId === 'string') {
        console.warn('Warning: sellerId not populated for withdrawal', w._id, w.sellerId);
      }
    });

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

    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      console.log('Withdrawal not found:', withdrawalId);
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    console.log('Found withdrawal:', {
      id: withdrawal._id,
      status: withdrawal.status,
      amount: withdrawal.amount,
      sellerId: withdrawal.sellerId,
      requestDate: withdrawal.requestDate
    });

    if (withdrawal.status !== 'pending') {
      console.log('Withdrawal cannot be approved - current status:', withdrawal.status);
      return res.status(400).json({
        success: false,
        message: 'Withdrawal cannot be approved in current status'
      });
    }

    // Simple approval - just update status to approved
    withdrawal.status = 'approved';
    withdrawal.processedBy = adminId;
    withdrawal.processedDate = new Date();
    withdrawal.adminNotes = 'Approved - Amount will be credited in 3-5 business days';
    await withdrawal.save();

    console.log('Withdrawal saved with new status:', withdrawal.status);

    // Update commission history
    const commissionUpdate = await CommissionHistory.findOneAndUpdate(
      { withdrawalId: withdrawal._id },
      { status: 'confirmed' }
    );
    console.log('Commission history update result:', commissionUpdate);

    console.log('=== WITHDRAWAL APPROVED SUCCESSFULLY ===');

    res.json({
      success: true,
      message: 'Withdrawal approved successfully. Amount will be credited in 3-5 business days.',
      withdrawal: {
        id: withdrawal._id,
        status: withdrawal.status,
        processedDate: withdrawal.processedDate
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

    const withdrawal = await Withdrawal.findById(withdrawalId);
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

    // Simple rejection
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

    console.log('Withdrawal rejected successfully');

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

    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

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

    console.log('Withdrawal completed successfully');

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