const mongoose = require('mongoose');

const ShippingAddressSchema = new mongoose.Schema(
	{
		provinceCode: {
			type: String,
			required: true,
			trim: true,
			uppercase: true
			// e.g. "ORIENTAL-MINDORO"
		},
		cityCode: {
			type: String,
			required: true,
			trim: true,
			uppercase: true
			// e.g. "CALAPAN"
		},
		displayName: {
			type: String,
			required: true,
			trim: true
			// e.g. "Calapan, Oriental Mindoro"
		},
		isActive: {
			type: Boolean,
			default: true
		}
	},
	{ timestamps: true }
);

// Unique compound index
ShippingAddressSchema.index(
	{ provinceCode: 1, cityCode: 1 },
	{ unique: true, name: 'province_city_unique' }
);
ShippingAddressSchema.index({ isActive: 1, provinceCode: 1 });

// ─── Statics ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the given province+city is a valid, active shipping address.
 */
ShippingAddressSchema.statics.isValid = async function (provinceCode, cityCode) {
	const doc = await this.findOne({
		provinceCode: provinceCode.toUpperCase().trim(),
		cityCode: cityCode.toUpperCase().trim(),
		isActive: true
	}).lean();
	return !!doc;
};

/**
 * Return all active addresses for a province.
 */
ShippingAddressSchema.statics.listByProvince = function (provinceCode) {
	return this.find({
		provinceCode: provinceCode.toUpperCase().trim(),
		isActive: true
	})
		.sort({ cityCode: 1 })
		.lean();
};

module.exports = mongoose.model('ShippingAddress', ShippingAddressSchema);
