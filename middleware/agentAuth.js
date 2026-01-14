const jwt = require('jsonwebtoken');

const protectAgent = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

        // Ensure the token belongs to an agent
        if (decoded.role !== 'agent') {
            return res.status(403).json({ success: false, message: 'Access denied: Agents only' });
        }

        req.user = decoded; // { id, role: 'agent' }
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }
};

module.exports = protectAgent;
