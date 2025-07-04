const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  console.log('Auth middleware called');
  console.log('Headers:', req.headers);
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('Auth header:', authHeader);
  console.log('Token:', token ? 'Present' : 'Missing');

  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    console.log('Token verified:', verified);
    req.user = verified;
    next();
  } catch (error) {
    console.log('Token verification failed:', error.message);
    res.status(400).json({ message: 'Invalid token' });
  }
};

const isAdmin = (req, res, next) => {
  console.log('Admin check called');
  console.log('User:', req.user);
  console.log('Is admin:', req.user?.isAdmin);
  
  if (req.user && req.user.isAdmin === true) {
    console.log('Admin check passed');
    next();
  } else {
    console.error('Admin check failed:', {
      user: req.user,
      isAdmin: req.user?.isAdmin
    });
    res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
};

module.exports = {
  authenticateToken,
  isAdmin
}; 