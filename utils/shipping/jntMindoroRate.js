/**
 * J&T Oriental Mindoro — Unified Shipping Rate Calculator
 *
 * Pure, deterministic shipping calculator.
 * Shared between backend (source of truth) and frontend (display estimate).
 *
 * Pricing tiers (per shipment, by billable weight):
 *   ≤ 3 kg  → SMALL bag  → ₱70
 *   ≤ 5 kg  → MEDIUM bag → ₱120
 *   ≤ 8 kg  → BIG bag    → ₱160
 *   9–50 kg → Rate table  (per-kg lookup)
 *
 * Business rules:
 *  - Only for ORIENTAL-MINDORO ↔ ORIENTAL-MINDORO shipments
 *  - Billable weight = max(actualKg, volumetricKg), ceil'd, clamped to min 1
 *  - Volumetric formula: (L × W × H) / 5000
 *  - If billKg > 50 → MANUAL_QUOTE_REQUIRED
 *  - Fee is determined by tier: bag pricing for ≤8kg, table lookup for 9–50kg
 */

'use strict';

// ─── Bag Pricing (≤ 8 kg) ────────────────────────────────────────────────────

const BAG_TIERS = [
  { key: 'SMALL_LE_3KG',  maxKg: 3,  fee: 70  },
  { key: 'MEDIUM_LE_5KG', maxKg: 5,  fee: 120 },
  { key: 'BIG_LE_8KG',    maxKg: 8,  fee: 160 },
];

const BAG_MAX_KG = 8;

// ─── Rate Table (9–50 kg) ────────────────────────────────────────────────────

const JNT_ORIENTAL_MINDORO_RATE_UP_TO_50KG = {
  1: 155,   2: 180,   3: 180,   4: 200,   5: 220,
  6: 275,   7: 335,   8: 395,   9: 455,  10: 515,
  11: 575,  12: 635,  13: 695,  14: 755,  15: 815,
  16: 875,  17: 935,  18: 995,  19: 1055, 20: 1115,
  21: 1175, 22: 1235, 23: 1295, 24: 1355, 25: 1415,
  26: 1475, 27: 1535, 28: 1595, 29: 1655, 30: 1715,
  31: 1775, 32: 1835, 33: 1895, 34: 1955, 35: 2015,
  36: 2075, 37: 2135, 38: 2195, 39: 2255, 40: 2315,
  41: 2375, 42: 2435, 43: 2495, 44: 2555, 45: 2615,
  46: 2675, 47: 2735, 48: 2795, 49: 2855, 50: 2915,
};

const VOLUMETRIC_DIVISOR = 5000;
const MAX_BILLABLE_KG = 50;
const MIN_BILLABLE_KG = 1;

// ─── Error classes ───────────────────────────────────────────────────────────

class ShippingCalcError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ShippingCalcError';
    this.code = code;
    this.details = details;
  }
}

// ─── Validators ──────────────────────────────────────────────────────────────

function isPositiveNumber(val) {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

/**
 * Validate inputs for the core calculator.
 * @throws {ShippingCalcError} VALIDATION_ERROR
 */
function validateInputs({ actualKg, lengthCm, widthCm, heightCm }) {
  if (actualKg == null || !isPositiveNumber(actualKg)) {
    throw new ShippingCalcError(
      'actualKg must be a positive number.',
      'VALIDATION_ERROR',
      { field: 'actualKg', value: actualKg }
    );
  }

  const dims = [lengthCm, widthCm, heightCm];
  const provided = dims.filter((d) => d != null);

  if (provided.length > 0 && provided.length < 3) {
    throw new ShippingCalcError(
      'If any dimension is provided, lengthCm, widthCm, and heightCm are all required.',
      'VALIDATION_ERROR',
      { fields: ['lengthCm', 'widthCm', 'heightCm'] }
    );
  }

  for (const [name, val] of [['lengthCm', lengthCm], ['widthCm', widthCm], ['heightCm', heightCm]]) {
    if (val != null && !isPositiveNumber(val)) {
      throw new ShippingCalcError(
        `${name} must be a positive number.`,
        'VALIDATION_ERROR',
        { field: name, value: val }
      );
    }
  }
}

// ─── Fee Resolution ──────────────────────────────────────────────────────────

/**
 * Select the appropriate bag tier for weights ≤ 8 kg.
 * Returns { key, maxKg, fee } or null if weight exceeds all bags.
 */
function selectBagTier(billKg) {
  for (const bag of BAG_TIERS) {
    if (billKg <= bag.maxKg) return bag;
  }
  return null;
}

/**
 * Resolve fee for a given billable weight.
 * ≤ 8 kg → bag pricing, 9–50 kg → rate table.
 *
 * @param {number} billKg — ceil'd chargeable weight, ≥ 1
 * @returns {{ fee: number, tier: string, bagSpec: string|null }}
 */
function resolveFee(billKg) {
  if (billKg <= BAG_MAX_KG) {
    const bag = selectBagTier(billKg);
    if (bag) {
      return { fee: bag.fee, tier: 'BAG', bagSpec: bag.key };
    }
  }

  // 9–50 kg rate table
  const tableFee = JNT_ORIENTAL_MINDORO_RATE_UP_TO_50KG[billKg];
  if (tableFee != null) {
    return { fee: tableFee, tier: 'RATE_TABLE', bagSpec: null };
  }

  return null;
}

// ─── Core Calculator ─────────────────────────────────────────────────────────

/**
 * Calculate J&T Oriental Mindoro shipping fee for a single weight entry.
 *
 * @param {Object} opts
 * @param {number} opts.actualKg     — actual weight in kg (required, > 0)
 * @param {number} [opts.lengthCm]   — package length in cm
 * @param {number} [opts.widthCm]    — package width in cm
 * @param {number} [opts.heightCm]   — package height in cm
 *
 * @returns {{ method, actualKg, volumetricKg, chargeableKg, billKg, fee, tier, bagSpec, display }}
 * @throws {ShippingCalcError} VALIDATION_ERROR | MANUAL_QUOTE_REQUIRED
 */
function calcJntMindoroShipping({ actualKg, lengthCm, widthCm, heightCm }) {
  validateInputs({ actualKg, lengthCm, widthCm, heightCm });

  let volumetricKg = 0;
  if (lengthCm != null && widthCm != null && heightCm != null) {
    volumetricKg = (lengthCm * widthCm * heightCm) / VOLUMETRIC_DIVISOR;
  }

  const chargeableKg = Math.max(actualKg, volumetricKg);
  let billKg = Math.ceil(chargeableKg);
  billKg = Math.max(billKg, MIN_BILLABLE_KG);

  if (billKg > MAX_BILLABLE_KG) {
    throw new ShippingCalcError(
      'Shipment exceeds 50kg. Manual quote required.',
      'MANUAL_QUOTE_REQUIRED',
      { billKg, maxKg: MAX_BILLABLE_KG }
    );
  }

  const resolved = resolveFee(billKg);

  return {
    method: 'JNT_MINDORO',
    actualKg: round4(actualKg),
    volumetricKg: round4(volumetricKg),
    chargeableKg: round4(chargeableKg),
    billKg,
    fee: resolved.fee,
    tier: resolved.tier,
    bagSpec: resolved.bagSpec,
    display: formatFee(resolved.fee, billKg),
  };
}

// ─── Aggregation Helpers ─────────────────────────────────────────────────────

/**
 * Calculate a single shipment total from an array of items with shipping profiles.
 *
 * @param {Array<{ weightKg: number, lengthCm?: number, widthCm?: number, heightCm?: number, quantity: number }>} itemsWithProfiles
 * @returns {{ method, actualKg, volumetricKg, chargeableKg, billKg, fee, tier, bagSpec, display }}
 * @throws {ShippingCalcError} VALIDATION_ERROR | MANUAL_QUOTE_REQUIRED
 */
function calcShipmentFromItems(itemsWithProfiles) {
  if (!Array.isArray(itemsWithProfiles) || itemsWithProfiles.length === 0) {
    throw new ShippingCalcError(
      'itemsWithProfiles must be a non-empty array.',
      'VALIDATION_ERROR'
    );
  }

  let actualKgTotal = 0;
  let volumetricKgTotal = 0;

  for (const item of itemsWithProfiles) {
    const qty = item.quantity || 1;

    if (!isPositiveNumber(item.weightKg)) {
      throw new ShippingCalcError(
        'Each item must have a positive weightKg.',
        'VALIDATION_ERROR',
        { item }
      );
    }

    actualKgTotal += item.weightKg * qty;

    if (item.lengthCm != null && item.widthCm != null && item.heightCm != null) {
      const unitVol = (item.lengthCm * item.widthCm * item.heightCm) / VOLUMETRIC_DIVISOR;
      volumetricKgTotal += unitVol * qty;
    }
  }

  const chargeableKg = Math.max(actualKgTotal, volumetricKgTotal);
  let billKg = Math.ceil(chargeableKg);
  billKg = Math.max(billKg, MIN_BILLABLE_KG);

  if (billKg > MAX_BILLABLE_KG) {
    throw new ShippingCalcError(
      'Shipment exceeds 50kg. Manual quote required.',
      'MANUAL_QUOTE_REQUIRED',
      { billKg, maxKg: MAX_BILLABLE_KG }
    );
  }

  const resolved = resolveFee(billKg);

  return {
    method: 'JNT_MINDORO',
    actualKg: round4(actualKgTotal),
    volumetricKg: round4(volumetricKgTotal),
    chargeableKg: round4(chargeableKg),
    billKg,
    fee: resolved.fee,
    tier: resolved.tier,
    bagSpec: resolved.bagSpec,
    display: formatFee(resolved.fee, billKg),
  };
}

/**
 * Group cart items by seller and attach shipping profiles from product docs.
 *
 * @param {Array<{ productId: string, quantity: number }>} cartItems
 * @param {Array<Object>} productDocs — Mongoose lean docs with vendorId, weightKg, dims, municipality
 * @returns {Map<string, { items: Array, origin: { provinceCode, cityCode } }>}
 */
function groupItemsBySeller(cartItems, productDocs) {
  const productMap = new Map();
  for (const p of productDocs) {
    productMap.set(String(p._id), p);
  }

  const qtyMap = new Map();
  for (const ci of cartItems) {
    qtyMap.set(String(ci.productId), ci.quantity);
  }

  const sellerGroups = new Map();

  for (const ci of cartItems) {
    const doc = productMap.get(String(ci.productId));
    if (!doc) continue;

    const sellerId = String(doc.vendorId);

    if (!sellerGroups.has(sellerId)) {
      sellerGroups.set(sellerId, {
        items: [],
        origin: {
          provinceCode: 'ORIENTAL-MINDORO',
          cityCode: (doc.municipality || '').toUpperCase().trim(),
        },
      });
    }

    sellerGroups.get(sellerId).items.push({
      productId: String(doc._id),
      name: doc.name,
      weightKg: doc.weightKg,
      lengthCm: doc.lengthCm || null,
      widthCm: doc.widthCm || null,
      heightCm: doc.heightCm || null,
      quantity: qtyMap.get(String(ci.productId)) || ci.quantity,
      shippingDiscountType: doc.shippingDiscountType || 'NONE',
      shippingDiscountValue: doc.shippingDiscountValue || 0,
    });
  }

  return sellerGroups;
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

function formatFee(fee, billKg) {
  return `₱${fee.toLocaleString()} (${billKg} kg)`;
}

function round4(n) {
  return parseFloat(n.toFixed(4));
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  BAG_TIERS,
  BAG_MAX_KG,
  JNT_ORIENTAL_MINDORO_RATE_UP_TO_50KG,
  VOLUMETRIC_DIVISOR,
  MAX_BILLABLE_KG,
  MIN_BILLABLE_KG,
  ShippingCalcError,
  calcJntMindoroShipping,
  calcShipmentFromItems,
  groupItemsBySeller,
  resolveFee,
  selectBagTier,
  validateInputs,
  isPositiveNumber,
};
