/**
 * Unit tests for J&T Oriental Mindoro unified shipping calculator.
 * Covers bag pricing (≤8kg) and rate table (9–50kg).
 *
 * Run: npm test -- test/jntMindoroRate.test.js
 */

'use strict';

const {
  BAG_TIERS,
  BAG_MAX_KG,
  JNT_ORIENTAL_MINDORO_RATE_UP_TO_50KG,
  calcJntMindoroShipping,
  calcShipmentFromItems,
  groupItemsBySeller,
  ShippingCalcError,
  resolveFee,
  selectBagTier,
  VOLUMETRIC_DIVISOR,
  MAX_BILLABLE_KG,
} = require('../utils/shipping/jntMindoroRate');

// ─── Bag Tiers ───────────────────────────────────────────────────────────────

describe('BAG_TIERS and selectBagTier', () => {
  test('BAG_TIERS has 3 entries', () => {
    expect(BAG_TIERS).toHaveLength(3);
  });

  test('BAG_MAX_KG is 8', () => {
    expect(BAG_MAX_KG).toBe(8);
  });

  test.each([
    [1, 'SMALL_LE_3KG', 70],
    [2, 'SMALL_LE_3KG', 70],
    [3, 'SMALL_LE_3KG', 70],
    [4, 'MEDIUM_LE_5KG', 120],
    [5, 'MEDIUM_LE_5KG', 120],
    [6, 'BIG_LE_8KG', 160],
    [7, 'BIG_LE_8KG', 160],
    [8, 'BIG_LE_8KG', 160],
  ])('%ikg → %s (₱%i)', (kg, expectedKey, expectedFee) => {
    const bag = selectBagTier(kg);
    expect(bag).not.toBeNull();
    expect(bag.key).toBe(expectedKey);
    expect(bag.fee).toBe(expectedFee);
  });

  test('9kg returns null (beyond bag range)', () => {
    expect(selectBagTier(9)).toBeNull();
  });
});

describe('resolveFee', () => {
  test.each([
    [1, 70, 'BAG', 'SMALL_LE_3KG'],
    [3, 70, 'BAG', 'SMALL_LE_3KG'],
    [4, 120, 'BAG', 'MEDIUM_LE_5KG'],
    [5, 120, 'BAG', 'MEDIUM_LE_5KG'],
    [6, 160, 'BAG', 'BIG_LE_8KG'],
    [8, 160, 'BAG', 'BIG_LE_8KG'],
    [9, 455, 'RATE_TABLE', null],
    [10, 515, 'RATE_TABLE', null],
    [25, 1415, 'RATE_TABLE', null],
    [50, 2915, 'RATE_TABLE', null],
  ])('%ikg → ₱%i (%s)', (kg, expectedFee, expectedTier, expectedBagSpec) => {
    const result = resolveFee(kg);
    expect(result).not.toBeNull();
    expect(result.fee).toBe(expectedFee);
    expect(result.tier).toBe(expectedTier);
    expect(result.bagSpec).toBe(expectedBagSpec);
  });

  test('51kg returns null', () => {
    expect(resolveFee(51)).toBeNull();
  });
});

// ─── Rate Map Spot-Checks ────────────────────────────────────────────────────

describe('JNT_ORIENTAL_MINDORO_RATE_UP_TO_50KG rate map', () => {
  const cases = [
    [1, 155],
    [2, 180],
    [3, 180],
    [4, 200],
    [5, 220],
    [6, 275],
    [7, 335],
    [10, 515],
    [11, 575],
    [25, 1415],
    [50, 2915],
  ];

  test.each(cases)('%ikg → ₱%i', (kg, expected) => {
    expect(JNT_ORIENTAL_MINDORO_RATE_UP_TO_50KG[kg]).toBe(expected);
  });

  test('map covers 1–50 inclusive', () => {
    for (let kg = 1; kg <= 50; kg++) {
      expect(typeof JNT_ORIENTAL_MINDORO_RATE_UP_TO_50KG[kg]).toBe('number');
      expect(JNT_ORIENTAL_MINDORO_RATE_UP_TO_50KG[kg]).toBeGreaterThan(0);
    }
  });
});

// ─── calcJntMindoroShipping — core ───────────────────────────────────────────

describe('calcJntMindoroShipping', () => {
  test('1 kg → ₱70 (BAG SMALL)', () => {
    const result = calcJntMindoroShipping({ actualKg: 1 });
    expect(result.method).toBe('JNT_MINDORO');
    expect(result.billKg).toBe(1);
    expect(result.fee).toBe(70);
    expect(result.tier).toBe('BAG');
    expect(result.bagSpec).toBe('SMALL_LE_3KG');
    expect(result.volumetricKg).toBe(0);
    expect(result.display).toMatch(/70/);
  });

  test('2 kg → ₱70 (BAG SMALL)', () => {
    const r = calcJntMindoroShipping({ actualKg: 2 });
    expect(r.fee).toBe(70);
    expect(r.billKg).toBe(2);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('SMALL_LE_3KG');
  });

  test('3 kg → ₱70 (BAG SMALL boundary)', () => {
    const r = calcJntMindoroShipping({ actualKg: 3 });
    expect(r.fee).toBe(70);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('SMALL_LE_3KG');
  });

  test('4 kg → ₱120 (BAG MEDIUM)', () => {
    const r = calcJntMindoroShipping({ actualKg: 4 });
    expect(r.fee).toBe(120);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('MEDIUM_LE_5KG');
  });

  test('5 kg → ₱120 (BAG MEDIUM boundary)', () => {
    const r = calcJntMindoroShipping({ actualKg: 5 });
    expect(r.fee).toBe(120);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('MEDIUM_LE_5KG');
  });

  test('6 kg → ₱160 (BAG BIG)', () => {
    const r = calcJntMindoroShipping({ actualKg: 6 });
    expect(r.fee).toBe(160);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('BIG_LE_8KG');
  });

  test('8 kg → ₱160 (BAG BIG boundary)', () => {
    const r = calcJntMindoroShipping({ actualKg: 8 });
    expect(r.fee).toBe(160);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('BIG_LE_8KG');
  });

  test('0.3 kg rounds up to billKg=1 → ₱70 (BAG SMALL)', () => {
    const r = calcJntMindoroShipping({ actualKg: 0.3 });
    expect(r.billKg).toBe(1);
    expect(r.fee).toBe(70);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('SMALL_LE_3KG');
  });

  test('5.1 kg rounds up to billKg=6 → ₱160 (BAG BIG)', () => {
    const r = calcJntMindoroShipping({ actualKg: 5.1 });
    expect(r.billKg).toBe(6);
    expect(r.fee).toBe(160);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('BIG_LE_8KG');
  });

  test('9 kg → ₱455 (RATE_TABLE, first beyond bag)', () => {
    const r = calcJntMindoroShipping({ actualKg: 9 });
    expect(r.billKg).toBe(9);
    expect(r.fee).toBe(455);
    expect(r.tier).toBe('RATE_TABLE');
    expect(r.bagSpec).toBeNull();
  });

  test('10 kg exactly → ₱515 (RATE_TABLE)', () => {
    const r = calcJntMindoroShipping({ actualKg: 10 });
    expect(r.billKg).toBe(10);
    expect(r.fee).toBe(515);
    expect(r.tier).toBe('RATE_TABLE');
    expect(r.bagSpec).toBeNull();
  });

  test('50 kg → ₱2915 (RATE_TABLE)', () => {
    const r = calcJntMindoroShipping({ actualKg: 50 });
    expect(r.billKg).toBe(50);
    expect(r.fee).toBe(2915);
    expect(r.tier).toBe('RATE_TABLE');
    expect(r.bagSpec).toBeNull();
  });

  // Volumetric weight tests
  test('volumetric weight wins when greater than actual', () => {
    // 50 * 40 * 30 / 5000 = 12 kg volumetric, actual = 1 kg
    const r = calcJntMindoroShipping({
      actualKg: 1,
      lengthCm: 50,
      widthCm: 40,
      heightCm: 30,
    });
    expect(r.volumetricKg).toBe(12);
    expect(r.chargeableKg).toBe(12);
    expect(r.billKg).toBe(12);
    expect(r.fee).toBe(635); // 12kg → ₱635
  });

  test('actual weight wins when greater than volumetric', () => {
    // 10 * 10 * 10 / 5000 = 0.2 kg volumetric, actual = 5 kg
    const r = calcJntMindoroShipping({
      actualKg: 5,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    });
    expect(r.volumetricKg).toBe(0.2);
    expect(r.chargeableKg).toBe(5);
    expect(r.billKg).toBe(5);
    expect(r.fee).toBe(120); // 5kg → BAG MEDIUM ₱120
    expect(r.tier).toBe('BAG');
  });

  test('no dimensions → volumetricKg = 0', () => {
    const r = calcJntMindoroShipping({ actualKg: 3 });
    expect(r.volumetricKg).toBe(0);
    expect(r.billKg).toBe(3);
    expect(r.fee).toBe(70); // 3kg → BAG SMALL ₱70
    expect(r.tier).toBe('BAG');
  });

  // display format
  test('display includes peso sign and kg', () => {
    const r = calcJntMindoroShipping({ actualKg: 10 });
    expect(r.display).toBe('₱515 (10 kg)');
    expect(r.tier).toBe('RATE_TABLE');
  });
});

// ─── calcJntMindoroShipping — error cases ────────────────────────────────────

describe('calcJntMindoroShipping — errors', () => {
  test('billKg > 50 → MANUAL_QUOTE_REQUIRED', () => {
    expect(() => calcJntMindoroShipping({ actualKg: 51 })).toThrow(ShippingCalcError);
    try {
      calcJntMindoroShipping({ actualKg: 51 });
    } catch (e) {
      expect(e.code).toBe('MANUAL_QUOTE_REQUIRED');
      expect(e.message).toMatch(/50kg/i);
    }
  });

  test('volumetric pushes billKg > 50 → MANUAL_QUOTE_REQUIRED', () => {
    // 200 * 200 * 200 / 5000 = 1600 kg volumetric
    expect(() =>
      calcJntMindoroShipping({
        actualKg: 1,
        lengthCm: 200,
        widthCm: 200,
        heightCm: 200,
      })
    ).toThrow(ShippingCalcError);

    try {
      calcJntMindoroShipping({
        actualKg: 1,
        lengthCm: 200,
        widthCm: 200,
        heightCm: 200,
      });
    } catch (e) {
      expect(e.code).toBe('MANUAL_QUOTE_REQUIRED');
    }
  });

  test('actualKg = 0 → VALIDATION_ERROR', () => {
    expect(() => calcJntMindoroShipping({ actualKg: 0 })).toThrow(ShippingCalcError);
    try {
      calcJntMindoroShipping({ actualKg: 0 });
    } catch (e) {
      expect(e.code).toBe('VALIDATION_ERROR');
    }
  });

  test('negative actualKg → VALIDATION_ERROR', () => {
    expect(() => calcJntMindoroShipping({ actualKg: -1 })).toThrow(ShippingCalcError);
  });

  test('undefined actualKg → VALIDATION_ERROR', () => {
    expect(() => calcJntMindoroShipping({})).toThrow(ShippingCalcError);
  });

  test('NaN actualKg → VALIDATION_ERROR', () => {
    expect(() => calcJntMindoroShipping({ actualKg: NaN })).toThrow(ShippingCalcError);
  });

  test('partial dimensions → VALIDATION_ERROR', () => {
    expect(() =>
      calcJntMindoroShipping({ actualKg: 1, lengthCm: 10, widthCm: 10 })
    ).toThrow(ShippingCalcError);

    try {
      calcJntMindoroShipping({ actualKg: 1, lengthCm: 10, widthCm: 10 });
    } catch (e) {
      expect(e.code).toBe('VALIDATION_ERROR');
    }
  });

  test('negative dimension → VALIDATION_ERROR', () => {
    expect(() =>
      calcJntMindoroShipping({ actualKg: 1, lengthCm: -5, widthCm: 10, heightCm: 10 })
    ).toThrow(ShippingCalcError);
  });
});

// ─── calcShipmentFromItems ───────────────────────────────────────────────────

describe('calcShipmentFromItems', () => {
  test('single item, 3kg x 1 → ₱70 (BAG SMALL)', () => {
    const r = calcShipmentFromItems([{ weightKg: 3, quantity: 1 }]);
    expect(r.billKg).toBe(3);
    expect(r.fee).toBe(70);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('SMALL_LE_3KG');
  });

  test('2 items, 2kg x 2 + 1kg x 1 = 5kg → ₱120 (BAG MEDIUM)', () => {
    const r = calcShipmentFromItems([
      { weightKg: 2, quantity: 2 },
      { weightKg: 1, quantity: 1 },
    ]);
    expect(r.actualKg).toBe(5);
    expect(r.billKg).toBe(5);
    expect(r.fee).toBe(120);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('MEDIUM_LE_5KG');
  });

  test('items totalling 9kg → ₱455 (RATE_TABLE)', () => {
    const r = calcShipmentFromItems([
      { weightKg: 5, quantity: 1 },
      { weightKg: 4, quantity: 1 },
    ]);
    expect(r.billKg).toBe(9);
    expect(r.fee).toBe(455);
    expect(r.tier).toBe('RATE_TABLE');
    expect(r.bagSpec).toBeNull();
  });

  test('volumetric wins across items', () => {
    // Item 1: 0.5kg actual, 50x40x30 = 12kg volumetric x 1
    // Item 2: 0.5kg actual, no dims
    // Total actual = 1kg, total volumetric = 12kg → billKg = 12
    const r = calcShipmentFromItems([
      { weightKg: 0.5, lengthCm: 50, widthCm: 40, heightCm: 30, quantity: 1 },
      { weightKg: 0.5, quantity: 1 },
    ]);
    expect(r.actualKg).toBe(1);
    expect(r.volumetricKg).toBe(12);
    expect(r.billKg).toBe(12);
    expect(r.fee).toBe(635);
    expect(r.tier).toBe('RATE_TABLE');
  });

  test('quantity multiplier on volumetric', () => {
    // 20x20x20 / 5000 = 1.6 kg vol per unit x 3 = 4.8 kg, actual = 0.1 x 3 = 0.3
    // chargeableKg = 4.8, billKg = 5
    const r = calcShipmentFromItems([
      { weightKg: 0.1, lengthCm: 20, widthCm: 20, heightCm: 20, quantity: 3 },
    ]);
    expect(r.volumetricKg).toBe(4.8);
    expect(r.billKg).toBe(5);
    expect(r.fee).toBe(120);
    expect(r.tier).toBe('BAG');
    expect(r.bagSpec).toBe('MEDIUM_LE_5KG');
  });

  test('empty array → VALIDATION_ERROR', () => {
    expect(() => calcShipmentFromItems([])).toThrow(ShippingCalcError);
  });

  test('item missing weightKg → VALIDATION_ERROR', () => {
    expect(() => calcShipmentFromItems([{ quantity: 1 }])).toThrow(ShippingCalcError);
  });

  test('total > 50kg → MANUAL_QUOTE_REQUIRED', () => {
    expect(() =>
      calcShipmentFromItems([{ weightKg: 30, quantity: 2 }])
    ).toThrow(ShippingCalcError);

    try {
      calcShipmentFromItems([{ weightKg: 30, quantity: 2 }]);
    } catch (e) {
      expect(e.code).toBe('MANUAL_QUOTE_REQUIRED');
    }
  });
});

// ─── groupItemsBySeller ──────────────────────────────────────────────────────

describe('groupItemsBySeller', () => {
  const fakeProducts = [
    {
      _id: 'p1',
      name: 'Product A',
      vendorId: 'v1',
      weightKg: 2,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      municipality: 'CALAPAN',
    },
    {
      _id: 'p2',
      name: 'Product B',
      vendorId: 'v1',
      weightKg: 1,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      municipality: 'CALAPAN',
    },
    {
      _id: 'p3',
      name: 'Product C',
      vendorId: 'v2',
      weightKg: 5,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      municipality: 'ROXAS',
    },
  ];

  test('groups items by vendorId', () => {
    const cart = [
      { productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 2 },
      { productId: 'p3', quantity: 1 },
    ];

    const groups = groupItemsBySeller(cart, fakeProducts);

    expect(groups.size).toBe(2);
    expect(groups.has('v1')).toBe(true);
    expect(groups.has('v2')).toBe(true);
    expect(groups.get('v1').items).toHaveLength(2);
    expect(groups.get('v2').items).toHaveLength(1);
  });

  test('sets origin from product municipality', () => {
    const cart = [{ productId: 'p3', quantity: 1 }];
    const groups = groupItemsBySeller(cart, fakeProducts);

    expect(groups.get('v2').origin).toEqual({
      provinceCode: 'ORIENTAL-MINDORO',
      cityCode: 'ROXAS',
    });
  });

  test('items carry quantity from cart', () => {
    const cart = [{ productId: 'p2', quantity: 5 }];
    const groups = groupItemsBySeller(cart, fakeProducts);

    expect(groups.get('v1').items[0].quantity).toBe(5);
  });
});

// ─── Integration: full 1–50 kg sweep with unified pricing ────────────────────

describe('full unified pricing verification (1–50 kg)', () => {
  // Bag tiers: 1–3→70, 4–5→120, 6–8→160
  // Rate table: 9–50
  const expectedFees = {};
  for (let kg = 1; kg <= 3; kg++) expectedFees[kg] = 70;
  for (let kg = 4; kg <= 5; kg++) expectedFees[kg] = 120;
  for (let kg = 6; kg <= 8; kg++) expectedFees[kg] = 160;
  for (let kg = 9; kg <= 50; kg++) expectedFees[kg] = JNT_ORIENTAL_MINDORO_RATE_UP_TO_50KG[kg];

  for (let kg = 1; kg <= 50; kg++) {
    const expectedTier = kg <= 8 ? 'BAG' : 'RATE_TABLE';
    test(`${kg}kg → ₱${expectedFees[kg]} (${expectedTier})`, () => {
      const r = calcJntMindoroShipping({ actualKg: kg });
      expect(r.fee).toBe(expectedFees[kg]);
      expect(r.billKg).toBe(kg);
      expect(r.tier).toBe(expectedTier);
      if (kg <= 8) {
        expect(r.bagSpec).toBeTruthy();
      } else {
        expect(r.bagSpec).toBeNull();
      }
    });
  }
});
