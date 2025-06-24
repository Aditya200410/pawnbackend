// File: admin/backend/routes/orders.js
const express = require("express");
const Order = require("../models/Order");
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { createOrder, getOrdersByEmail, getOrderById } = require('../controllers/orderController');
const { authenticateToken } = require('../middleware/auth');

const ordersFilePath = path.join(__dirname, '../data/orders.json');

// Helper function to read orders from JSON file
const readOrders = () => {
  try {
    if (fs.existsSync(ordersFilePath)) {
      const data = fs.readFileSync(ordersFilePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error reading orders file:', error);
    return [];
  }
};

// Helper function to write orders to JSON file
const writeOrders = (orders) => {
  try {
    const dirPath = path.dirname(ordersFilePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2));
  } catch (error) {
    console.error('Error writing orders file:', error);
    throw new Error('Failed to save order to JSON file');
  }
};

// Admin: Get all orders from MongoDB (not orders.json)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders from MongoDB', error: error.message });
  }
});

// Create order
router.post("/", createOrder);

// Update order status
router.put("/:id/status", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    // Validate status
    if (!['processing', 'confirmed', 'manufacturing', 'shipped', 'delivered'].includes(orderStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    // Update in MongoDB
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { orderStatus },
      { new: true, runValidators: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Update in JSON file
    const orders = readOrders();
    const orderIndex = orders.findIndex(order => order._id.toString() === id);
    if (orderIndex !== -1) {
      orders[orderIndex] = updatedOrder.toObject({ virtuals: true });
      writeOrders(orders);
    }

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Error updating order status:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid order status',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Failed to update order status',
      error: error.message 
    });
  }
});

// Update payment status
router.put("/:id/payment", async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    // Validate payment status
    if (!['pending', 'completed', 'failed'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid payment status' });
    }

    // Update in MongoDB
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { paymentStatus },
      { new: true, runValidators: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Update in JSON file
    const orders = readOrders();
    const orderIndex = orders.findIndex(order => order._id.toString() === id);
    if (orderIndex !== -1) {
      orders[orderIndex] = updatedOrder.toObject({ virtuals: true });
      writeOrders(orders);
    }

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Error updating payment status:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Failed to update payment status',
      error: error.message 
    });
  }
});

// Route to get all orders for a user by email
// GET /api/orders?email=user@example.com
router.get('/user', getOrdersByEmail);

// Route to get a single order by its ID
// GET /api/orders/:id
router.get('/:id', getOrderById);

module.exports = router;
