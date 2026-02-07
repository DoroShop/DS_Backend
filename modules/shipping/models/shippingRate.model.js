const mongoose = require('mongoose');

// ─── Weight bracket within a bag spec ────────────────────────────────────────
const BracketSchema = new mongoose.Schema(
	{
		maxKg: {
			type: Number,
			required: true,
			min: [0.5, 'Bracket maxKg must be at least 0.5']
		},
		feePhp: {
			type: Number,
			default: null, // null = not-yet-verified placeholder
			min: [0, 'Fee cannot be negative'],
			validate: {
				validator: (v) => v === null || v >= 0,
				message: 'feePhp must be null (placeholder) or >= 0'
			}
		}
	},
	{ _id: false }
);

// ─── Toggles mirror J&T calculator switches ─────────────────────────────────
const TogglesSchema = new mongoose.Schema(
	{
		itemAdditionalFee: { type: Boolean, default: false },
		itemSize:          { type: Boolean, default: false }
	},
	{ _id: false }
);

// ─── Main ShippingRate document ──────────────────────────────────────────────
const ShippingRateSchema = new mongoose.Schema(
	{
		zone: {
			type: String,
			required: true,
			trim: true,
			uppercase: true
			// e.g. "OM_LOCAL"
		},
		serviceType: {
			type: String,
			required: true,
			trim: true,
			uppercase: true
			// e.g. "EZ"
		},
		toggles: {
			type: TogglesSchema,
			required: true,
			default: () => ({ itemAdditionalFee: false, itemSize: false })
		},
		bagSpec: {
			type: String,
			required: true,
			enum: {
				values: ['SMALL_LE_3KG', 'MEDIUM_LE_5KG', 'BIG_LE_8KG'],
				message: 'bagSpec must be SMALL_LE_3KG, MEDIUM_LE_5KG, or BIG_LE_8KG'
			}
		},
		maxKg: {
			type: Number,
			required: true,
			min: [0.5, 'maxKg must be at least 0.5']
		},
		brackets: {
			type: [BracketSchema],
			required: true,
			validate: {
				validator(arr) {
					if (!Array.isArray(arr) || arr.length === 0) return false;
					for (let i = 1; i < arr.length; i++) {
						if (arr[i].maxKg <= arr[i - 1].maxKg) return false;
					}
					return true;
				},
				message: 'brackets must be non-empty and sorted ascending by maxKg'
			}
		},
		lastVerifiedAt: { type: Date, default: Date.now },
		isActive:       { type: Boolean, default: true }
	},
	{ timestamps: true }
);

// ─── Compound index for fast rate lookup ─────────────────────────────────────
ShippingRateSchema.index(
	{
		zone: 1,
		serviceType: 1,
		bagSpec: 1,
		'toggles.itemAdditionalFee': 1,
		'toggles.itemSize': 1
	},
	{ name: 'rate_lookup_compound' }
);
ShippingRateSchema.index({ isActive: 1, zone: 1 });

// ─── Statics ─────────────────────────────────────────────────────────────────

/**
 * Lookup the fee for a specific weight in a given zone/service/toggles.
 * Returns { rateDoc, bracket, bagSpec, feePhp } or throws.
 */
ShippingRateSchema.statics.lookupFee = async function (
	zone,
	serviceType,
	bagSpec,
	roundedWeightKg,
	toggles = { itemAdditionalFee: false, itemSize: false }
) {
	const rateDoc = await this.findOne({
		zone,
		serviceType,
		bagSpec,
		'toggles.itemAdditionalFee': toggles.itemAdditionalFee,
		'toggles.itemSize': toggles.itemSize,
		isActive: true
	}).lean();

	if (!rateDoc) return null;

	// Find the first bracket whose maxKg >= roundedWeightKg
	const bracket = rateDoc.brackets.find((b) => roundedWeightKg <= b.maxKg);
	if (!bracket) return null;

	return {
		rateId: rateDoc._id,
		zone: rateDoc.zone,
		serviceType: rateDoc.serviceType,
		bagSpec: rateDoc.bagSpec,
		bracketMaxKg: bracket.maxKg,
		feePhp: bracket.feePhp, // may be null
		toggles: rateDoc.toggles
	};
};

module.exports = mongoose.model('ShippingRate', ShippingRateSchema);
