const mongoose = require('mongoose');
const Seller = require('./models/Seller');
const CommissionHistory = require('./models/CommissionHistory');
const Withdraw = require('./models/Withdraw');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pawn-shop', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Function to calculate available commission based on commission history and withdrawals
const calculateAvailableCommission = async (sellerId) => {
  try {
    // Get all confirmed commissions
    const confirmedCommissions = await CommissionHistory.find({
      sellerId,
      status: 'confirmed',
      type: 'earned'
    });

    const totalConfirmedCommissions = confirmedCommissions.reduce((sum, commission) => sum + commission.amount, 0);

    // Get all completed withdrawals
    const completedWithdrawals = await Withdraw.find({
      seller: sellerId,
      status: 'completed'
    });

    const totalWithdrawn = completedWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);

    // Get pending withdrawals (amounts that are already requested but not yet processed)
    const pendingWithdrawals = await Withdraw.find({
      seller: sellerId,
      status: 'pending'
    });

    const totalPendingWithdrawals = pendingWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);

    // Available commission = confirmed commissions - completed withdrawals - pending withdrawals
    const availableCommission = Math.max(0, totalConfirmedCommissions - totalWithdrawn - totalPendingWithdrawals);

    return {
      availableCommission,
      totalConfirmedCommissions,
      totalWithdrawn,
      totalPendingWithdrawals
    };
  } catch (error) {
    console.error('Error calculating available commission:', error);
    throw error;
  }
};

// Main function to fix commission calculation
const fixCommissionCalculation = async () => {
  try {
    console.log('=== FIXING COMMISSION CALCULATION ===');
    
    const sellers = await Seller.find({});
    console.log(`Found ${sellers.length} sellers to process`);
    
    let updatedCount = 0;
    let errors = [];

    for (const seller of sellers) {
      try {
        console.log(`\nProcessing seller: ${seller.businessName} (${seller._id})`);
        
        const { availableCommission, totalConfirmedCommissions, totalWithdrawn, totalPendingWithdrawals } = 
          await calculateAvailableCommission(seller._id);
        
        console.log(`  Current availableCommission: ${seller.availableCommission}`);
        console.log(`  Calculated availableCommission: ${availableCommission}`);
        console.log(`  Total confirmed commissions: ${totalConfirmedCommissions}`);
        console.log(`  Total withdrawn: ${totalWithdrawn}`);
        console.log(`  Total pending withdrawals: ${totalPendingWithdrawals}`);
        
        if (seller.availableCommission !== availableCommission) {
          seller.availableCommission = availableCommission;
          await seller.save();
          updatedCount++;
          
          console.log(`  ✅ Updated seller ${seller.businessName}: ${seller.availableCommission} -> ${availableCommission}`);
        } else {
          console.log(`  ✅ No update needed for ${seller.businessName}`);
        }
      } catch (error) {
        console.error(`  ❌ Error updating seller ${seller.businessName}:`, error);
        errors.push({
          sellerId: seller._id,
          sellerName: seller.businessName,
          error: error.message
        });
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total sellers processed: ${sellers.length}`);
    console.log(`Sellers updated: ${updatedCount}`);
    console.log(`Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(error => {
        console.log(`  - ${error.sellerName}: ${error.error}`);
      });
    }

    console.log('\n✅ Commission calculation fix completed!');
    
  } catch (error) {
    console.error('Error in fixCommissionCalculation:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the fix
fixCommissionCalculation(); 