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
const CloudinaryBackup = require('../models/CloudinaryBackup');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rikoenterprises25:2EKCeowE0NtO9d2q@cluster0.g68doth.mongodb.net/rikocraft?retryWrites=true&w=majority&appName=Cluster0";
const migrationDir = path.join(__dirname, '../public/uploads/migrated');

if (!fs.existsSync(migrationDir)) {
    fs.mkdirSync(migrationDir, { recursive: true });
}

const getCleanExtension = (url) => {
    try {
        const urlObj = new URL(url);
        const ext = path.extname(urlObj.pathname);
        return ext || '.jpg';
    } catch {
        const match = url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i);
        return match ? match[0] : '.jpg';
    }
};

const downloadImage = (url, filename) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(migrationDir, filename);
        if (fs.existsSync(filePath)) return resolve(`uploads/migrated/${filename}`);

        const file = fs.createWriteStream(filePath);
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Status: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => { file.close(); resolve(`uploads/migrated/${filename}`); });
        }).on('error', (err) => { fs.unlink(filePath, () => { }); reject(err); });
    });
};

const isCloudinary = (url) => typeof url === 'string' && (url.includes('cloudinary.com') || url.includes('res.cloudinary.com'));

const saveBackup = async (modelName, docId, fieldName, url) => {
    try {
        await CloudinaryBackup.findOneAndUpdate(
            { modelName, documentId: docId, fieldName },
            { cloudinaryUrl: url, migratedAt: new Date() },
            { upsert: true }
        );
    } catch (err) {
        console.error('Backup failed:', err.message);
    }
};

const migrateCollection = async (Model, fields, name) => {
    console.log(`Migrating ${name}...`);
    const docs = await Model.find({});
    let count = 0;

    for (const doc of docs) {
        let updated = false;

        for (const field of fields) {
            // String field
            if (typeof doc[field] === 'string' && isCloudinary(doc[field])) {
                await saveBackup(name, doc._id, field, doc[field]);
                const filename = `${name.toLowerCase()}-${doc._id}-${Date.now()}${getCleanExtension(doc[field])}`;
                try {
                    doc[field] = await downloadImage(doc[field], filename);
                    updated = true;
                    count++;
                } catch (err) { console.error(`Error ${name} ${field}:`, err.message); }
            }
            // array of strings
            else if (Array.isArray(doc[field]) && doc[field].length > 0 && typeof doc[field][0] === 'string') {
                let arrayUpdated = false;
                const newArray = [];
                for (let i = 0; i < doc[field].length; i++) {
                    const url = doc[field][i];
                    if (isCloudinary(url)) {
                        await saveBackup(name, doc._id, `${field}.${i}`, url);
                        const filename = `${name.toLowerCase()}-array-${doc._id}-${i}-${Date.now()}${getCleanExtension(url)}`;
                        try {
                            newArray.push(await downloadImage(url, filename));
                            arrayUpdated = true;
                            count++;
                        } catch (err) { newArray.push(url); }
                    } else { newArray.push(url); }
                }
                if (arrayUpdated) { doc[field] = newArray; updated = true; }
            }
            // Object url
            else if (doc[field] && typeof doc[field] === 'object' && isCloudinary(doc[field].url)) {
                await saveBackup(name, doc._id, `${field}.url`, doc[field].url);
                const filename = `${name.toLowerCase()}-obj-${doc._id}-${Date.now()}${getCleanExtension(doc[field].url)}`;
                try {
                    doc[field].url = await downloadImage(doc[field].url, filename);
                    updated = true;
                    count++;
                } catch (err) { }
            }
            // Array of objects with url
            else if (Array.isArray(doc[field]) && doc[field].length > 0 && doc[field][0] && typeof doc[field][0] === 'object' && isCloudinary(doc[field][0].url)) {
                let arrayUpdated = false;
                for (let i = 0; i < doc[field].length; i++) {
                    if (isCloudinary(doc[field][i].url)) {
                        await saveBackup(name, doc._id, `${field}.${i}.url`, doc[field][i].url);
                        const filename = `${name.toLowerCase()}-oa-${doc._id}-${i}-${Date.now()}${getCleanExtension(doc[field][i].url)}`;
                        try {
                            doc[field][i].url = await downloadImage(doc[field][i].url, filename);
                            arrayUpdated = true;
                            count++;
                        } catch (err) { }
                    }
                }
                if (arrayUpdated) { doc.markModified(field); updated = true; }
            }
        }
        if (updated) await doc.save();
    }
    console.log(`Finished ${name}. Migrated ${count} images.`);
    return count;
};

const migrate = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        const results = [
            await migrateCollection(Product, ['image', 'images'], 'Product'),
            await migrateCollection(BestSeller, ['image', 'images'], 'BestSeller'),
            await migrateCollection(Loved, ['image', 'images'], 'Loved'),
            await migrateCollection(FeaturedProduct, ['image', 'images'], 'FeaturedProduct'),
            await migrateCollection(Category, ['image'], 'Category'),
            await migrateCollection(HeroCarousel, ['image'], 'HeroCarousel'),
            await migrateCollection(Seller, ['profileImage', 'images'], 'Seller'),
            await migrateCollection(ProductSubmission, ['productImages'], 'ProductSubmission')
        ];
        console.log(`\nMigration complete! Total archived and migrated: ${results.reduce((a, b) => a + b, 0)}`);
        process.exit(0);
    } catch (err) { process.exit(1); }
};

migrate();
