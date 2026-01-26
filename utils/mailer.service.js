const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const logger = require('./logger');
const monitoringService = require('./monitoringService');

let resendClient = null;
let smtpTransporter = null;

// Environment validation
function validateEnv() {
  const required = [];
  const provider = process.env.MAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'api' : 'smtp');

  if (provider === 'api') {
    if (!process.env.RESEND_API_KEY) required.push('RESEND_API_KEY');
    if (!process.env.MAIL_FROM) required.push('MAIL_FROM');
  } else if (provider === 'smtp') {
    if (!process.env.SMTP_HOST) required.push('SMTP_HOST');
    if (!process.env.SMTP_PORT) required.push('SMTP_PORT');
    if (!process.env.SMTP_USER) required.push('SMTP_USER');
    if (!process.env.SMTP_PASS) required.push('SMTP_PASS');
  }

  if (required.length > 0) {
    throw new Error(`Missing required environment variables for mail provider '${provider}': ${required.join(', ')}`);
  }
}

// Initialize providers lazily
function getProvider() {
  if (!smtpTransporter && !resendClient) {
    validateEnv();
    initProviders();
  }
  const provider = process.env.MAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'api' : 'smtp');
  return provider === 'api' ? resendClient : smtpTransporter;
}

function initProviders() {
  const provider = process.env.MAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'api' : 'smtp');
  logger.info(`Initializing email provider: ${provider}`);

  if (provider === 'api') {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  } else if (provider === 'smtp') {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
    });
  }
}

// Retry with exponential backoff
async function sendWithRetry(sendFn, maxAttempts = 3) {
  let attempt = 0;
  let delay = 500; // ms
  let lastErr = null;

  while (attempt < maxAttempts) {
    try {
      attempt++;
      const result = await sendFn();
      monitoringService.recordExternalSuccess('mailer');
      logger.info('Email sent successfully', { attempt, provider: process.env.MAIL_PROVIDER || 'api' });
      return result;
    } catch (err) {
      lastErr = err;
      monitoringService.recordExternalError('mailer');
      logger.error(`Email send failed (attempt ${attempt}): ${err.message}`, { code: err.code, provider: process.env.MAIL_PROVIDER || 'api' });
      if (attempt >= maxAttempts) break;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw lastErr || new Error('Email send failed after retries');
}

// Send email via API (Resend)
async function sendViaAPI(to, subject, text, html = null) {
  const provider = getProvider();
  if (!resendClient) throw new Error('Resend client not initialized');
  const data = await resendClient.emails.send({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
  return data;
}

// Send email via SMTP
async function sendViaSMTP(to, subject, text, html = null) {
  const provider = getProvider();
  if (!smtpTransporter) throw new Error('SMTP transporter not initialized');
  const mailOptions = {
    from: `"DoroShop" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  };
  return await smtpTransporter.sendMail(mailOptions);
}

// General send function
async function sendEmail(to, subject, text, html = null) {
  const provider = process.env.MAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'api' : 'smtp');
  const sendFn = provider === 'api' ? () => sendViaAPI(to, subject, text, html) : () => sendViaSMTP(to, subject, text, html);
  return await sendWithRetry(sendFn);
}

// Specific functions
async function sendVerificationEmail(to, otp) {
  const subject = 'Your One-Time Password (OTP) for DoroShop Sign In';
  const text = `Your OTP is: ${otp}\n\nThis code will expire in 10 minutes.`;
  await sendEmail(to, subject, text);
}

async function sendSellerWelcomeEmail(to, shopName, userName) {
  const subject = '🎉 Welcome to DoroShop Sellers - Application Approved!';
  const text = `
🎉 Welcome to DoroShop Sellers!

Congratulations ${userName}!

Your seller application for "${shopName}" has been approved! You are now officially part of the DoroShop seller community.

What's Next?
✅ Login to your seller dashboard
✅ Upload your first products
✅ Set up your shop profile
✅ Start selling to thousands of customers

Important Information:
• Commission: 5% per successful sale
• Payment processing: 2-3 business days
• Customer support: Available 24/7
• Product guidelines: Must comply with our terms

Seller Dashboard: ${process.env.FRONTEND_URL || 'https://yourstore.com'}/vendor/dashboard

Need help? Contact our seller support team at seller-support@doroshop.com

Welcome aboard!
The DoroShop Team
  `;
  await sendEmail(to, subject, text);
}

// Verification (only for SMTP)
async function verifyMailer() {
  const provider = process.env.MAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'api' : 'smtp');
  if (provider === 'api') {
    // For API, just check if key is set
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
    logger.info('Mailer verification succeeded (API provider)');
    return true;
  } else {
    const transporter = getProvider();
    if (!smtpTransporter) throw new Error('SMTP transporter not initialized');
    await smtpTransporter.verify();
    logger.info('Mailer verification succeeded (SMTP provider)', { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT });
    return true;
  }
}

// Initialize on module load - lazy now
// try {
//   validateEnv();
//   initProviders();
// } catch (err) {
//   logger.error('Failed to initialize mailer service', { error: err.message });
//   throw err;
// }

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendSellerWelcomeEmail,
  verifyMailer,
};