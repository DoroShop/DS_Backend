const { sendVerificationEmail, sendSellerWelcomeEmail, verifyMailer } = require('./mailer.service');

// Legacy exports for backward compatibility
exports.verifyMailer = verifyMailer;
exports.sendVerificationEmail = sendVerificationEmail;
exports.sendSellerWelcomeEmail = sendSellerWelcomeEmail;
