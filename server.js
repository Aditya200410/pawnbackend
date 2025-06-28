// File: admin/backend/server.js
require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const shopRoutes = require("./routes/shop");
const orderRoutes = require("./routes/orders");
const authRoutes = require('./routes/auth'); // Assuming your auth routes are here
const lovedRoutes = require('./routes/loved'); // Assuming your loved routes are here
const categoryRoutes = require('./routes/category');
const featuredProductRoutes = require('./routes/featuredProduct');
const bestSellerRoutes = require('./routes/bestSeller');
const cartRoutes = require('./routes/cart');
const fs = require('fs');
const heroCarouselRoutes = require('./routes/heroCarousel');
const sellerRoutes = require('./routes/seller');
const couponRoutes = require('./routes/coupon');
const crypto = require('crypto');
const app = express();

// Generate a random JWT secret for seller authentication if not provided
if (!process.env.JWT_SECRET_SELLER) {
  process.env.JWT_SECRET_SELLER = crypto.randomBytes(64).toString('hex');
  console.log('Generated random JWT_SECRET_SELLER');
}

// CORS configuration - Allow specific origins for production
const allowedOrigins = [
  
  'http://localhost:5173',
  'http://localhost:5174',
  'https://www.rikocraft.com',
  'https://pawn-shop-admin.vercel.app',
  'https://pawn-shop.vercel.app',
  'https://pawn-shop-git-main-adityas-projects.vercel.app',
  'https://pawn-shop-adityas-projects.vercel.app',
  'https://pawn-shop-git-local-host-api-used-aditya200410s-projects.vercel.app',
  'https://pawnadmin-thnt.vercel.app',
  'https://pawnadmin-thnt-n414tz6mc-aditya200410s-projects.vercel.app',
  'https://pawnadmin-thnt.vercel.app',
  'https://pawnadmin-thnt-n414tz6mc-aditya200410s-projects.vercel.app'
];

function isVercelPreview(origin) {
  return /^https:\/\/pawn-shop-git-.*-aditya200410s-projects\.vercel\.app$/.test(origin);
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || isVercelPreview(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin', 'Content-Length'],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Additional CORS headers for all routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || isVercelPreview(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Content-Length');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(cookieParser());

// Ensure data directories exist
const dataDir = path.join(__dirname, 'data');
const userProductDir = path.join(dataDir, 'userproduct');

// Create directories if they don't exist
[dataDir, userProductDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created directory:', dir);
  }
});

// Serve static files with proper MIME types
app.use('/pawnbackend/data', (req, res, next) => {
  const filePath = path.join(__dirname, 'data', req.path);
  const ext = path.extname(filePath).toLowerCase();
  
  // Set proper content type for videos and images
  if (ext === '.mp4') {
    res.setHeader('Content-Type', 'video/mp4');
  } else if (ext === '.png') {
    res.setHeader('Content-Type', 'image/png');
  } else if (ext === '.jpg' || ext === '.jpeg') {
    res.setHeader('Content-Type', 'image/jpeg');
  } else if (ext === '.gif') {
    res.setHeader('Content-Type', 'image/gif');
  }
  
  next();
}, express.static(path.join(__dirname, 'data'), {
  fallthrough: true,
  maxAge: '1h'
}));

// MongoDB Connection URL from environment variable
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pawn";

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB connected to:", MONGODB_URI))
  .catch(err => console.error("MongoDB connection error:", err));

// API Routes
app.use("/api/shop", shopRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/bestseller', bestSellerRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/loved', lovedRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/featured-products', featuredProductRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/hero-carousel', heroCarouselRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/data-page', require('./routes/dataPage'));
app.use('/api/payment', require('./routes/payment'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint for CORS
app.get('/test-cors', (req, res) => {
  res.status(200).json({
    message: 'CORS is working correctly',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// Port from environment variable
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 




