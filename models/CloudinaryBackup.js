const mongoose = require('mongoose');

const cloudinaryBackupSchema = new mongoose.Schema({
    modelName: { type: String, required: true }, // e.g., 'Product', 'Seller'
    documentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    fieldName: { type: String, required: true }, // e.g., 'image', 'profileImage.url'
    cloudinaryUrl: { type: String, required: true },
    migratedAt: { type: Date, default: Date.now }
});

// Compound index to quickly find and restore values
cloudinaryBackupSchema.index({ modelName: 1, documentId: 1, fieldName: 1 }, { unique: true });

module.exports = mongoose.model('CloudinaryBackup', cloudinaryBackupSchema);
