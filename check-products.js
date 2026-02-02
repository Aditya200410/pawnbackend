const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://rikoenterprises25:2EKCeowE0NtO9d2q@cluster0.g68doth.mongodb.net/rikocraft?retryWrites=true&w=majority&appName=Cluster0';

async function checkProducts() {
    try {
        await mongoose.connect(MONGODB_URI);
        const Product = require('./models/Product');

        const total = await Product.countDocuments();
        const empty = await Product.countDocuments({ $or: [{ image: null }, { image: '' }] });
        const withCloudinary = await Product.countDocuments({ image: /cloudinary/ });
        const withUploads = await Product.countDocuments({ image: /uploads/ });

        console.log(`Total Products: ${total}`);
        console.log(`Empty Image: ${empty}`);
        console.log(`Cloudinary Image: ${withCloudinary}`);
        console.log(`Uploads Image: ${withUploads}`);

        // Find one with a broken image path if possible
        const samples = await Product.find({ image: /uploads/ }).limit(10);
        console.log('Sample images:', samples.map(p => p.image));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkProducts();
