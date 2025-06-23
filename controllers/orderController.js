const Order = require('../models/Order');
const fs = require('fs').promises;
const path = require('path');
const ordersJsonPath = path.join(__dirname, '../data/orders.json');

// Create a new order
const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      country,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus,
    } = req.body;

    // Comprehensive validation
    const requiredFields = ['customerName', 'email', 'phone', 'address', 'city', 'state', 'pincode', 'country', 'items', 'totalAmount', 'paymentMethod', 'paymentStatus'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Items array is required and must not be empty.' 
      });
    }

    // Validate each item has required fields
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemRequiredFields = ['name', 'price', 'quantity'];
      const missingItemFields = itemRequiredFields.filter(field => !item[field]);
      
      if (missingItemFields.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Item ${i + 1} is missing required fields: ${missingItemFields.join(', ')}` 
        });
      }
    }

    const newOrder = new Order({
      customerName,
      email,
      phone,
      address: {
        street: address,
        city,
        state,
        pincode,
        country,
      },
      items,
      totalAmount,
      paymentMethod,
      paymentStatus,
    });

    const savedOrder = await newOrder.save();
    // Save to orders.json for admin
    await appendOrderToJson(savedOrder);
    res.status(201).json({ success: true, message: 'Order created successfully!', order: savedOrder });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, message: 'Failed to create order.', error: error.message });
  }
};

// Get all orders for a specific user by email
const getOrdersByEmail = async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }
    // Read from orders.json instead of MongoDB
    let orders = [];
    try {
      const data = await fs.readFile(ordersJsonPath, 'utf8');
      orders = JSON.parse(data);
      if (!Array.isArray(orders)) orders = [];
    } catch (err) {
      orders = [];
    }
    // Filter by email (case-insensitive)
    const filteredOrders = orders.filter(order => order.email && order.email.toLowerCase() === userEmail.toLowerCase());
    res.status(200).json({ success: true, orders: filteredOrders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders.', error: error.message });
  }
};

// Get a single order by its ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('Error fetching order by ID:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order.', error: error.message });
  }
};

// Helper to append order to orders.json
async function appendOrderToJson(order) {
  try {
    let orders = [];
    try {
      const data = await fs.readFile(ordersJsonPath, 'utf8');
      orders = JSON.parse(data);
      if (!Array.isArray(orders)) orders = [];
    } catch (err) {
      // If file doesn't exist, start with empty array
      orders = [];
    }
    orders.push(order);
    await fs.writeFile(ordersJsonPath, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Failed to append order to orders.json:', err);
  }
}

module.exports = {
  createOrder,
  getOrdersByEmail,
  getOrderById,
}; 