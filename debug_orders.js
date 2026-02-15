const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rikoenterprises25:2EKCeowE0NtO9d2q@cluster0.g68doth.mongodb.net/rikocraft?retryWrites=true&w=majority&appName=Cluster0";

async function check() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        const orders = await Order.find({ customerName: 'Valued Customer' })
            .sort({ createdAt: -1 })
            .limit(5);

        console.log("RECENT VALUED CUSTOMER ORDERS:");
        console.log(JSON.stringify(orders, null, 2));

        const lastOrder = await Order.findOne().sort({ createdAt: -1 });
        console.log("VERY LAST ORDER IN DB:");
        console.log(JSON.stringify(lastOrder, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

check();
