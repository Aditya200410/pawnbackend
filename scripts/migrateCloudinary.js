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

if (!fs.existsSync(migrationDir)) {
    fs.mkdirSync(migrationDir, { recursive: true });
}

// We need a way to find Cloudinary URLs for items that have "local" paths in DB but are missing on disk.
// Since we don't have a backup, we will look at shopback.json and other data sources to try and match IDs.
const shopBackData = fs.existsSync(path.join(__dirname, '../data/shopback.json'))
    ? JSON.parse(fs.readFileSync(path.join(__dirname, '../data/shopback.json'), 'utf8'))
    : [];

const findOriginalUrl = (id, currentPath) => {
    // Try to find the original Cloudinary URL from shopback.json if available
    const match = shopBackData.find(p => p.id === id || p._id === id);
    if (match && match.image && match.image.includes('cloudinary')) return match.image;
    return null;
};

const downloadImage = (url, filename) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(migrationDir, filename);
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
            return resolve(`uploads/migrated/${filename}`);
        }

        const file = fs.createWriteStream(filePath);
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Status: ${response.statusCode}`));
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

const isCloudinary = (url) => typeof url === 'string' && (url.includes('cloudinary.com') || url.includes('res.cloudinary.com'));

const migrateCollection = async (Model, fields, name) => {
    console.log(`Processing ${name}...`);
    const docs = await Model.find({});
    let count = 0;
    let recovered = 0;

    for (const doc of docs) {
        let updated = false;

        for (const field of fields) {
            const val = doc[field];

            // Handle recovery for broken local paths
            if (typeof val === 'string' && val.startsWith('uploads/migrated/')) {
                const localPath = path.join(__dirname, '../public', val);
                if (!fs.existsSync(localPath) || fs.statSync(localPath).size === 0) {
                    const original = findOriginalUrl(doc._id.toString(), val);
                    if (original) {
                        try {
                            const recoveredPath = await downloadImage(original, path.basename(val));
                            recovered++;
                            console.log(`Recovered missing image: ${val}`);
                        } catch (err) {
                            // Still missing, but we tried
                        }
                    }
                }
            }

            // Standard Migration
            if (typeof val === 'string' && isCloudinary(val)) {
                const filename = `${name.toLowerCase()}-${doc._id}-${Date.now()}${path.extname(val.split('?')[0]) || '.jpg'}`;
                try {
                    doc[field] = await downloadImage(val, filename);
                    updated = true;
                    count++;
                } catch (err) { }
            }
            else if (Array.isArray(val)) {
                let arrayUpdated = false;
                for (let i = 0; i < val.length; i++) {
                    const item = val[i];
                    if (typeof item === 'string' && isCloudinary(item)) {
                        try {
                            const filename = `${name.toLowerCase()}-arr-${doc._id}-${i}-${Date.now()}${path.extname(item.split('?')[0]) || '.jpg'}`;
                            val[i] = await downloadImage(item, filename);
                            arrayUpdated = true;
                            count++;
                        } catch (err) { }
                    } else if (item && typeof item === 'object' && isCloudinary(item.url)) {
                        try {
                            const filename = `${name.toLowerCase()}-objarr-${doc._id}-${i}-${Date.now()}${path.extname(item.url.split('?')[0]) || '.jpg'}`;
                            item.url = await downloadImage(item.url, filename);
                            arrayUpdated = true;
                            count++;
                        } catch (err) { }
                    }
                }
                if (arrayUpdated) {
                    doc.markModified(field);
                    updated = true;
                }
            }
        }

        if (updated) await doc.save();
    }
    console.log(`Finished ${name}. Migrated: ${count}, Recovered: ${recovered}`);
    return count + recovered;
};

const migrate = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        const results = [];
        results.push(await migrateCollection(Product, ['image', 'images'], 'Product'));
        results.push(await migrateCollection(BestSeller, ['image', 'images'], 'BestSeller'));
        results.push(await migrateCollection(Loved, ['image', 'images'], 'Loved'));
        results.push(await migrateCollection(FeaturedProduct, ['image', 'images'], 'FeaturedProduct'));
        results.push(await migrateCollection(Category, ['image'], 'Category'));
        results.push(await migrateCollection(HeroCarousel, ['image'], 'HeroCarousel'));
        results.push(await migrateCollection(Seller, ['profileImage', 'images'], 'Seller'));

        const total = results.reduce((a, b) => a + b, 0);
        console.log(`\nSync complete! Total actions: ${total}`);
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
};

migrate();
