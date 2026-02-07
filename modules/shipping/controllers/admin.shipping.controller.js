const { ShippingRate, ShippingAddress } = require('../models');
const sanitizeMongoInput = require('../../../utils/sanitizeMongoInput');
const { ValidationError, asyncHandler } = require('../../../utils/errorHandler');

// ─── GET /admin/shipping/rates ───────────────────────────────────────────────
exports.listRates = asyncHandler(async (req, res) => {
	const page  = Math.max(1, parseInt(req.query.page)  || 1);
	const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
	const skip  = (page - 1) * limit;

	const filter = {};
	if (req.query.zone)        filter.zone        = String(req.query.zone).toUpperCase();
	if (req.query.serviceType) filter.serviceType  = String(req.query.serviceType).toUpperCase();
	if (req.query.bagSpec)     filter.bagSpec       = String(req.query.bagSpec);
	if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

	const [rates, total] = await Promise.all([
		ShippingRate.find(filter).sort({ zone: 1, bagSpec: 1 }).skip(skip).limit(limit).lean(),
		ShippingRate.countDocuments(filter)
	]);

	res.json({
		success: true,
		data: {
			rates,
			pagination: { page, limit, total, pages: Math.ceil(total / limit) }
		}
	});
});

// ─── POST /admin/shipping/rates ──────────────────────────────────────────────
exports.createRate = asyncHandler(async (req, res) => {
	const body = sanitizeMongoInput(req.body);

	const required = ['zone', 'serviceType', 'bagSpec', 'maxKg', 'brackets'];
	for (const f of required) {
		if (body[f] === undefined || body[f] === null) {
			throw new ValidationError(`Missing required field: ${f}`);
		}
	}

	// Prevent duplicates
	const exists = await ShippingRate.findOne({
		zone: String(body.zone).toUpperCase(),
		serviceType: String(body.serviceType).toUpperCase(),
		bagSpec: body.bagSpec,
		'toggles.itemAdditionalFee': !!(body.toggles && body.toggles.itemAdditionalFee),
		'toggles.itemSize': !!(body.toggles && body.toggles.itemSize),
		isActive: true
	});
	if (exists) {
		throw new ValidationError('An active rate with these parameters already exists');
	}

	const rate = await ShippingRate.create({
		zone: String(body.zone).toUpperCase(),
		serviceType: String(body.serviceType).toUpperCase(),
		bagSpec: body.bagSpec,
		maxKg: body.maxKg,
		brackets: body.brackets,
		toggles: body.toggles || { itemAdditionalFee: false, itemSize: false },
		lastVerifiedAt: new Date(),
		isActive: true
	});

	res.status(201).json({ success: true, data: rate });
});

// ─── PUT /admin/shipping/rates/:id ───────────────────────────────────────────
exports.updateRate = asyncHandler(async (req, res) => {
	const body = sanitizeMongoInput(req.body);
	const { id } = req.params;

	if (!id.match(/^[0-9a-fA-F]{24}$/)) {
		throw new ValidationError('Invalid rate ID format');
	}

	const rate = await ShippingRate.findById(id);
	if (!rate) throw new ValidationError('Shipping rate not found');

	// Merge allowed fields
	if (body.brackets)       rate.brackets       = body.brackets;
	if (body.maxKg)          rate.maxKg           = body.maxKg;
	if (body.isActive !== undefined) rate.isActive = body.isActive;
	if (body.toggles)        rate.toggles         = body.toggles;

	rate.lastVerifiedAt = new Date();
	await rate.save();

	res.json({ success: true, data: rate });
});

// ─── DELETE /admin/shipping/rates/:id  (soft) ────────────────────────────────
exports.deleteRate = asyncHandler(async (req, res) => {
	const { id } = req.params;
	if (!id.match(/^[0-9a-fA-F]{24}$/)) {
		throw new ValidationError('Invalid rate ID format');
	}

	const rate = await ShippingRate.findOneAndUpdate(
		{ _id: id, isActive: true },
		{ isActive: false },
		{ new: true }
	);
	if (!rate) throw new ValidationError('Shipping rate not found or already deleted');

	res.json({ success: true, message: 'Rate deactivated', data: { id } });
});

// ─── POST /admin/shipping/rates/:id/bracket ──────────────────────────────────
// Convenience endpoint: update a single bracket's feePhp (e.g. admin fills a placeholder)
exports.updateBracket = asyncHandler(async (req, res) => {
	const { id } = req.params;
	if (!id.match(/^[0-9a-fA-F]{24}$/)) {
		throw new ValidationError('Invalid rate ID format');
	}

	const { maxKg, feePhp } = sanitizeMongoInput(req.body);
	if (maxKg === undefined) throw new ValidationError('maxKg is required');
	if (feePhp !== null && (typeof feePhp !== 'number' || feePhp < 0)) {
		throw new ValidationError('feePhp must be null or a non-negative number');
	}

	const rate = await ShippingRate.findById(id);
	if (!rate) throw new ValidationError('Shipping rate not found');

	const bracket = rate.brackets.find((b) => b.maxKg === maxKg);
	if (!bracket) throw new ValidationError(`No bracket found for maxKg=${maxKg}`);

	bracket.feePhp = feePhp;
	rate.lastVerifiedAt = new Date();
	await rate.save();

	res.json({ success: true, data: rate });
});

// ─── GET /admin/shipping/addresses ───────────────────────────────────────────
exports.listAddresses = asyncHandler(async (req, res) => {
	const filter = {};
	if (req.query.province) filter.provinceCode = String(req.query.province).toUpperCase();
	if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

	const addresses = await ShippingAddress.find(filter).sort({ provinceCode: 1, cityCode: 1 }).lean();
	res.json({ success: true, data: addresses });
});

// ─── POST /admin/shipping/seed ───────────────────────────────────────────────
// Seeds Oriental Mindoro addresses + J&T OM_LOCAL rates (idempotent).
exports.seedOrientalMindoro = asyncHandler(async (req, res) => {
	const CITIES = [
		'BACO', 'BANSUD', 'BONGABONG', 'BULALACAO', 'CALAPAN',
		'GLORIA', 'MANSALAY', 'NAUJAN', 'PINAMALAYAN', 'POLA',
		'PUERTO GALERA', 'ROXAS', 'SAN TEODORO', 'SOCORRO', 'VICTORIA'
	];

	// ── Addresses ────────────────────────────────────────────────────────────
	let addrCreated = 0;
	for (const city of CITIES) {
		const exists = await ShippingAddress.findOne({
			provinceCode: 'ORIENTAL-MINDORO',
			cityCode: city
		});
		if (!exists) {
			await ShippingAddress.create({
				provinceCode: 'ORIENTAL-MINDORO',
				cityCode: city,
				displayName: `${city.charAt(0) + city.slice(1).toLowerCase().replace(/ ([a-z])/g, (_, l) => ' ' + l.toUpperCase())}, Oriental Mindoro`,
				isActive: true
			});
			addrCreated++;
		}
	}

	// ── Rates ────────────────────────────────────────────────────────────────
	const bags = [
		{ bagSpec: 'SMALL_LE_3KG',  maxKg: 3, verifiedFee: 70  },
		{ bagSpec: 'MEDIUM_LE_5KG', maxKg: 5, verifiedFee: 120 },
		{ bagSpec: 'BIG_LE_8KG',    maxKg: 8, verifiedFee: 160 }
	];

	let rateCreated = 0;
	for (const bag of bags) {
		const exists = await ShippingRate.findOne({
			zone: 'OM_LOCAL',
			serviceType: 'EZ',
			bagSpec: bag.bagSpec,
			'toggles.itemAdditionalFee': false,
			'toggles.itemSize': false
		});
		if (exists) continue;

		// Build brackets in 0.5 kg increments.
		// J&T uses flat bag-based pricing: every weight within this bag
		// costs the same, so all brackets get the verified fee.
		const brackets = [];
		for (let kg = 0.5; kg <= bag.maxKg; kg = parseFloat((kg + 0.5).toFixed(1))) {
			brackets.push({
				maxKg: kg,
				feePhp: bag.verifiedFee
			});
		}

		await ShippingRate.create({
			zone: 'OM_LOCAL',
			serviceType: 'EZ',
			toggles: { itemAdditionalFee: false, itemSize: false },
			bagSpec: bag.bagSpec,
			maxKg: bag.maxKg,
			brackets,
			lastVerifiedAt: new Date(),
			isActive: true
		});
		rateCreated++;
	}

	res.status(201).json({
		success: true,
		message: `Seed complete: ${addrCreated} addresses created, ${rateCreated} rates created`,
		data: { addressesCreated: addrCreated, ratesCreated: rateCreated }
	});
});
