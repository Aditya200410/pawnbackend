const mongoose = require('mongoose');
const Settings = require('./models/Settings');

// MongoDB Connection URL
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pawn";

async function testSettings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("MongoDB connected for testing");

    // Test if Settings model works
    console.log('Settings model:', typeof Settings);
    
    // Check if there are any settings
    const settings = await Settings.find();
    console.log('Current settings:', settings);

    // Test creating a setting
    const testSetting = await Settings.findOneAndUpdate(
      { key: 'cod_upfront_amount' },
      { 
        value: 39, 
        description: 'Upfront payment amount for Cash on Delivery orders (in rupees)',
        updatedAt: new Date()
      },
      { 
        new: true, 
        upsert: true,
        runValidators: true 
      }
    );
    
    console.log('Test setting created/updated:', testSetting);

    // Test fetching all settings
    const allSettings = await Settings.find().sort({ key: 1 });
    console.log('All settings after test:', allSettings);

    console.log('Settings test completed successfully');
  } catch (error) {
    console.error('Settings test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

testSettings(); 