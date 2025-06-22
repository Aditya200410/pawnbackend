const Order = require('../models/Order');

// Create a new order
const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      address,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus,
    } = req.body;

    // Basic validation
    if (!email || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing required order fields.' });
    }

    const newOrder = new Order({
      customerName,
      email,
      phone,
      address,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus,
    });

    const savedOrder = await newOrder.save();
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
    const orders = await Order.find({ email: userEmail }).sort({ createdAt: -1 }); // Sort by newest first
    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders.', error: error.message });
  }
};

module.exports = {
  createOrder,
  getOrdersByEmail,
}; 