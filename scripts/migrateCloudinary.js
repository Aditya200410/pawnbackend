const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
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

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rikoenterprises25:2EKCeowE0NtO9d2q@cluster0.g68doth.mongodb.net/rikocraft?retryWrites=true&w=majority&appName=Cluster0";

const migrationDir = path.join(__dirname, '../public/uploads/migrated');

// Ensure migration directory exists
if (!fs.existsSync(migrationDir)) {
    fs.mkdirSync(migrationDir, { recursive: true });
}

const getCleanExtension = (url) => {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const ext = path.extname(pathname);
        return ext || '.jpg';
    } catch {
        const match = url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i);
        return match ? match[0] : '.jpg';
    }
};

const downloadImage = (url, filename) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(migrationDir, filename);
        if (fs.existsSync(filePath)) {
            return resolve(`uploads/migrated/${filename}`);
        }

        const file = fs.createWriteStream(filePath);
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(`uploads/migrated/${filename}`);
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => { });
            reject(err);
        });
    });
};

const isCloudinary = (url) => {
    return typeof url === 'string' && (url.includes('cloudinary.com') || url.includes('res.cloudinary.com'));
};

const migrateCollection = async (Model, fields, name) => {
    console.log(`Migrating ${name}...`);
    const docs = await Model.find({});
    let count = 0;

    for (const doc of docs) {
        let updated = false;

        for (const field of fields) {
            // Case 1: Simple string field (image)
            if (typeof doc[field] === 'string' && isCloudinary(doc[field])) {
                const ext = getCleanExtension(doc[field]);
                const filename = `${name.toLowerCase()}-${doc._id}-${Date.now()}${ext}`;
                try {
                    const localPath = await downloadImage(doc[field], filename);
                    doc[field] = localPath;
                    updated = true;
                    count++;
                } catch (err) {
                    console.error(`Error ${name} ${field}:`, err.message);
                }
            }
            // Case 2: Array of strings (images)
            else if (Array.isArray(doc[field]) && doc[field].length > 0 && typeof doc[field][0] === 'string') {
                const newArray = [];
                let arrayUpdated = false;
                for (let i = 0; i < doc[field].length; i++) {
                    const url = doc[field][i];
                    if (isCloudinary(url)) {
                        const ext = getCleanExtension(url);
                        const filename = `${name.toLowerCase()}-array-${doc._id}-${i}-${Date.now()}${ext}`;
                        try {
                            const localPath = await downloadImage(url, filename);
                            newArray.push(localPath);
                            arrayUpdated = true;
                            count++;
                        } catch (err) {
                            console.error(`Error ${name} array ${i}:`, err.message);
                            newArray.push(url);
                        }
                    } else {
                        newArray.push(url);
                    }
                }
                if (arrayUpdated) {
                    doc[field] = newArray;
                    updated = true;
                }
            }
            // Case 3: Object with url property (profileImage, etc.)
            else if (doc[field] && typeof doc[field] === 'object' && isCloudinary(doc[field].url)) {
                const ext = getCleanExtension(doc[field].url);
                const filename = `${name.toLowerCase()}-obj-${doc._id}-${Date.now()}${ext}`;
                try {
                    const localPath = await downloadImage(doc[field].url, filename);
                    doc[field].url = localPath;
                    updated = true;
                    count++;
                } catch (err) {
                    console.error(`Error ${name} object ${field}:`, err.message);
                }
            }
            // Case 4: Array of objects with url property (productImages, images in Seller)
            else if (Array.isArray(doc[field]) && doc[field].length > 0 && doc[field][0] && typeof doc[field][0] === 'object' && isCloudinary(doc[field][0].url)) {
                let arrayUpdated = false;
                for (let i = 0; i < doc[field].length; i++) {
                    if (isCloudinary(doc[field][i].url)) {
                        const ext = getCleanExtension(doc[field][i].url);
                        const filename = `${name.toLowerCase()}-objarray-${doc._id}-${i}-${Date.now()}${ext}`;
                        try {
                            const localPath = await downloadImage(doc[field][i].url, filename);
                            doc[field][i].url = localPath;
                            arrayUpdated = true;
                            count++;
                        } catch (err) {
                            console.error(`Error ${name} objarray ${i}:`, err.message);
                        }
                    }
                }
                if (arrayUpdated) {
                    doc.markModified(field);
                    updated = true;
                }
            }
        }

        if (updated) {
            await doc.save();
        }
    }
    console.log(`Finished ${name}. Migrated ${count} images.`);
    return count;
};

const migrate = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const results = [];

        results.push(await migrateCollection(Product, ['image', 'images'], 'Product'));
        results.push(await migrateCollection(BestSeller, ['image', 'images'], 'BestSeller'));
        results.push(await migrateCollection(Loved, ['image', 'images'], 'Loved'));
        results.push(await migrateCollection(FeaturedProduct, ['image', 'images'], 'FeaturedProduct'));
        results.push(await migrateCollection(Category, ['image'], 'Category'));
        results.push(await migrateCollection(HeroCarousel, ['image'], 'HeroCarousel'));
        results.push(await migrateCollection(Seller, ['profileImage', 'images'], 'Seller'));
        results.push(await migrateCollection(ProductSubmission, ['productImages'], 'ProductSubmission'));

        const total = results.reduce((a, b) => a + b, 0);
        console.log(`\nMigration complete! Total images migrated: ${total}`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();
