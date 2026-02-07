const jntMindoroService = require('../services/jntMindoro.service');
const { ShippingAddress } = require('../models');
const ShippingQuote = require('../models/shippingQuote.model');
const sanitizeMongoInput = require('../../../utils/sanitizeMongoInput');
const { ValidationError, asyncHandler } = require('../../../utils/errorHandler');
const { validateId } = require('../../../utils/validation');

// ─── POST /shipping/jnt/quote — Unified J&T shipping quote ──────────────────
exports.quoteShipping = asyncHandler(async (req, res) => {
	const body = sanitizeMongoInput(req.body);
	const { destination, items } = body;

	// --- input validation -------------------------------------------------
	if (!destination || !destination.provinceCode || !destination.cityCode) {
		throw new ValidationError('destination.provinceCode and destination.cityCode are required');
	}

	if (!Array.isArray(items) || items.length === 0) {
		throw new ValidationError('items[] is required and must be non-empty');
	}

	for (const item of items) {
		if (!item.productId) throw new ValidationError('Each item must have productId');
		validateId(String(item.productId), 'productId');
		if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
			throw new ValidationError('item.quantity must be an integer between 1 and 100');
		}
	}

	// --- delegate to unified service (bag ≤8kg / rate table 9–50kg) ------
	const quote = await jntMindoroService.calculateJntMindoroQuote({
		destination: {
			provinceCode: String(destination.provinceCode),
			cityCode:     String(destination.cityCode),
		},
		items: items.map((i) => ({
			productId: String(i.productId),
			quantity:  i.quantity,
		})),
	});

	// --- persist quote with TTL for order-creation validation ---
	let quoteId = null;
	try {
		const saved = await ShippingQuote.create({
			userId:    req.user.id,
			method:    'JNT_MINDORO',
			request:   { destination: quote.destination, items },
			result:    quote,
			fee:       quote.totals.shippingFeeTotal,
			expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min TTL
		});
		quoteId = saved._id;
	} catch (saveErr) {
		console.error('[ShippingQuote] Failed to persist quote:', saveErr.message);
	}

	res.json({
		success: true,
		data: {
			quoteId,
			...quote,
		},
	});
});

// ─── GET /shipping/addresses?province=ORIENTAL-MINDORO ───────────────────────
exports.getAddresses = asyncHandler(async (req, res) => {
	const province = sanitizeMongoInput(
		req.query.province || 'ORIENTAL-MINDORO'
	);

	const addresses = await ShippingAddress.listByProvince(String(province));

	// If DB is empty, return hardcoded Oriental Mindoro list
	if (addresses.length === 0 && String(province).toUpperCase() === 'ORIENTAL-MINDORO') {
		const fallback = [...jntMindoroService.ORIENTAL_MINDORO_CITIES].sort().map((c) => ({
			provinceCode: 'ORIENTAL-MINDORO',
			cityCode: c,
			displayName: `${c.charAt(0) + c.slice(1).toLowerCase()}, Oriental Mindoro`,
			isActive: true
		}));
		return res.json({ success: true, data: { province: 'ORIENTAL-MINDORO', addresses: fallback } });
	}

	res.json({ success: true, data: { province: String(province).toUpperCase(), addresses } });
});

// ─── POST /shipping/addresses/validate ───────────────────────────────────────
exports.validateAddress = asyncHandler(async (req, res) => {
	const body = sanitizeMongoInput(req.body);

	if (!body.provinceCode || !body.cityCode) {
		throw new ValidationError('provinceCode and cityCode are required');
	}

	const normalised = await jntMindoroService.validateOrientalMindoroAddress(
		String(body.provinceCode),
		String(body.cityCode)
	);

	res.json({ success: true, data: { isValid: true, address: normalised } });
});
