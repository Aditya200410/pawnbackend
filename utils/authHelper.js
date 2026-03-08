const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Automatically finds or creates a user based on email or phone
 * and returns a signed JWT token and user data.
 */
const autoLoginUser = async ({ email, phone, customerName, address, city, state, zipCode, country }) => {
    try {
        let user;

        // First try by email
        if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
        }

        // Then try by phone if not found
        if (!user && phone) {
            // Normalize phone number if needed (similar to auth.js)
            let cleanPhone = String(phone).replace(/\D/g, '');
            if (cleanPhone.length === 10) {
                cleanPhone = '91' + cleanPhone;
            }
            user = await User.findOne({ phone: cleanPhone });
        }

        // If user still not found, create one
        if (!user) {
            const newUser = new User({
                name: customerName || 'Valued Customer',
                email: email ? email.toLowerCase() : undefined,
                phone: phone ? (phone.replace(/\D/g, '').length === 10 ? '91' + phone.replace(/\D/g, '') : phone.replace(/\D/g, '')) : undefined,
                password: crypto.randomBytes(16).toString('hex'), // Random password for auto-created accounts
                address: address || '',
                city: city || '',
                state: state || '',
                zipCode: zipCode || '',
                country: country || 'India',
            });
            user = await newUser.save();
            console.log(`Auto-created account for: ${email || phone}`);
        } else {
            // Update missing fields if provided
            let needsUpdate = false;

            if (!user.email && email) {
                user.email = String(email).toLowerCase();
                needsUpdate = true;
            }

            if (!user.phone && phone) {
                let cleanPhone = String(phone).replace(/\D/g, '');
                if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
                user.phone = cleanPhone;
                needsUpdate = true;
            }

            if ((!user.name || user.name === 'Valued Customer' || (user.name && user.name.startsWith('User '))) && customerName) {
                user.name = String(customerName);
                needsUpdate = true;
            }

            // Always update address if provided during order to keep it recent
            if (address && address.trim() !== '') {
                user.address = String(address);
                needsUpdate = true;
            }
            if (city && city.trim() !== '') {
                user.city = String(city);
                needsUpdate = true;
            }
            if (state && state.trim() !== '') {
                user.state = String(state);
                needsUpdate = true;
            }
            if (zipCode && zipCode.trim() !== '') {
                user.zipCode = String(zipCode);
                needsUpdate = true;
            }
            if (country && country.trim() !== '') {
                user.country = String(country);
                needsUpdate = true;
            }

            if (needsUpdate) {
                await user.save();
                console.log(`Updated profile data for: ${user.email || user.phone}`);
            }
        }

        // Generate token
        const token = jwt.sign(
            { id: user._id, email: user.email, phone: user.phone },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        return {
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                address: user.address,
                city: user.city,
                state: user.state,
                zipCode: user.zipCode,
                country: user.country
            }
        };
    } catch (error) {
        console.error('Error in autoLoginUser helper:', error);
        return null;
    }
};

module.exports = {
    autoLoginUser
};
