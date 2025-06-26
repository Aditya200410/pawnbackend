const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify token
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
      if (err) {
        console.log('Token verification failed:', err.message);
        return res.status(403).json({ error: 'Invalid token' });
      }

      req.user = user;
      next();
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

const isAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      console.log('No user object in request');
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.isAdmin) {
      console.log('User is not an admin:', req.user);
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Admin check failed' });
  }
};

module.exports = {
  authenticateToken,
  isAdmin
}; 