const Order = require('../models/Order');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const commissionController = require('../controllers/commissionController');
const fs = require('fs').promises;
const path = require('path');
const ordersJsonPath = path.join(__dirname, '../data/orders.json');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Setup nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper to append order to orders.json
async function appendOrderToJson(order) {
  try {
    let orders = [];
    try {
      const data = await fs.readFile(ordersJsonPath, 'utf8');
      orders = JSON.parse(data);
      if (!Array.isArray(orders)) orders = [];
    } catch (err) {
      orders = [];
    }
    orders.push(order.toObject ? order.toObject({ virtuals: true }) : order);
    await fs.writeFile(ordersJsonPath, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Failed to append order to orders.json:', err);
  }
}

// Helper to send order confirmation email
async function sendOrderConfirmationEmail(order) {
  const { email, customerName, items, totalAmount, address } = order;
  const subject = 'Your Rikocraft Order Confirmation';

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price}</td>
    </tr>
  `).join('');

  const addressHtml = `
    <div style="margin-bottom: 10px;">
      <strong>Shipping Address:</strong><br/>
      ${address.street || ''}<br/>
      ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}<br/>
      ${address.country || ''}
    </div>
  `;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">Rikocraft</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            Thank you for your order! Your order has been placed successfully. Here are your order details:
          </p>
        </div>
        ${addressHtml}
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <strong>Total: ₹${totalAmount}</strong>
        </div>
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            We will notify you when your order is shipped. Thank you for shopping with Rikocraft!
          </p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.6;">
            <strong>Warm regards,</strong><br>
            Team Rikocraft
          </p>
          <div style="margin-top: 15px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">🌐 www.rikocraft.com</p>
            <p style="margin: 5px 0;">📩 Email: Care@Rikocraft.com</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const textBody = `Dear ${customerName},\n\nThank you for your order! Your order has been placed successfully.\n\nOrder Summary:\n${items.map(item => `- ${item.name} x${item.quantity} (₹${item.price})`).join('\n')}\nTotal: ₹${totalAmount}\n\nShipping Address:\n${address.street || ''}\n${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}\n${address.country || ''}\n\nWe will notify you when your order is shipped.\n\nWarm regards,\nTeam Rikocraft\nwww.rikocraft.com\nCare@Rikocraft.com`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`Order confirmation email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending order confirmation email:', mailErr);
  }
}

// Main helper to finalize order (stocks, comms, email, json)
async function finalizeOrder(order) {
  try {
    console.log(`Finalizing order ${order._id}...`);

    // 1. Handle Plan Purchase / Agent Registration
    if (order.orderType === 'plan_purchase') {
      console.log('Finalizing Plan Purchase Order:', order._id);
      try {
        const Seller = require('../models/Seller');
        const PendingRegistration = require('../models/PendingRegistration');

        // Check if there's a pending registration for this transaction
        const pendingReg = await PendingRegistration.findOne({
          $or: [
            { merchantTransactionId: order.transactionId },
            { merchantTransactionId: order.merchantTransactionId },
            { email: order.email } // Fallback
          ]
        });

        if (pendingReg) {
          console.log(`Creating seller from pending registration: ${pendingReg.businessName}`);

          // Create new seller
          const newSeller = new Seller({
            businessName: pendingReg.businessName,
            email: pendingReg.email,
            password: pendingReg.password, // This will be hashed by the Seller model pre-save hook
            phone: pendingReg.phone,
            address: pendingReg.address,
            businessType: pendingReg.businessType,
            images: pendingReg.images,
            sellerToken: pendingReg.sellerToken,
            sellerAgentCode: pendingReg.sellerAgentCode,
            websiteLink: pendingReg.websiteLink,
            qrCode: pendingReg.qrCode,
            agentPlan: pendingReg.agentPlan,
            approved: true, // Auto-approve after payment
            isVerified: true
          });

          await newSeller.save();
          console.log(`Seller ${newSeller.businessName} created successfully after payment.`);

          // Delete pending registration
          await PendingRegistration.findByIdAndDelete(pendingReg._id);
        } else {
          // Fallback: update existing seller if this was a plan upgrade (not registration)
          const seller = await Seller.findOne({ email: order.email });
          if (seller) {
            let limit = 0;
            let planType = 'none';
            if (order.totalAmount >= 25000) { limit = 999999; planType = 'unlimited'; }
            else if (order.totalAmount >= 20000) { limit = 100; planType = 'pro'; }
            else if (order.totalAmount >= 15000) { limit = 50; planType = 'starter'; }

            seller.agentPlan = {
              planType: planType,
              agentLimit: limit,
              amountPaid: order.totalAmount,
              purchaseDate: new Date()
            };
            await seller.save();
            console.log(`Updated existing Seller ${seller.businessName} plan to ${planType}`);
          } else {
            console.error(`Neither pending registration nor seller found for plan purchase: ${order.email}`);
          }
        }

        await appendOrderToJson(order);
        await sendOrderConfirmationEmail(order);
        return true;
      } catch (err) {
        console.error('Error finalizing plan purchase:', err);
        return false;
      }
    }

    // 2. Calculate commission
    if (order.sellerToken || order.agentCode) {
      try {
        const Agent = require('../models/Agent');
        let seller = null;
        let agent = null;

        if (order.sellerToken) {
          seller = await Seller.findOne({ sellerToken: order.sellerToken });
        }

        if (order.agentCode) {
          // Find agent by their unique personalAgentCode (case-insensitive)
          agent = await Agent.findOne({
            personalAgentCode: { $regex: new RegExp(`^${order.agentCode}$`, 'i') }
          });
          // If agent is found but seller isn't set, link to agent's seller
          if (agent && !seller) {
            seller = await Seller.findById(agent.linkedSeller);
          }
        }

        if (seller) {
          await commissionController.createCommissionEntry(
            order._id,
            seller._id,
            order.totalAmount,
            null, // Use default rates from settings
            agent ? agent._id : null
          );
          console.log(`Commission entry created for ${seller.businessName}${agent ? ' and agent ' + agent.name : ''}`);
        }
      } catch (err) {
        console.error('Failed to create commission entry:', err);
      }
    }

    // 2. Decrement stock
    for (const item of order.items) {
      if (item.productId) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.stock = Math.max(0, (product.stock || 0) - (item.quantity || 1));
          if (product.stock === 0) product.inStock = false;
          await product.save();
        }
      }
    }

    // 3. Save to orders.json
    await appendOrderToJson(order);

    // 4. Send email
    await sendOrderConfirmationEmail(order);

    console.log(`Order ${order._id} finalized successfully.`);
    return true;
  } catch (error) {
    console.error('Error finalizing order:', error);
    return false;
  }
}

module.exports = {
  finalizeOrder,
  sendOrderConfirmationEmail,
  appendOrderToJson
};
