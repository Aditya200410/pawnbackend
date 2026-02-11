const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Serve files from the uploads directory
router.get('/*', (req, res) => {
    // req.params[0] will contain the path after /api/uploads/
    const filePath = req.params[0];
    const absolutePath = path.join(__dirname, '../public/uploads', filePath);

    // Security: Prevent directory traversal
    const uploadsRoot = path.join(__dirname, '../public/uploads');
    if (!absolutePath.startsWith(uploadsRoot)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    // Check if file exists
    if (fs.existsSync(absolutePath)) {
        // Add strong caching for images (1 year)
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        // Let express handle Content-Type based on extension
        res.sendFile(absolutePath);
    } else {
        res.status(404).json({ message: 'File not found' });
    }
});

module.exports = router;
