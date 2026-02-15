const axios = require('axios');
const crypto = require('crypto');
const Booking = require('../models/Booking');
require('dotenv').config();

// Re-use logic for getting PhonePe token from phonepeController if possible, 
// but for simplicity I will implement it here or import it if I can.
// Since phonepeController.js doesn't export getPhonePeToken, I will copy it or make it shared.
// For now, I'll copy it to ensure this file is self-contained.

let oauthToken = null;
let tokenExpiry = null;

async function getPhonePeToken() {
    try {
        if (oauthToken && tokenExpiry && new Date() < tokenExpiry) {
            return oauthToken;
        }

        const clientId = process.env.PHONEPE_CLIENT_ID;
        const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
        const clientVersion = '1';
        const env = process.env.PHONEPE_ENV || 'sandbox';

        let oauthUrl;
        if (env === 'production')
            oauthUrl = 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';
        else
            oauthUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';

        const response = await axios.post(oauthUrl,
            new URLSearchParams({
                client_id: clientId,
                client_version: clientVersion,
                client_secret: clientSecret,
                grant_type: 'client_credentials'
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 30000
            }
        );

        if (response.data && response.data.access_token) {
            oauthToken = response.data.access_token;
            if (response.data.expires_at) {
                tokenExpiry = new Date(response.data.expires_at * 1000);
            } else {
                tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
            }
            return oauthToken;
        } else {
            throw new Error('Invalid OAuth response from PhonePe');
        }
    } catch (error) {
        console.error('PhonePe OAuth token error:', error.response?.data || error.message);
        throw new Error('Failed to get PhonePe OAuth token');
    }
}

exports.createBooking = async (req, res) => {
    try {
        const {
            waterpark,
            waternumber,
            waterparkName,
            name,
            email,
            phone,
            date,
            adults,
            children,
            total,
            advanceAmount,
            paymentType,
            paymentMethod,
            terms
        } = req.body;

        const customBookingId = `BK${Date.now()}${Math.random().toString(36).substr(2, 4)}`.toUpperCase();
        const merchantOrderId = `MT${Date.now()}${Math.random().toString(36).substr(2, 4)}`;

        const newBooking = new Booking({
            waterpark,
            waternumber,
            waterparkName,
            name,
            email,
            phone,
            date,
            adults,
            children,
            total,
            advanceAmount,
            paymentType,
            paymentMethod,
            terms,
            customBookingId,
            merchantOrderId
        });

        await newBooking.save();

        if (paymentMethod === 'cash') {
            return res.json({
                success: true,
                booking: newBooking
            });
        }

        // PhonePe Integration
        if (paymentMethod === 'phonepe') {
            const env = process.env.PHONEPE_ENV || 'sandbox';
            const frontendUrl = process.env.FRONTEND_URL || 'https://rikocraft.com';
            const backendUrl = process.env.BACKEND_URL || 'https://api.rikocraft.com/api';

            const accessToken = await getPhonePeToken();
            const baseUrl = env === 'production'
                ? 'https://api.phonepe.com/apis/pg'
                : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

            const apiEndpoint = '/checkout/v2/pay';

            const payload = {
                merchantOrderId: merchantOrderId,
                amount: Math.round(advanceAmount * 100), // convert to paise
                expireAfter: 1200,
                metaInfo: {
                    udf1: name,
                    udf2: email,
                    udf3: phone,
                    udf4: customBookingId
                },
                paymentFlow: {
                    type: 'PG_CHECKOUT',
                    message: `Booking for ${waterparkName} - ${customBookingId}`,
                    merchantUrls: {
                        redirectUrl: `${frontendUrl}/ticket?bookingId=${customBookingId}`,
                        // In checkout/v2, callbackUrl might be specified here or at top level depending on version.
                        // Based on phonepeController, let's add it to merchantUrls or top level.
                        callbackUrl: `${backendUrl}/api/bookings/phonepe/callback`
                    }
                }
            };

            console.log('Initiating PhonePe payment for booking:', customBookingId);

            const response = await axios.post(
                baseUrl + apiEndpoint,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `O-Bearer ${accessToken}`
                    },
                    timeout: 30000
                }
            );

            if (response.data && response.data.orderId) {
                newBooking.transactionId = response.data.orderId;
                await newBooking.save();

                return res.json({
                    success: true,
                    redirectUrl: response.data.redirectUrl,
                    orderId: response.data.orderId,
                    merchantOrderId: merchantOrderId,
                    booking: newBooking
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to initiate PhonePe payment'
                });
            }
        }

        res.json({ success: true, booking: newBooking });
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.phonePeBookingCallback = async (req, res) => {
    try {
        const { orderId, state, code, merchantOrderId } = req.body;
        console.log('PhonePe Booking Webhook received:', req.body);

        if (!orderId) {
            return res.status(400).send('Invalid callback data: orderId is required');
        }

        try {
            const accessToken = await getPhonePeToken();
            const env = process.env.PHONEPE_ENV || 'sandbox';
            const baseUrl = env === 'production'
                ? 'https://api.phonepe.com/apis/pg'
                : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

            // Re-verify status with PhonePe API
            const apiEndpoint = `/checkout/v2/order/${orderId}/status`;
            const response = await axios.get(
                baseUrl + apiEndpoint,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `O-Bearer ${accessToken}`
                    },
                    timeout: 30000
                }
            );

            console.log('PhonePe Booking Verification response:', response.data);

            const booking = await Booking.findOne({
                $or: [{ transactionId: orderId }, { merchantOrderId: merchantOrderId || response.data.metaInfo?.merchantOrderId }]
            });

            if (!booking) {
                console.warn('Booking not found for transactionId:', orderId);
                return res.status(404).send('Booking not found');
            }

            if (response.data && response.data.state === 'COMPLETED') {
                booking.paymentStatus = 'completed';
                await booking.save();
                console.log(`Booking ${booking.customBookingId} marked as COMPLETED`);
            } else if (response.data && response.data.state === 'FAILED') {
                booking.paymentStatus = 'failed';
                await booking.save();
                console.log(`Booking ${booking.customBookingId} marked as FAILED`);
            }

            return res.status(200).send('OK');
        } catch (verificationError) {
            console.error('PhonePe verification error:', verificationError.response?.data || verificationError.message);
            return res.status(500).send('Verification failed');
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.getBookingStatus = async (req, res) => {
    try {
        const { customBookingId } = req.params;
        const booking = await Booking.findOne({ customBookingId });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // If still pending, we might want to check PhonePe status one last time
        if (booking.paymentStatus === 'pending' && booking.transactionId) {
            // (Optional) Implement status check logic here like in getPhonePeStatus
        }

        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
