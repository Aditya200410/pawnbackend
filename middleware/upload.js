const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const baseUploadDir = path.join(__dirname, '../public/uploads');

const createUploadMiddleware = (folderName) => {
  const uploadDir = path.join(baseUploadDir, folderName || 'misc');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Create unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, 'file-' + uniqueSuffix + ext);
    }
  });

  return multer({
    storage: storage,
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB limit
    }
  });
};

module.exports = createUploadMiddleware;