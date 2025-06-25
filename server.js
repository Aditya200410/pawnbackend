// File: admin/backend/server.js
require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const productRoutes = require("./routes/shop");
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
const crypto = require('crypto');
const app = express();

// Generate a random JWT secret for seller authentication if not provided
if (!process.env.JWT_SECRET_SELLER) {
  process.env.JWT_SECRET_SELLER = crypto.randomBytes(64).toString('hex');
  console.log('Generated random JWT_SECRET_SELLER');
}

// CORS configuration - Allow specific origins for production
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'https://pawn-shop-admin.vercel.app',
  'https://pawn-shop.vercel.app',
  'https://pawn-shop-git-main-adityas-projects.vercel.app',
  'https://pawn-shop-adityas-projects.vercel.app',
  'https://pawnadmin-thnt.vercel.app',
  'https://pawnadmin-thnt-n414tz6mc-aditya200410s-projects.vercel.app',
  'https://pawnadmin-thnt.vercel.app',
  'https://pawnadmin-thnt-n414tz6mc-aditya200410s-projects.vercel.app',
  'https://pawnbackend-xmqa.onrender.com'
];

function isVercelPreview(origin) {
  if (!origin) return false;
  return /^https:\/\/[a-zA-Z0-9-]+-[a-zA-Z0-9-]+\.vercel\.app$/.test(origin) ||
         /^https:\/\/pawn-shop-git-.*-aditya200410s-projects\.vercel\.app$/.test(origin);
}

// CORS middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || isVercelPreview(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      // For development, allow all origins
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin'],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Additional security headers
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || isVercelPreview(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
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
  
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif'
  };
  
  if (mimeTypes[ext]) {
    res.setHeader('Content-Type', mimeTypes[ext]);
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

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/shop', productRoutes);
app.use('/api/bestseller', bestSellerRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/loved', lovedRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/featured-products', featuredProductRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/hero-carousel', heroCarouselRoutes);
app.use('/api/seller', sellerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
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

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Port from environment variable
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 




