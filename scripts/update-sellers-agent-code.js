const mongoose = require('mongoose');
const Seller = require('../models/Seller');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const updateSellers = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://karan:karan1998@cluster0.p83ca.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const sellers = await Seller.find({});
        console.log(`Found ${sellers.length} sellers`);

        for (const seller of sellers) {
            if (seller.sellerAgentCode === undefined) {
                // Explicitly set to undefined (or could be null or empty string if preferred)
                // But to ensure the field exists in the document, we usually need a value.
                // User said "leave blank". Empty string is a good 'blank'.
                // Or if the user meant 'leave it as undefined but ensure schema has it', we already did that.
                // But often users want to see the field in Compass even if empty.

                // Let's set it to null for existing users to indicate "no code generated".
                // Or empty string. Let's go with empty string as it's a string field.

                // Wait, if I just save it, Mongoose might not add the field if it is undefined.
                // I will set it to null explicitly.

                seller.sellerAgentCode = null;
                await seller.save();
                console.log(`Updated seller ${seller.email} with blank agent code`);
            }
        }

        console.log('Migration completed');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

updateSellers();
