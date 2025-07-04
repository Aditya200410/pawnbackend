const Order = require('../models/Order');
const Seller = require('../models/Seller');
const fs = require('fs').promises;
const path = require('path');
const ordersJsonPath = path.join(__dirname, '../data/orders.json');
const Product = require('../models/Product');

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
      sellerToken, // Get seller token from request
      transactionId, // PhonePe transaction ID
      couponCode, // Coupon code if applied
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

    // Calculate commission if seller token is provided
    let commission = 0;
    let seller = null;
    
    console.log('Order creation - sellerToken received:', sellerToken);
    
    if (sellerToken) {
      seller = await Seller.findOne({ sellerToken });
      console.log('Seller found:', seller ? seller.businessName : 'Not found');
      
      if (seller) {
        commission = totalAmount * 0.30; // 30% commission
        // Add commission to seller's account
        await seller.addCommission(totalAmount);
        console.log(`Commission added for seller ${seller.businessName}: ₹${commission}`);
      } else {
        console.log('No seller found with token:', sellerToken);
      }
    } else {
      console.log('No sellerToken provided in order');
    }

    // Map paymentStatus to valid enum values
    let mappedPaymentStatus = paymentStatus;
    if (paymentStatus === 'partial' || paymentStatus === 'processing') {
      mappedPaymentStatus = 'pending';
    }
    if (!['pending', 'completed', 'failed'].includes(mappedPaymentStatus)) {
      mappedPaymentStatus = 'pending';
    }

    // Support both address as string (street) and as object
    let addressObj;
    if (typeof address === 'object' && address !== null) {
      addressObj = {
        street: address.street || '',
        city: address.city || city || '',
        state: address.state || state || '',
        pincode: address.pincode || pincode || '',
        country: address.country || country || '',
      };
    } else {
      addressObj = {
        street: address || '',
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        country: country || '',
      };
    }

    const newOrder = new Order({
      customerName,
      email,
      phone,
      address: addressObj,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus: mappedPaymentStatus,
      sellerToken,
      commission,
      transactionId,
      couponCode,
    });

    const savedOrder = await newOrder.save();

    // Decrement stock for each product in the order
    for (const item of items) {
      if (item.productId) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.stock = Math.max(0, (product.stock || 0) - (item.quantity || 1));
          if (product.stock === 0) {
            product.inStock = false;
          }
          await product.save();
        }
      }
    }

    // Save to orders.json for admin
    await appendOrderToJson(savedOrder);
    
    res.status(201).json({ 
      success: true, 
      message: 'Order created successfully!', 
      order: savedOrder,
      commission: seller ? { amount: commission, sellerName: seller.businessName } : null
    });
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
    // Case-insensitive search for email
    const orders = await Order.find({ email: { $regex: new RegExp(`^${userEmail}$`, 'i') } }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
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
    orders.push(order.toObject ? order.toObject({ virtuals: true }) : order);
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