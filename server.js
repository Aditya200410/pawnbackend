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
const app = express();

// CORS configuration - Allow specific origins for production
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  'https://pawn-shop-admin.vercel.app',
  'https://pawn-shop.vercel.app',
  'https://pawn-shop-git-main-adityas-projects.vercel.app',
  'https://pawn-shop-adityas-projects.vercel.app',
  'https://pawnadmin-thnt.vercel.app',
  'https://pawnadmin-thnt-n414tz6mc-aditya200410s-projects.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin'],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Additional CORS headers for all routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Content-Length');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(cookieParser());

// Serve static files from the data directory
app.use('/pawnbackend/data', express.static(path.join(__dirname, 'data')));

// Ensure the upload directory exists on startup (for Render and local)
const userProductDir = path.join(__dirname, 'data/userproduct');
if (!fs.existsSync(userProductDir)) {
  fs.mkdirSync(userProductDir, { recursive: true });
  console.log('Created userproduct directory:', userProductDir);
}

// MongoDB Connection URL from environment variable
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pawn";

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB connected to:", MONGODB_URI))
  .catch(err => console.error("MongoDB connection error:", err));

// API Routes
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/shop', productRoutes); // Use the same shop routes for /api/shop
app.use('/api/bestseller', bestSellerRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/loved', lovedRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/featured-products', featuredProductRoutes);
app.use('/api/cart', cartRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Port from environment variable
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 




