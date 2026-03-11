const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp').Jimp;

// Serve files from the uploads directory
router.get('/*', async (req, res) => {
    // req.params[0] will contain the path after /api/uploads/
    const filePath = req.params[0];
    const absolutePath = path.normalize(path.join(__dirname, '../public/uploads', filePath));

    // Security: Prevent directory traversal
    const uploadsRoot = path.normalize(path.join(__dirname, '../public/uploads'));
    if (!absolutePath.startsWith(uploadsRoot)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ message: 'File not found' });
    }

    // Cache options: 7 days
    const cacheOptions = {
        maxAge: '7d',
        immutable: true
    };

    // Handle thumbnail request
    if (req.query.thumbnail === 'true') {
        try {
            const ext = path.extname(absolutePath).toLowerCase();
            // Skip non-image files
            if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
                return res.sendFile(absolutePath, cacheOptions);
            }

            const thumbnailDir = path.join(uploadsRoot, '.thumbnails');
            if (!fs.existsSync(thumbnailDir)) {
                fs.mkdirSync(thumbnailDir, { recursive: true });
            }

            // Create a unique cache filename based on original path
            const cacheFilename = Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_') + '_thumb.jpg';
            const cachePath = path.join(thumbnailDir, cacheFilename);

            // Check if cached thumbnail exists and is not older than source
            if (fs.existsSync(cachePath)) {
                const sourceStat = fs.statSync(absolutePath);
                const cacheStat = fs.statSync(cachePath);
                if (cacheStat.mtime >= sourceStat.mtime) {
                    return res.sendFile(cachePath, cacheOptions);
                }
            }

            // Generate thumbnail using Jimp
            const image = await Jimp.read(absolutePath);
            await image
                .resize({ width: 80 }) // Slightly larger for better 'blurred' look
                .quality(50) // Lower quality for very small file size
                .write(cachePath);

            return res.sendFile(cachePath, cacheOptions);
        } catch (error) {
            console.error('Thumbnail generation error:', error);
            // Fallback to original image if generation fails
            return res.sendFile(absolutePath, cacheOptions);
        }
    }

    // Serve original file with caching
    res.sendFile(absolutePath, cacheOptions);
});

module.exports = router;

