/**
 * J&T Fixed Shipping Rates — core calculation service.
 *
 * All business logic lives here so that both the quote endpoint and order
 * creation can call the same `calculateShippingQuote()` entrypoint.
 *
 * Pricing is weight-based only (no volumetric). The chargeable weight is
 * the total actual weight rounded up in WEIGHT_ROUNDING_STEP increments.
 *
 * Environment variables (with defaults):
 *   WEIGHT_ROUNDING_STEP = 0.5
 */

const { ShippingRate, ShippingAddress } = require('../models');
const Product = require('../../products/products.model');
const logger = require('../../../utils/logger');
const {
	ValidationError,
	NotFoundError
} = require('../../../utils/errorHandler');

// ─── Config ──────────────────────────────────────────────────────────────────
const WEIGHT_ROUNDING_STEP = parseFloat(process.env.WEIGHT_ROUNDING_STEP) || 0.5;

const BAG_SPECS = [
	{ key: 'SMALL_LE_3KG',  maxKg: 3 },
	{ key: 'MEDIUM_LE_5KG', maxKg: 5 },
	{ key: 'BIG_LE_8KG',    maxKg: 8 }
];

const ORIENTAL_MINDORO_CITIES = new Set([
	'BACO', 'BANSUD', 'BONGABONG', 'BULALACAO', 'CALAPAN',
	'GLORIA', 'MANSALAY', 'NAUJAN', 'PINAMALAYAN', 'POLA',
	'PUERTO GALERA', 'ROXAS', 'SAN TEODORO', 'SOCORRO', 'VICTORIA'
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Round weight UP to nearest step (e.g. 0.5 kg). */
function roundWeightUp(kg, step = WEIGHT_ROUNDING_STEP) {
	if (kg <= 0) return step; // minimum billable weight
	return Math.ceil(kg / step) * step;
}

/** Pick cheapest bag that fits the rounded chargeable weight. */
function selectBag(roundedKg) {
	for (const bag of BAG_SPECS) {
		if (roundedKg <= bag.maxKg) return bag.key;
	}
	return null; // weight exceeds max bag
}

/**
 * Determine shipping zone from origin + destination provinces.
 * Currently only supports Oriental Mindoro ↔ Oriental Mindoro = OM_LOCAL.
 * Expand here when adding new provinces.
 */
function resolveZone(originProvince, destProvince) {
	const o = (originProvince || '').toUpperCase().trim();
	const d = (destProvince   || '').toUpperCase().trim();
	if (o === 'ORIENTAL-MINDORO' && d === 'ORIENTAL-MINDORO') return 'OM_LOCAL';
	return null; // unsupported zone for now
}

// ─── Address validation ──────────────────────────────────────────────────────

async function validateAddress(provinceCode, cityCode) {
	const p = (provinceCode || '').toUpperCase().trim();
	const c = (cityCode     || '').toUpperCase().trim();

	if (!p || !c) {
		throw new ValidationError('provinceCode and cityCode are required');
	}

	// First check the database, fall back to hardcoded set
	const dbValid = await ShippingAddress.isValid(p, c);
	if (dbValid) return { provinceCode: p, cityCode: c };

	// Hardcoded fallback — useful before seeding
	if (p === 'ORIENTAL-MINDORO' && ORIENTAL_MINDORO_CITIES.has(c)) {
		return { provinceCode: p, cityCode: c };
	}

	const err = new ValidationError(
		`Shipping not available to ${c}, ${p}`
	);
	err.code = 'INVALID_ADDRESS';
	throw err;
}

// ─── Shipping profile validation ─────────────────────────────────────────────

/**
 * Given an array of product docs, return the products that are missing the
 * minimum required shipping field: weightKg.
 *
 * Dimensions are not used — pricing is purely weight-based.
 */
function findMissingShippingProfiles(products) {
	return products.filter((p) => p.weightKg == null);
}

// ─── Core calculation ────────────────────────────────────────────────────────

/**
 * Calculate a complete shipping quote for a set of cart items.
 *
 * @param {Object}   opts
 * @param {Object}   opts.destination          - { provinceCode, cityCode }
 * @param {Array}    opts.items                - [{ productId, quantity }]
 * @param {string}  [opts.serviceType='EZ']
 * @param {Object}  [opts.toggles]             - { itemAdditionalFee: false, itemSize: false }
 * @param {string}  [opts.originOverride]       - If provided, skip seller address lookup
 *
 * @returns {Object} Full quote with shipments[] and summary
 */
async function calculateShippingQuote({
	destination,
	items,
	serviceType = 'EZ',
	toggles = { itemAdditionalFee: false, itemSize: false }
}) {
	// 1) Validate destination
	const dest = await validateAddress(destination.provinceCode, destination.cityCode);

	// 2) Load products from DB (never trust client weight/dimensions)
	const productIds = items.map((i) => i.productId);
	const products = await Product.find({ _id: { $in: productIds } })
		.select('_id name vendorId weightKg shippingDiscountType shippingDiscountValue municipality')
		.lean();

	if (products.length !== productIds.length) {
		const foundSet = new Set(products.map((p) => String(p._id)));
		const missing = productIds.filter((id) => !foundSet.has(String(id)));
		throw new ValidationError(`Products not found: ${missing.join(', ')}`);
	}

	// 3) Validate shipping profiles (only weightKg is mandatory)
	const incomplete = findMissingShippingProfiles(products);
	if (incomplete.length > 0) {
		const err = new ValidationError(
			'Some products are missing shipping weight. Please ask the seller to update them.'
		);
		err.code = 'MISSING_SHIPPING_PROFILE';
		err.details = incomplete.map((p) => ({ productId: p._id, name: p.name }));
		throw err;
	}

	// 4) Build enriched items keyed by productId
	const qtyMap = new Map();
	for (const i of items) qtyMap.set(String(i.productId), i.quantity);

	const enriched = products.map((p) => {
		const qty = qtyMap.get(String(p._id));
		return {
			productId:   p._id,
			name:        p.name,
			vendorId:    p.vendorId,
			qty,
			weightKg:    p.weightKg,
			shippingDiscountType:  p.shippingDiscountType  || 'NONE',
			shippingDiscountValue: p.shippingDiscountValue || 0,
			municipality: p.municipality
		};
	});

	// 5) Group by vendorId → one shipment per seller
	const vendorGroups = new Map();
	for (const item of enriched) {
		const vid = String(item.vendorId);
		if (!vendorGroups.has(vid)) vendorGroups.set(vid, []);
		vendorGroups.get(vid).push(item);
	}

	// 6) Calculate each shipment
	const shipments = [];
	for (const [vendorId, vendorItems] of vendorGroups) {
		const shipment = await processShipment(vendorItems, dest, serviceType, toggles);
		shipment.vendorId = vendorId;
		shipments.push(shipment);
	}

	// 7) Aggregate summary
	const summary = {
		totalBaseShippingFeePhp:  shipments.reduce((s, sh) => s + sh.fees.baseShippingFeePhp, 0),
		totalShippingDiscountPhp: shipments.reduce((s, sh) => s + sh.fees.totalShippingDiscountPhp, 0),
		totalFinalShippingFeePhp: shipments.reduce((s, sh) => s + sh.fees.finalShippingFeePhp, 0)
	};

	return {
		courier: 'JNT',
		serviceType,
		destination: dest,
		shipments,
		summary
	};
}

/**
 * Process a single shipment (one seller's items).
 */
async function processShipment(vendorItems, dest, serviceType, toggles) {
	// Derive origin from the seller's municipality (all products of a given vendor should share municipality)
	const originCity   = (vendorItems[0].municipality || '').toUpperCase().trim();
	const originProv   = 'ORIENTAL-MINDORO'; // MVP: all sellers are in Oriental Mindoro

	// Validate origin
	await validateAddress(originProv, originCity);

	// Resolve zone
	const zone = resolveZone(originProv, dest.provinceCode);
	if (!zone) {
		const err = new ValidationError(
			`Shipping zone not supported: ${originProv} → ${dest.provinceCode}`
		);
		err.code = 'INVALID_ADDRESS';
		throw err;
	}

	// ─── Weight computation (actual weight only) ────────────────────────────
	let totalActualKg = 0;
	for (const item of vendorItems) {
		totalActualKg += item.weightKg * item.qty;
	}
	totalActualKg = parseFloat(totalActualKg.toFixed(4));

	const chargeableKgRounded = roundWeightUp(totalActualKg);

	// ─── Bag selection ───────────────────────────────────────────────────────
	const bagSpec = selectBag(chargeableKgRounded);
	if (!bagSpec) {
		const err = new ValidationError(
			`Total shipment weight (${chargeableKgRounded} kg) exceeds maximum supported weight of 8 kg. Consider splitting your order.`
		);
		err.code = 'UNSUPPORTED_WEIGHT';
		throw err;
	}

	// ─── Rate lookup ─────────────────────────────────────────────────────────
	const rateResult = await ShippingRate.lookupFee(zone, serviceType, bagSpec, chargeableKgRounded, toggles);
	if (!rateResult) {
		const err = new NotFoundError(
			`No J&T rate configured for zone=${zone}, service=${serviceType}, bag=${bagSpec}, weight=${chargeableKgRounded}kg`
		);
		err.code = 'RATE_NOT_FOUND';
		throw err;
	}

	if (rateResult.feePhp === null) {
		const err = new NotFoundError(
			`J&T rate for ${chargeableKgRounded}kg (${bagSpec}) is not yet verified. Contact admin.`
		);
		err.code = 'RATE_NOT_FOUND';
		throw err;
	}

	const baseShippingFeePhp = rateResult.feePhp;

	// ─── Discount calculation ────────────────────────────────────────────────
	const { totalDiscountPhp, discountBreakdown } = calculateDiscounts(
		vendorItems,
		baseShippingFeePhp
	);

	const finalShippingFeePhp = Math.max(baseShippingFeePhp - totalDiscountPhp, 0);

	return {
		origin: { provinceCode: originProv, cityCode: originCity },
		bagSpecUsed: bagSpec,
		weights: {
			actualWeightKg:           totalActualKg,
			chargeableWeightKgRounded: chargeableKgRounded,
			roundingStep:             WEIGHT_ROUNDING_STEP
		},
		fees: {
			baseShippingFeePhp,
			totalShippingDiscountPhp: totalDiscountPhp,
			finalShippingFeePhp
		},
		discountBreakdown
	};
}

/**
 * Calculate per-item shipping discounts, allocated by chargeable weight share.
 */
function calculateDiscounts(vendorItems, baseShippingFeePhp) {
	if (baseShippingFeePhp <= 0) {
		return {
			totalDiscountPhp: 0,
			discountBreakdown: vendorItems.map((item) => ({
				productId: item.productId,
				productName: item.name,
				qty: item.qty,
				shippingDiscountType: item.shippingDiscountType,
				shippingDiscountValue: item.shippingDiscountValue,
				computedDiscountPhp: 0
			}))
		};
	}

	// Compute weight per item (actual weight only)
	const itemWeights = vendorItems.map((item) => item.weightKg * item.qty);
	const totalItemWeight = itemWeights.reduce((s, w) => s + w, 0) || 1;

	let rawTotalDiscount = 0;
	const breakdown = vendorItems.map((item, idx) => {
		const itemChargeableWeight = itemWeights[idx];
		const itemShare = baseShippingFeePhp * (itemChargeableWeight / totalItemWeight);

		let discount = 0;
		if (item.shippingDiscountType === 'FIXED') {
			discount = item.shippingDiscountValue * item.qty;
		} else if (item.shippingDiscountType === 'PERCENT') {
			discount = itemShare * (item.shippingDiscountValue / 100);
		}
		// NONE → 0

		discount = parseFloat(Math.max(discount, 0).toFixed(2));
		rawTotalDiscount += discount;

		return {
			productId: item.productId,
			productName: item.name,
			qty: item.qty,
			shippingDiscountType: item.shippingDiscountType,
			shippingDiscountValue: item.shippingDiscountValue,
			computedDiscountPhp: discount
		};
	});

	// Clamp total discount to base fee
	const totalDiscountPhp = parseFloat(Math.min(rawTotalDiscount, baseShippingFeePhp).toFixed(2));

	// If clamped, proportionally scale each item's discount down
	if (rawTotalDiscount > baseShippingFeePhp && rawTotalDiscount > 0) {
		const factor = baseShippingFeePhp / rawTotalDiscount;
		for (const b of breakdown) {
			b.computedDiscountPhp = parseFloat((b.computedDiscountPhp * factor).toFixed(2));
		}
	}

	return { totalDiscountPhp, discountBreakdown: breakdown };
}

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
	calculateShippingQuote,
	validateAddress,
	findMissingShippingProfiles,
	// Exposed for unit testing
	roundWeightUp,
	selectBag,
	resolveZone,
	calculateDiscounts,
	processShipment,
	WEIGHT_ROUNDING_STEP,
	BAG_SPECS,
	ORIENTAL_MINDORO_CITIES
};
