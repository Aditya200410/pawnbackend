const jwt = require('jsonwebtoken');

const adminLogin = (req, res) => {
  const { username, email, password } = req.body;

  // Validate input - accept either username or email
  if ((!username && !email) || !password) {
    return res.status(400).json({ message: "Email/Username and password are required" });
  }

  // Use either username or email for authentication
  const loginCredential = username || email;

  // Admin credentials
  if (loginCredential === "koushik048@gmail.com" && password === "Riko!@#123") {
    const token = jwt.sign(
      { 
        id: 1, 
        username: "koushik048@gmail.com",
        email: "koushik048@gmail.com",
        isAdmin: true,
        role: 'admin'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: 1,
        username: "koushik048@gmail.com",
        email: "koushik048@gmail.com",
        isAdmin: true,
        role: 'admin'
      }
    });
  } else {
    res.status(401).json({ 
      success: false,
      message: "Invalid admin credentials" 
    });
  }
};

module.exports = {
  adminLogin
}; 