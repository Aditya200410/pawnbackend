const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Seller = require('./models/Seller');
const CommissionHistory = require('./models/CommissionHistory');
const Withdraw = require('./models/Withdraw');

// Import the calculation function
const withdrawalController = require('./controllers/withdrawalController');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pawn-shop', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const testCommissionCalculation = async () => {
  try {
    console.log('=== TESTING COMMISSION CALCULATION ===');
    
    // Get a seller to test with
    const seller = await Seller.findOne({});
    if (!seller) {
      console.log('No seller found in database');
      return;
    }
    
    console.log(`Testing with seller: ${seller.businessName} (${seller._id})`);
    console.log(`Current availableCommission: ${seller.availableCommission}`);
    
    // Calculate available commission using the function
    const { availableCommission, totalConfirmedCommissions, totalWithdrawn, totalPendingWithdrawals } = 
      await withdrawalController.calculateAvailableCommission(seller._id);
    
    console.log('\n=== CALCULATION RESULTS ===');
    console.log(`Total confirmed commissions: ${totalConfirmedCommissions}`);
    console.log(`Total withdrawn: ${totalWithdrawn}`);
    console.log(`Total pending withdrawals: ${totalPendingWithdrawals}`);
    console.log(`Calculated available commission: ${availableCommission}`);
    console.log(`Current stored available commission: ${seller.availableCommission}`);
    
    if (seller.availableCommission !== availableCommission) {
      console.log('\n⚠️  MISMATCH DETECTED!');
      console.log(`Stored: ${seller.availableCommission}`);
      console.log(`Calculated: ${availableCommission}`);
      
      // Update the seller's available commission
      seller.availableCommission = availableCommission;
      await seller.save();
      console.log('✅ Updated seller\'s available commission');
    } else {
      console.log('\n✅ Available commission calculation is correct!');
    }
    
    // Show commission history
    const commissions = await CommissionHistory.find({ sellerId: seller._id }).sort({ createdAt: -1 });
    console.log('\n=== COMMISSION HISTORY ===');
    commissions.forEach(commission => {
      console.log(`${commission.status.toUpperCase()}: ₹${commission.amount} (${commission.type}) - ${commission.description}`);
    });
    
    // Show withdrawal history
    const withdrawals = await Withdraw.find({ seller: seller._id }).sort({ requestedAt: -1 });
    console.log('\n=== WITHDRAWAL HISTORY ===');
    withdrawals.forEach(withdrawal => {
      console.log(`${withdrawal.status.toUpperCase()}: ₹${withdrawal.amount} - ${withdrawal.requestedAt}`);
    });
    
  } catch (error) {
    console.error('Error testing commission calculation:', error);
  } finally {
    mongoose.connection.close();
  }
};

testCommissionCalculation(); 