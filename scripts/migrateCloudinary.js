const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

// Models
const Product = require('../models/Product');
const Category = require('../models/cate');
const Seller = require('../models/Seller');
const HeroCarousel = require('../models/heroCarousel');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rikoenterprises25:2EKCeowE0NtO9d2q@cluster0.g68doth.mongodb.net/rikocraft?retryWrites=true&w=majority&appName=Cluster0";

const migrationDir = path.join(__dirname, '../public/uploads/migrated');

// Ensure migration directory exists
if (!fs.existsSync(migrationDir)) {
    fs.mkdirSync(migrationDir, { recursive: true });
}

const downloadImage = (url, filename) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(migrationDir, filename);
        const file = fs.createWriteStream(filePath);

        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
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
    return typeof url === 'string' && url.includes('cloudinary.com');
};

const migrate = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        let totalMigrated = 0;

        // 1. Migrate Products
        console.log('Migrating Products...');
        const products = await Product.find({});
        for (const product of products) {
            let updated = false;

            // Single image
            if (isCloudinary(product.image)) {
                const filename = `product-${product._id}-${Date.now()}${path.extname(product.image) || '.jpg'}`;
                try {
                    const localPath = await downloadImage(product.image, filename);
                    product.image = localPath;
                    updated = true;
                    totalMigrated++;
                } catch (err) {
                    console.error(`Failed to migrate product image ${product.image}:`, err.message);
                }
            }

            // Gallery images
            if (product.images && product.images.length > 0) {
                const newImages = [];
                for (let i = 0; i < product.images.length; i++) {
                    const imgUrl = product.images[i];
                    if (isCloudinary(imgUrl)) {
                        const filename = `product-gallery-${product._id}-${i}-${Date.now()}${path.extname(imgUrl) || '.jpg'}`;
                        try {
                            const localPath = await downloadImage(imgUrl, filename);
                            newImages.push(localPath);
                            totalMigrated++;
                            updated = true;
                        } catch (err) {
                            console.error(`Failed to migrate gallery image ${imgUrl}:`, err.message);
                            newImages.push(imgUrl);
                        }
                    } else {
                        newImages.push(imgUrl);
                    }
                }
                product.images = newImages;
            }

            if (updated) await product.save();
        }

        // 2. Migrate Categories
        console.log('Migrating Categories...');
        const categories = await Category.find({});
        for (const cat of categories) {
            if (isCloudinary(cat.image)) {
                const filename = `category-${cat._id}-${Date.now()}${path.extname(cat.image) || '.jpg'}`;
                try {
                    const localPath = await downloadImage(cat.image, filename);
                    cat.image = localPath;
                    await cat.save();
                    totalMigrated++;
                } catch (err) {
                    console.error(`Failed to migrate category image ${cat.image}:`, err.message);
                }
            }
        }

        // 3. Migrate Sellers
        console.log('Migrating Sellers...');
        const sellers = await Seller.find({});
        for (const seller of sellers) {
            let updated = false;

            // Profile image
            if (seller.profileImage && isCloudinary(seller.profileImage.url)) {
                const filename = `seller-profile-${seller._id}-${Date.now()}${path.extname(seller.profileImage.url) || '.jpg'}`;
                try {
                    const localPath = await downloadImage(seller.profileImage.url, filename);
                    seller.profileImage.url = localPath;
                    updated = true;
                    totalMigrated++;
                } catch (err) {
                    console.error(`Failed to migrate seller profile ${seller.profileImage.url}:`, err.message);
                }
            }

            // Seller gallery
            if (seller.images && seller.images.length > 0) {
                for (let i = 0; i < seller.images.length; i++) {
                    if (isCloudinary(seller.images[i].url)) {
                        const filename = `seller-gallery-${seller._id}-${i}-${Date.now()}${path.extname(seller.images[i].url) || '.jpg'}`;
                        try {
                            const localPath = await downloadImage(seller.images[i].url, filename);
                            seller.images[i].url = localPath;
                            updated = true;
                            totalMigrated++;
                        } catch (err) {
                            console.error(`Failed to migrate seller gallery ${seller.images[i].url}:`, err.message);
                        }
                    }
                }
            }

            if (updated) await seller.save();
        }

        // 4. Migrate Hero Carousel
        console.log('Migrating Hero Carousel...');
        const items = await HeroCarousel.find({});
        for (const item of items) {
            if (isCloudinary(item.image)) {
                const filename = `hero-${item._id}-${Date.now()}${path.extname(item.image) || '.jpg'}`;
                try {
                    const localPath = await downloadImage(item.image, filename);
                    item.image = localPath;
                    await item.save();
                    totalMigrated++;
                } catch (err) {
                    console.error(`Failed to migrate hero image ${item.image}:`, err.message);
                }
            }
        }

        console.log(`Migration complete! Total images migrated: ${totalMigrated}`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

migrate();
