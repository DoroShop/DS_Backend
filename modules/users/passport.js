// Ensure dotenv is loaded first
require("dotenv").config({ path: require('path').resolve(__dirname, '../../.env') });

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const User = require("./users.model");
const { findOrCreateSocialUser } = require("./users.service");

// Production-ready configuration
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// Production-ready callback URL configuration
const getCallbackURL = (provider) => {
  if (provider === 'google') {
    return process.env.GOOGLE_CALLBACK_URL || 
           (isDevelopment ? "http://localhost:3001/v1/user/google/callback" : "https://doroshop.ph/v1/user/google/callback");
  }
  if (provider === 'facebook') {
    return process.env.FACEBOOK_CALLBACK_URL || 
           (isDevelopment ? "http://localhost:3001/v1/user/facebook/callback" : "https://doroshop.ph/v1/user/facebook/callback");
  }
};

console.log(`🔧 OAuth Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔗 Google Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'PRESENT' : 'MISSING'}`);
console.log(`🔗 Google Client Secret: ${process.env.GOOGLE_CLIENT_SECRET ? 'PRESENT' : 'MISSING'}`);
console.log(`🔗 Facebook Client ID: ${process.env.FACEBOOK_CLIENT_ID ? 'PRESENT' : 'MISSING'}`);
console.log(`🔗 Google Callback: ${getCallbackURL('google')}`);
console.log(`🔗 Facebook Callback: ${getCallbackURL('facebook')}`);

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google Strategy - production-ready configuration
console.log('🔍 Checking Google OAuth credentials...');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  try {
    console.log("✅ Initializing Google OAuth Strategy");
    
    const googleStrategy = new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: getCallbackURL('google'),
        scope: ['profile', 'email'],
        passReqToCallback: false,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log(`🔍 Google OAuth callback for user: ${profile.emails?.[0]?.value}`);
          const user = await findOrCreateSocialUser(profile, "google");
          if (!user) {
            console.error("❌ Failed to create or find Google user");
            return done(null, false, { message: "Failed to create or find user" });
          }
          console.log(`✅ Google OAuth success for user: ${user._id}`);
          return done(null, user);
        } catch (err) {
          console.error("❌ Google OAuth strategy error:", err);
          return done(err, null);
        }
      }
    );
    
    passport.use('google', googleStrategy);
    console.log("✅ Google OAuth Strategy registered successfully");
    
  } catch (error) {
    console.error("❌ Error registering Google OAuth Strategy:", error);
  }
} else {
  console.warn("⚠️  Google OAuth not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  console.log("Available env vars:", Object.keys(process.env).filter(key => key.includes('GOOGLE')));
  if (isProduction) {
    console.error("❌ CRITICAL: Google OAuth credentials missing in production!");
  }
}

// Facebook Strategy - production-ready configuration
if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
  try {
    console.log("✅ Initializing Facebook OAuth Strategy");
    
    const facebookStrategy = new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_CLIENT_ID,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
        callbackURL: getCallbackURL('facebook'),
        profileFields: ["id", "emails", "displayName"],
        enableProof: isProduction,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log(`🔍 Facebook OAuth callback for user: ${profile.emails?.[0]?.value || profile.id}`);
          const user = await findOrCreateSocialUser(profile, "facebook");
          if (!user) {
            console.error("❌ Failed to create or find Facebook user");
            return done(null, false, { message: "Failed to create or find user" });
          }
          console.log(`✅ Facebook OAuth success for user: ${user._id}`);
          return done(null, user);
        } catch (err) {
          console.error("❌ Facebook OAuth strategy error:", err);
          return done(err, null);
        }
      }
    );
    
    passport.use('facebook', facebookStrategy);
    console.log("✅ Facebook OAuth Strategy registered successfully");
    
  } catch (error) {
    console.error("❌ Error registering Facebook OAuth Strategy:", error);
  }
} else {
  console.warn("⚠️  Facebook OAuth not configured - missing FACEBOOK_CLIENT_ID or FACEBOOK_CLIENT_SECRET");
  if (isProduction) {
    console.error("❌ CRITICAL: Facebook OAuth credentials missing in production!");
  }
}

// Debug: List all registered strategies
setTimeout(() => {
  const strategies = Object.keys(passport._strategies || {});
  console.log("🔍 Registered Passport strategies:", strategies);
  if (!strategies.includes('google')) {
    console.error("❌ Google strategy NOT found in registered strategies!");
  }
  if (!strategies.includes('facebook')) {
    console.error("❌ Facebook strategy NOT found in registered strategies!");
  }
}, 100);

module.exports = passport;
