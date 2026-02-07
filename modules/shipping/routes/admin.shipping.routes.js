const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/admin.shipping.controller');
const { protect, restrictTo } = require('../../../auth/auth.controller');
const rateLimiter = require('../../../utils/rateLimiter');

// All routes require admin
router.use(protect);
router.use(restrictTo('admin'));

const adminLimiter = rateLimiter({ windowSec: 60, maxRequests: 60, keyPrefix: 'rl:admin:shipping' });
const seedLimiter  = rateLimiter({ windowSec: 300, maxRequests: 3,  keyPrefix: 'rl:admin:seed' });

// Rates CRUD
router.get('/rates',          adminLimiter, ctrl.listRates);
router.post('/rates',         adminLimiter, ctrl.createRate);
router.put('/rates/:id',      adminLimiter, ctrl.updateRate);
router.delete('/rates/:id',   adminLimiter, ctrl.deleteRate);
router.patch('/rates/:id/bracket', adminLimiter, ctrl.updateBracket);

// Addresses (admin view)
router.get('/addresses', adminLimiter, ctrl.listAddresses);

// Seed Oriental Mindoro data
router.post('/seed', seedLimiter, ctrl.seedOrientalMindoro);

module.exports = router;
