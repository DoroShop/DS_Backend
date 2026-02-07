const express = require('express');
const router = express.Router();
const shippingController = require('../controllers/shipping.controller');
const { protect } = require('../../../auth/auth.controller');
const rateLimiter = require('../../../utils/rateLimiter');

const quoteLimiter   = rateLimiter({ windowSec: 60, maxRequests: 30, keyPrefix: 'rl:shipping:quote' });
const addressLimiter = rateLimiter({ windowSec: 60, maxRequests: 100, keyPrefix: 'rl:shipping:addr' });

// Unified J&T shipping quote (bag ≤8kg / rate table 9–50kg) — authenticated
router.post('/jnt/quote', protect, quoteLimiter, shippingController.quoteShipping);

// Address lookup — public
router.get('/addresses', addressLimiter, shippingController.getAddresses);

// Address validation — public
router.post('/addresses/validate', addressLimiter, shippingController.validateAddress);

module.exports = router;
