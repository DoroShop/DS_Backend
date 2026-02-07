/*
  Seed script: Oriental Mindoro shipping addresses.
  Inserts the 15 municipalities of Oriental Mindoro into the ShippingAddress
  collection. Idempotent — skips addresses that already exist.

  Run from project root:
    node scripts/seed_oriental_mindoro_addresses.js
*/

require('dotenv').config();
const mongoose   = require('mongoose');
const connectDB  = require('../config/db');
const { ShippingAddress } = require('../modules/shipping/models');

const PROVINCE_CODE = 'ORIENTAL-MINDORO';

const CITIES = [
  'BACO',
  'BANSUD',
  'BONGABONG',
  'BULALACAO',
  'CALAPAN',
  'GLORIA',
  'MANSALAY',
  'NAUJAN',
  'PINAMALAYAN',
  'POLA',
  'PUERTO GALERA',
  'ROXAS',
  'SAN TEODORO',
  'SOCORRO',
  'VICTORIA'
];

/**
 * Title-case helper: "PUERTO GALERA" → "Puerto Galera"
 */
function titleCase(str) {
  return str
    .toLowerCase()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

(async () => {
  try {
    await connectDB();
    console.log('Connected to DB — seeding Oriental Mindoro addresses…');

    let created = 0;
    let skipped = 0;

    for (const city of CITIES) {
      const exists = await ShippingAddress.findOne({
        provinceCode: PROVINCE_CODE,
        cityCode: city
      });

      if (exists) {
        skipped++;
        console.log(`  ⏭  ${city} — already exists`);
        continue;
      }

      await ShippingAddress.create({
        provinceCode: PROVINCE_CODE,
        cityCode: city,
        displayName: `${titleCase(city)}, Oriental Mindoro`,
        isActive: true
      });

      created++;
      console.log(`  ✅ ${city} — created`);
    }

    console.log(`\nSeed complete: ${created} created, ${skipped} skipped (already existed).`);
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
})();
