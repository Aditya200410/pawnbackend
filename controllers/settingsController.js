const Settings = require('../models/Settings');

// Check if Settings model is available
if (!Settings) {
  console.error('Settings model not found');
}

// Get all settings
const getAllSettings = async (req, res) => {
  try {
    console.log('Fetching all settings...');
    const settings = await Settings.find().sort({ key: 1 });
    console.log('Settings found:', settings.length);
    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings', error: error.message });
  }
};

// Get a specific setting by key
const getSettingByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await Settings.findOne({ key });

    if (!setting) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }

    res.status(200).json({ success: true, setting });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch setting', error: error.message });
  }
};

// Create or update a setting
const upsertSetting = async (req, res) => {
  try {
    const { key, value, description } = req.body;

    console.log('Upserting setting:', { key, value, description });

    if (!key || value === undefined) {
      return res.status(400).json({ success: false, message: 'Key and value are required' });
    }

    // Convert value to number for numeric settings
    let processedValue = value;
    if (key === 'cod_upfront_amount') {
      // Allow 0 as a valid value
      processedValue = value === '' || value === null || value === undefined ? 39 : Number(value);
    }

    // Use findOneAndUpdate with upsert to create or update
    const setting = await Settings.findOneAndUpdate(
      { key },
      {
        value: processedValue,
        description: description || '',
        updatedAt: new Date()
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    console.log('Setting saved:', setting);

    res.status(200).json({
      success: true,
      message: 'Setting saved successfully',
      setting
    });
  } catch (error) {
    console.error('Error saving setting:', error);
    res.status(500).json({ success: false, message: 'Failed to save setting', error: error.message });
  }
};

// Delete a setting
const deleteSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await Settings.findOneAndDelete({ key });

    if (!setting) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Setting deleted successfully',
      setting
    });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ success: false, message: 'Failed to delete setting', error: error.message });
  }
};

// Initialize default settings
const initializeDefaultSettings = async () => {
  try {
    const defaultSettings = [
      {
        key: 'cod_upfront_amount',
        value: 0,
        description: 'Upfront payment amount for Cash on Delivery orders (in rupees)'
      },
      {
        key: 'seller_commission_percentage',
        value: 30,
        description: 'Percentage of sales taken as commission from sellers'
      },
      {
        key: 'agent_commission_percentage',
        value: 10,
        description: 'Percentage of sales given as commission to agents'
      },
      {
        key: 'distribution_plans',
        value: [
          {
            id: 'starter',
            name: 'Starter Distribution',
            price: 15000,
            limit: 50,
            limitText: '50 Shops',
            color: 'blue'
          },
          {
            id: 'pro',
            name: 'Pro Distribution',
            price: 20000,
            limit: 100,
            limitText: '100 Shops',
            color: 'red'
          },
          {
            id: 'unlimited',
            name: 'Unlimited Distribution',
            price: 25000,
            limit: 999999,
            limitText: 'Unlimited Shops',
            color: 'pink',
            popular: true
          }
        ],
        description: 'Distribution plans for agents/distributors'
      }
    ];

    for (const setting of defaultSettings) {
      const existingSetting = await Settings.findOne({ key: setting.key });
      if (!existingSetting) {
        await Settings.create(setting);
        console.log(`Default setting created: ${setting.key}`);
      }
    }
  } catch (error) {
    console.error('Error initializing default settings:', error);
  }
};

// Get COD upfront amount (public endpoint)
const getCodUpfrontAmount = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'cod_upfront_amount' });
    let amount = 0; // Default to 39 if not found

    if (setting) {
      // Ensure the value is a number and allow 0 as valid
      amount = (setting.value === '' || setting.value === null || setting.value === undefined) ? 39 : Number(setting.value);
    }

    res.status(200).json({
      success: true,
      amount: amount
    });
  } catch (error) {
    console.error('Error fetching COD upfront amount:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch COD upfront amount',
      amount: 39 // Fallback to default
    });
  }
};

// Get Seller commission percentage (public endpoint)
const getSellerCommissionPercentage = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'seller_commission_percentage' });
    let percentage = 30; // Default to 30 if not found

    if (setting) {
      percentage = (setting.value === '' || setting.value === null || setting.value === undefined) ? 30 : Number(setting.value);
    }

    res.status(200).json({
      success: true,
      percentage: percentage
    });
  } catch (error) {
    console.error('Error fetching seller commission percentage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch seller commission percentage',
      percentage: 30 // Fallback to default
    });
  }
};

// Get Agent commission percentage (public endpoint)
const getAgentCommissionPercentage = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'agent_commission_percentage' });
    let percentage = 10; // Default to 10 if not found

    if (setting) {
      percentage = (setting.value === '' || setting.value === null || setting.value === undefined) ? 10 : Number(setting.value);
    }

    res.status(200).json({
      success: true,
      percentage: percentage
    });
  } catch (error) {
    console.error('Error fetching agent commission percentage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent commission percentage',
      percentage: 10 // Fallback to default
    });
  }
};

// Get Distribution Plans (public endpoint)
const getDistributionPlans = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'distribution_plans' });
    let plans = [
      {
        id: 'starter',
        name: 'Starter Distribution',
        price: 15000,
        limit: 50,
        limitText: '50 Shops',
        color: 'blue'
      },
      {
        id: 'pro',
        name: 'Pro Distribution',
        price: 20000,
        limit: 100,
        limitText: '100 Shops',
        color: 'red'
      },
      {
        id: 'unlimited',
        name: 'Unlimited Distribution',
        price: 25000,
        limit: 999999,
        limitText: 'Unlimited Shops',
        color: 'pink',
        popular: true
      }
    ];

    if (setting) {
      plans = setting.value;
    }

    res.status(200).json({
      success: true,
      plans: plans
    });
  } catch (error) {
    console.error('Error fetching distribution plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch distribution plans',
      plans: []
    });
  }
};

module.exports = {
  getAllSettings,
  getSettingByKey,
  upsertSetting,
  deleteSetting,
  initializeDefaultSettings,
  getCodUpfrontAmount,
  getSellerCommissionPercentage,
  getAgentCommissionPercentage,
  getDistributionPlans
};