const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    waterpark: { type: String, required: true },
    waternumber: { type: String },
    waterparkName: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    date: { type: String, required: true },
    adults: { type: Number, default: 0 },
    children: { type: Number, default: 0 },
    total: { type: Number, required: true },
    advanceAmount: { type: Number, required: true },
    paymentType: { type: String },
    paymentMethod: { type: String, required: true },
    terms: { type: Boolean, default: false },
    customBookingId: { type: String, unique: true, required: true },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    transactionId: { type: String }, // PhonePe transaction ID (orderId)
    merchantOrderId: { type: String }, // Our MT... ID
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
