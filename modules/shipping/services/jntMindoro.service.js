/**
 * J&T Oriental Mindoro — Unified shipping service.
 *
 * Handles ALL J&T shipping for Oriental Mindoro:
 *   ≤ 8 kg  → Bag pricing (SMALL / MEDIUM / BIG)
 *   9–50 kg → Fixed per-kg rate table
 *
 * Entry points:
 *   calculateJntMindoroQuote()  — full multi-seller quote from cart items
 *   recalculateForOrder()       — re-verify at order creation time
 */

'use strict';

const Product = require('../../products/products.model');
const { ShippingAddress } = require('../models');
const {
  calcShipmentFromItems,
  groupItemsBySeller,
  ShippingCalcError,
} = require('../../../utils/shipping/jntMindoroRate');
const {
  ValidationError,
  NotFoundError,
} = require('../../../utils/errorHandler');

// Cities in Oriental Mindoro (fallback when DB not seeded)
const ORIENTAL_MINDORO_CITIES = new Set([
  'BACO', 'BANSUD', 'BONGABONG', 'BULALACAO', 'CALAPAN',
  'GLORIA', 'MANSALAY', 'NAUJAN', 'PINAMALAYAN', 'POLA',
  'PUERTO GALERA', 'ROXAS', 'SAN TEODORO', 'SOCORRO', 'VICTORIA',
]);

// ─── Address validation ──────────────────────────────────────────────────────

/**
 * Validate that a provinceCode + cityCode pair is within Oriental Mindoro.
 * Checks database first, falls back to hardcoded list.
 */
async function validateOrientalMindoroAddress(provinceCode, cityCode) {
  const p = (provinceCode || '').toUpperCase().trim();
  const c = (cityCode || '').toUpperCase().trim();

  if (!p || !c) {
    const err = new ValidationError('provinceCode and cityCode are required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (p !== 'ORIENTAL-MINDORO') {
    const err = new ValidationError(
      `J&T Mindoro shipping is only available within Oriental Mindoro. Got: ${p}`
    );
    err.code = 'SHIPPING_NOT_SUPPORTED';
    throw err;
  }

  // Check DB first
  const dbValid = await ShippingAddress.isValid(p, c);
  if (dbValid) return { provinceCode: p, cityCode: c };

  // Hardcoded fallback
  if (ORIENTAL_MINDORO_CITIES.has(c)) {
    return { provinceCode: p, cityCode: c };
  }

  const err = new ValidationError(`Shipping not available to ${c}, ${p}`);
  err.code = 'SHIPPING_NOT_SUPPORTED';
  throw err;
}

// ─── Product loading & validation ────────────────────────────────────────────

/**
 * Load product docs from DB and validate shipping profiles.
 * Returns lean documents with only the fields needed for shipping.
 */
async function loadAndValidateProducts(items) {
  const productIds = items.map((i) => String(i.productId));
  const products = await Product.find({ _id: { $in: productIds } })
    .select('_id name vendorId weightKg lengthCm widthCm heightCm municipality shippingDiscountType shippingDiscountValue')
    .lean();

  // Check all products exist
  if (products.length !== productIds.length) {
    const foundSet = new Set(products.map((p) => String(p._id)));
    const missing = productIds.filter((id) => !foundSet.has(id));
    throw new NotFoundError(`Products not found: ${missing.join(', ')}`);
  }

  // Validate shipping profiles — weightKg is mandatory
  const incomplete = products.filter((p) => p.weightKg == null || p.weightKg <= 0);
  if (incomplete.length > 0) {
    const err = new ValidationError(
      'Some products are missing shipping weight. Please ask the seller to update them.'
    );
    err.code = 'MISSING_SHIPPING_PROFILE';
    err.details = incomplete.map((p) => ({ productId: p._id, name: p.name }));
    throw err;
  }

  return products;
}

// ─── Main quote function ─────────────────────────────────────────────────────

/**
 * Calculate a full J&T Mindoro shipping quote for a set of cart items.
 *
 * @param {Object}   opts
 * @param {Object}   opts.destination  — { provinceCode, cityCode }
 * @param {Array}    opts.items        — [{ productId, quantity }]
 *
 * @returns {Object} Structured quote with shipments[] and totals
 */
async function calculateJntMindoroQuote({ destination, items }) {
  // 1) Validate destination is within Oriental Mindoro
  const dest = await validateOrientalMindoroAddress(
    destination.provinceCode,
    destination.cityCode
  );

  // 2) Load products from DB (never trust client)
  const products = await loadAndValidateProducts(items);

  // 3) Group by seller
  const sellerGroups = groupItemsBySeller(items, products);

  // 4) Calculate each shipment
  const shipments = [];

  for (const [sellerId, group] of sellerGroups) {
    // Validate seller origin is also in Oriental Mindoro
    const origin = await validateOrientalMindoroAddress(
      group.origin.provinceCode,
      group.origin.cityCode
    );

    try {
      const result = calcShipmentFromItems(group.items);

      shipments.push({
        sellerId,
        origin,
        destination: dest,
        actualKg: result.actualKg,
        volumetricKg: result.volumetricKg,
        chargeableKg: result.chargeableKg,
        billKg: result.billKg,
        fee: result.fee,
        tier: result.tier,
        bagSpec: result.bagSpec,
        display: result.display,
        items: group.items.map((i) => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          weightKg: i.weightKg,
        })),
      });
    } catch (calcErr) {
      if (calcErr instanceof ShippingCalcError) {
        // Convert to application-level error with seller context
        const err = new ValidationError(calcErr.message);
        err.code = calcErr.code;
        err.details = { sellerId, ...calcErr.details };
        throw err;
      }
      throw calcErr;
    }
  }

  // 5) Build totals
  const shippingFeeTotal = shipments.reduce((sum, s) => sum + s.fee, 0);

  return {
    method: 'JNT_MINDORO',
    destination: dest,
    shipments,
    totals: {
      shippingFeeTotal,
      billKgTotalNote: 'per-shipment',
    },
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Recalculate shipping at order creation time.
 * Same logic as calculateJntMindoroQuote but returns just the fee + breakdown
 * for storing on the order document.
 */
async function recalculateForOrder({ destination, items }) {
  const quote = await calculateJntMindoroQuote({ destination, items });

  return {
    shippingFee: quote.totals.shippingFeeTotal,
    shippingBreakdown: {
      method: quote.method,
      destination: quote.destination,
      shipments: quote.shipments,
      totals: quote.totals,
      calculatedAt: quote.calculatedAt,
    },
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  calculateJntMindoroQuote,
  recalculateForOrder,
  validateOrientalMindoroAddress,
  loadAndValidateProducts,
  ORIENTAL_MINDORO_CITIES,
};
