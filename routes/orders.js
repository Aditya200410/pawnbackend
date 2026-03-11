// File: admin/backend/routes/orders.js
const express = require("express");
const Order = require("../models/Order");
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { createOrder, getOrdersByEmail, getOrderById, sendOrderStatusUpdateEmail, requestReplacement } = require('../controllers/orderController');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const commissionController = require('../controllers/commissionController');

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

// Admin: Get all orders from MongoDB (not orders.json) - PROTECTED
router.get('/json', authenticateToken, isAdmin, async (req, res) => {
  try {
    // Filter out abandoned/failed online payments to keep the dashboard clean
    const orders = await Order.find({
      $or: [
        { paymentStatus: 'completed' },
        { paymentStatus: 'pending_upfront' },
        // Show COD orders unless they explicitly failed (e.g. upfront payment failed)
        { paymentMethod: 'cod', paymentStatus: { $ne: 'failed' } }
      ]
    }).sort({ createdAt: -1 })
      .populate('sellerId', 'businessName email')
      .populate('agentId', 'name email personalAgentCode');
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders from MongoDB', error: error.message });
  }
});

// Create order
router.post("/", createOrder);

// Update order status - PROTECTED
router.put("/:id/status", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    // Validate status
    if (!['processing', 'confirmed', 'manufacturing', 'shipped', 'delivered', 'waiting_payment', 'replacement_requested', 'approved_replacement', 'shipped_replacement', 'delivered_replacement'].includes(orderStatus)) {
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

    // Update in JSON file (Commented out to prevent nodemon restart)
    /*
    const orders = readOrders();
    const orderIndex = orders.findIndex(order => order._id.toString() === id);
    if (orderIndex !== -1) {
      orders[orderIndex] = updatedOrder.toObject({ virtuals: true });
      writeOrders(orders);
    }
    */

    // Send status update email (non-blocking)
    sendOrderStatusUpdateEmail(updatedOrder).catch(err => console.error('Order status update email error:', err));

    // If status is updated to delivered, confirm commissions
    if (orderStatus === 'delivered' || orderStatus === 'delivered_replacement') {
      commissionController.confirmCommissionByOrder(id).catch(err => console.error('Error confirming commission on deliver:', err));
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

// General order update endpoint - PROTECTED
router.put("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate orderStatus if provided
    if (updateData.orderStatus && !['processing', 'confirmed', 'manufacturing', 'shipped', 'delivered', 'waiting_payment', 'replacement_requested', 'approved_replacement', 'shipped_replacement', 'delivered_replacement'].includes(updateData.orderStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    // Validate paymentStatus if provided
    if (updateData.paymentStatus && !['pending', 'completed', 'failed'].includes(updateData.paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid payment status' });
    }

    // Update in MongoDB
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Update in JSON file (Commented out to prevent nodemon restart)
    /*
    const orders = readOrders();
    const orderIndex = orders.findIndex(order => order._id.toString() === id);
    if (orderIndex !== -1) {
      orders[orderIndex] = updatedOrder.toObject({ virtuals: true });
      writeOrders(orders);
    }
    */
    // If status is updated to delivered, confirm commissions
    if (updateData.orderStatus === 'delivered' || updateData.orderStatus === 'delivered_replacement') {
      commissionController.confirmCommissionByOrder(id).catch(err => console.error('Error confirming commission on deliver:', err));
    }

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Error updating order:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid order data',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update order',
      error: error.message
    });
  }
});

// Route to get all orders for a user by email
// GET /api/orders?email=user@example.com
router.get('/', getOrdersByEmail);

// Route to get a single order by its ID
// GET /api/orders/:id
router.get('/:id', getOrderById);

// Route to request replacement
router.post("/:id/request-replacement", requestReplacement);

module.exports = router;
