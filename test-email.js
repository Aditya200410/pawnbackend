const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('🧪 Testing Email Configuration...');
console.log('📧 Email Configuration:', {
  EMAIL_USER: process.env.EMAIL_USER ? '✅ Set' : '❌ Missing',
  EMAIL_PASS: process.env.EMAIL_PASS ? '✅ Set' : '❌ Missing'
});

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('❌ Email configuration missing!');
  console.log('Please set EMAIL_USER and EMAIL_PASS in your .env file');
  process.exit(1);
}

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Test email
const testEmail = async () => {
  try {
    console.log('📤 Sending test email...');
    
    const result = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Send to yourself for testing
      subject: 'Test Email - OTP System',
      text: 'This is a test email to verify nodemailer configuration.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">Test Email</h2>
          <p style="color: #666; font-size: 16px;">This is a test email to verify that nodemailer is working correctly.</p>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0;">✅ Email Test Successful</h1>
          </div>
          <p style="color: #666; font-size: 14px;">If you received this email, your nodemailer configuration is working correctly.</p>
        </div>
      `
    });
    
    console.log('✅ Test email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📧 Response:', result.response);
    
  } catch (error) {
    console.error('❌ Error sending test email:', error);
    console.log('🔧 Common issues:');
    console.log('1. Make sure EMAIL_USER and EMAIL_PASS are set correctly');
    console.log('2. For Gmail, use an App Password instead of your regular password');
    console.log('3. Enable "Less secure app access" or use 2FA with App Password');
  }
};

testEmail(); 