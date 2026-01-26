const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create directories
const uploadsDir = path.join(__dirname, '../public/uploads');
const productSubmissionsDir = path.join(uploadsDir, 'product-submissions');

if (!fs.existsSync(productSubmissionsDir)) {
    fs.mkdirSync(productSubmissionsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, productSubmissionsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'submission-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
}).array('productImages', 5);

const handleProductSubmissionImage = (req, res, next) => {
    upload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }

        if (req.files) {
            req.files.forEach(file => {
                file.url = `uploads/product-submissions/${file.filename}`;
            });
        }
        next();
    });
};

module.exports = { handleProductSubmissionImage };
