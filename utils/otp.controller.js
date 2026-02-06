const User = require("../modules/users/users.model")
const redisClient = require("../config/redis.js")
const { sendVerificationEmail } = require("./verification")
const bcrypt = require("bcryptjs");
const userRedisOtpKey = (email) => `opt:${email}`;
const forgotPasswordOtpKey = (email) => `forgot-pwd-otp:${email}`;

exports.requestRegistrationOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // 5 minutes
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    const createOpt = {
      email,
      otp,
      otpExpiry
    }

    await redisClient.set(userRedisOtpKey(email), JSON.stringify(createOpt), {
      EX: 300,
    });
    await sendVerificationEmail(email, otp);
    res.status(200).json({ message: "Verification code sent to email." });
  } catch (err) {
    console.error("OTP request error:", err);
    res.status(500).json({ error: "Failed to send verification code" });
  }
};

// NEW: Request forgot password OTP
exports.requestForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email address" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const forgotPasswordOtp = {
      email,
      otp,
      otpExpiry,
      userId: user._id
    };

    // Store with different key than registration OTP
    await redisClient.set(forgotPasswordOtpKey(email), JSON.stringify(forgotPasswordOtp), {
      EX: 300, // 5 minutes
    });

    await sendVerificationEmail(email, otp, "Password Reset Verification");
    res.status(200).json({ message: "Password reset code sent to your email." });
  } catch (err) {
    console.error("Forgot password OTP request error:", err);
    res.status(500).json({ error: "Failed to send password reset code" });
  }
};

// NEW: Verify forgot password OTP
exports.verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const otpData = await redisClient.get(forgotPasswordOtpKey(email));
    if (!otpData) {
      return res.status(400).json({ message: "Invalid or expired verification code" });
    }

    const parsedData = JSON.parse(otpData);
    
    if (parsedData.otp !== otp) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    if (new Date() > new Date(parsedData.otpExpiry)) {
      await redisClient.del(forgotPasswordOtpKey(email));
      return res.status(400).json({ message: "Verification code has expired" });
    }

    // OTP is valid - generate reset token
    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const resetTokenExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes for password reset

    const resetData = {
      email,
      userId: parsedData.userId,
      resetToken,
      resetTokenExpiry
    };

    // Store reset token and remove OTP
    await redisClient.set(`reset-token:${email}`, JSON.stringify(resetData), {
      EX: 600, // 10 minutes
    });
    await redisClient.del(forgotPasswordOtpKey(email));

    res.status(200).json({ 
      message: "Verification successful",
      resetToken: resetToken 
    });
  } catch (err) {
    console.error("Forgot password OTP verification error:", err);
    res.status(500).json({ error: "Failed to verify code" });
  }
};

// NEW: Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    const resetData = await redisClient.get(`reset-token:${email}`);
    if (!resetData) {
      return res.status(400).json({ message: "Invalid or expired reset session" });
    }

    const parsedData = JSON.parse(resetData);
    
    if (parsedData.resetToken !== resetToken) {
      return res.status(400).json({ message: "Invalid reset token" });
    }

    if (new Date() > new Date(parsedData.resetTokenExpiry)) {
      await redisClient.del(`reset-token:${email}`);
      return res.status(400).json({ message: "Reset session has expired" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await User.findByIdAndUpdate(parsedData.userId, {
      password: hashedPassword
    });

    // Clean up reset token
    await redisClient.del(`reset-token:${email}`);

    res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
};
