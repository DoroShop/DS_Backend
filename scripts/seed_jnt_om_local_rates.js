/*
  Seed script: J&T Oriental-Mindoro LOCAL shipping rates.
  Creates 3 rate documents (SMALL / MEDIUM / BIG bags) for zone OM_LOCAL,
  each with 0.5 kg increment brackets. Only the 1.0 kg bracket has a
  verified fee; all other brackets are feePhp = null (to be filled by admin).

  Idempotent — skips rates that already exist for the same
  zone + serviceType + bagSpec + toggles combination.

  Run from project root:
    node scripts/seed_jnt_om_local_rates.js
*/

require('dotenv').config();
const mongoose  = require('mongoose');
const connectDB = require('../config/db');
const { ShippingRate } = require('../modules/shipping/models');

const ZONE         = 'OM_LOCAL';
const SERVICE_TYPE = 'EZ';
const TOGGLES      = { itemAdditionalFee: false, itemSize: false };

const BAGS = [
  { bagSpec: 'SMALL_LE_3KG',  maxKg: 3, verifiedFee: 70  },
  { bagSpec: 'MEDIUM_LE_5KG', maxKg: 5, verifiedFee: 120 },
  { bagSpec: 'BIG_LE_8KG',    maxKg: 8, verifiedFee: 160 }
];

/**
 * Build brackets array with 0.5 kg increments up to maxKg.
 * Only the 1.0 kg bracket gets the verified fee; others are null.
 */
function buildBrackets(maxKg, verifiedFee) {
  const brackets = [];
  for (let kg = 0.5; kg <= maxKg; kg = parseFloat((kg + 0.5).toFixed(1))) {
    brackets.push({
      maxKg: kg,
      feePhp: kg === 1.0 ? verifiedFee : null
    });
  }
  return brackets;
}

(async () => {
  try {
    await connectDB();
    console.log('Connected to DB — seeding J&T OM_LOCAL rates…');

    let created = 0;
    let skipped = 0;

    for (const bag of BAGS) {
      const exists = await ShippingRate.findOne({
        zone: ZONE,
        serviceType: SERVICE_TYPE,
        bagSpec: bag.bagSpec,
        'toggles.itemAdditionalFee': TOGGLES.itemAdditionalFee,
        'toggles.itemSize': TOGGLES.itemSize
      });

      if (exists) {
        skipped++;
        console.log(`  ⏭  ${bag.bagSpec} — already exists`);
        continue;
      }

      const brackets = buildBrackets(bag.maxKg, bag.verifiedFee);

      await ShippingRate.create({
        zone: ZONE,
        serviceType: SERVICE_TYPE,
        toggles: TOGGLES,
        bagSpec: bag.bagSpec,
        maxKg: bag.maxKg,
        brackets,
        lastVerifiedAt: new Date(),
        isActive: true
      });

      created++;
      console.log(`  ✅ ${bag.bagSpec} (max ${bag.maxKg} kg, verified fee ₱${bag.verifiedFee} @ 1.0 kg) — created`);
      console.log(`     └─ ${brackets.length} brackets (0.5 kg increments)`);
    }

    console.log(`\nSeed complete: ${created} rate(s) created, ${skipped} skipped (already existed).`);
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
})();
