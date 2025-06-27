const mongoose = require('mongoose');
const DataPage = require('../models/DataPage');

// MongoDB connection
mongoose.connect('mongodb://127.0.0.1:27017/pawn', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function testPolicies() {
  try {
    console.log('Testing policies data...');
    
    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Count documents
    const count = await DataPage.countDocuments();
    console.log('Number of policy documents:', count);
    
    // Get all policies
    const policies = await DataPage.find();
    console.log('All policies:', JSON.stringify(policies, null, 2));
    
    // Check specific types
    const terms = await DataPage.findOne({ type: 'terms' });
    console.log('Terms policy:', terms ? 'Found' : 'Not found');
    
    const refund = await DataPage.findOne({ type: 'refund' });
    console.log('Refund policy:', refund ? 'Found' : 'Not found');
    
    const privacy = await DataPage.findOne({ type: 'privacy' });
    console.log('Privacy policy:', privacy ? 'Found' : 'Not found');
    
  } catch (error) {
    console.error('Error testing policies:', error);
  } finally {
    mongoose.connection.close();
  }
}

testPolicies(); 