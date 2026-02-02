const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://rikoenterprises25:2EKCeowE0NtO9d2q@cluster0.g68doth.mongodb.net/rikocraft?retryWrites=true&w=majority&appName=Cluster0';

async function findCloudinary() {
    try {
        await mongoose.connect(MONGODB_URI);
        const collections = await mongoose.connection.db.listCollections().toArray();
        for (const coll of collections) {
            const cursor = mongoose.connection.db.collection(coll.name).find({
                $or: [
                    { image: { $regex: /cloudinary/i } },
                    { images: { $regex: /cloudinary/i } },
                    { 'profileImage.url': { $regex: /cloudinary/i } },
                    { url: { $regex: /cloudinary/i } }
                ]
            });
            const count = await cursor.count();
            if (count > 0) {
                console.log(`Collection: ${coll.name}, Count: ${count}`);
                const sample = await mongoose.connection.db.collection(coll.name).findOne({
                    $or: [
                        { image: { $regex: /cloudinary/i } },
                        { images: { $regex: /cloudinary/i } },
                        { 'profileImage.url': { $regex: /cloudinary/i } },
                        { url: { $regex: /cloudinary/i } }
                    ]
                });
                console.log('Sample URL:', sample.image || sample.url || (sample.profileImage && sample.profileImage.url));
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

findCloudinary();
