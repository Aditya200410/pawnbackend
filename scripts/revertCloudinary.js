const mongoose = require('mongoose');
require('dotenv').config();

// Models
const Product = require('../models/Product');
const Category = require('../models/cate');
const Seller = require('../models/Seller');
const HeroCarousel = require('../models/heroCarousel');
const BestSeller = require('../models/bestSeller');
const Loved = require('../models/loved');
const FeaturedProduct = require('../models/FeaturedProduct');
const ProductSubmission = require('../models/ProductSubmission');
const CloudinaryBackup = require('../models/CloudinaryBackup');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rikoenterprises25:2EKCeowE0NtO9d2q@cluster0.g68doth.mongodb.net/rikocraft?retryWrites=true&w=majority&appName=Cluster0";

const models = {
    'Product': Product,
    'Category': Category,
    'Seller': Seller,
    'HeroCarousel': HeroCarousel,
    'BestSeller': BestSeller,
    'Loved': Loved,
    'FeaturedProduct': FeaturedProduct,
    'ProductSubmission': ProductSubmission
};

const revert = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const backups = await CloudinaryBackup.find({});
        console.log(`Found ${backups.length} backups to restore.`);

        let restoredCount = 0;

        for (const backup of backups) {
            const Model = models[backup.modelName];
            if (!Model) continue;

            const doc = await Model.findById(backup.documentId);
            if (!doc) continue;

            const fieldPath = backup.fieldName.split('.');

            // Logic to traverse and set the value back
            if (fieldPath.length === 1) {
                // Simple field: image
                doc[fieldPath[0]] = backup.cloudinaryUrl;
            } else if (fieldPath.length === 2) {
                // Nested or array: images.0 or profileImage.url
                const [parent, child] = fieldPath;
                if (!isNaN(child)) {
                    // It's an array index: images.0
                    if (Array.isArray(doc[parent])) {
                        doc[parent][parseInt(child)] = backup.cloudinaryUrl;
                    }
                } else {
                    // It's an object property: profileImage.url
                    if (doc[parent]) {
                        doc[parent][child] = backup.cloudinaryUrl;
                    }
                }
            } else if (fieldPath.length === 3) {
                // Deep nested: productImages.0.url
                const [p1, p2, p3] = fieldPath;
                if (Array.isArray(doc[p1]) && doc[p1][parseInt(p2)]) {
                    doc[p1][parseInt(p2)][p3] = backup.cloudinaryUrl;
                }
            }

            doc.markModified(fieldPath[0]);
            await doc.save();
            restoredCount++;
        }

        console.log(`Successfully reverted ${restoredCount} images to Cloudinary.`);
        // Note: We don't delete the backups after revert so you can migrate again if needed
        process.exit(0);
    } catch (err) {
        console.error('Revert failed:', err);
        process.exit(1);
    }
};

revert();
