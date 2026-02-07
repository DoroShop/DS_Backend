#!/usr/bin/env node
/**
 * Standalone seed script for J&T shipping rates + Oriental Mindoro addresses.
 *
 * Usage:  node scripts/seedShippingRates.js
 *
 * Idempotent — safe to run multiple times.  Existing documents are skipped;
 * documents with null-fee brackets are patched in-place.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const { ShippingRate, ShippingAddress } = require('../modules/shipping/models');

const CITIES = [
	'BACO', 'BANSUD', 'BONGABONG', 'BULALACAO', 'CALAPAN',
	'GLORIA', 'MANSALAY', 'NAUJAN', 'PINAMALAYAN', 'POLA',
	'PUERTO GALERA', 'ROXAS', 'SAN TEODORO', 'SOCORRO', 'VICTORIA'
];

const BAGS = [
	{ bagSpec: 'SMALL_LE_3KG',  maxKg: 3, fee: 70  },
	{ bagSpec: 'MEDIUM_LE_5KG', maxKg: 5, fee: 120 },
	{ bagSpec: 'BIG_LE_8KG',    maxKg: 8, fee: 160 }
];

async function seedAddresses() {
	let created = 0;
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
			created++;
		}
	}
	return created;
}

async function seedRates() {
	let created = 0;
	let patched = 0;

	for (const bag of BAGS) {
		// Build brackets: 0.5 kg increments, flat fee per bag
		const brackets = [];
		for (let kg = 0.5; kg <= bag.maxKg; kg = parseFloat((kg + 0.5).toFixed(1))) {
			brackets.push({ maxKg: kg, feePhp: bag.fee });
		}

		const existing = await ShippingRate.findOne({
			zone: 'OM_LOCAL',
			serviceType: 'EZ',
			bagSpec: bag.bagSpec,
			'toggles.itemAdditionalFee': false,
			'toggles.itemSize': false
		});

		if (existing) {
			// Patch any null-fee brackets in existing documents
			let dirty = false;
			for (const b of existing.brackets) {
				if (b.feePhp == null) {
					b.feePhp = bag.fee;
					dirty = true;
				}
			}
			if (dirty) {
				existing.lastVerifiedAt = new Date();
				await existing.save();
				patched++;
				console.log(`  ✔ Patched null brackets in ${bag.bagSpec}`);
			} else {
				console.log(`  – ${bag.bagSpec} already up-to-date`);
			}
			continue;
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
		created++;
		console.log(`  ✔ Created ${bag.bagSpec} (fee: ₱${bag.fee})`);
	}

	return { created, patched };
}

async function main() {
	await connectDB();
	console.log('\n── Seeding shipping addresses ──');
	const addrCount = await seedAddresses();
	console.log(`  ${addrCount} address(es) created\n`);

	console.log('── Seeding shipping rates ──');
	const { created, patched } = await seedRates();
	console.log(`\n  ${created} rate(s) created, ${patched} rate(s) patched\n`);

	await mongoose.disconnect();
	console.log('Done.\n');
}

main().catch((err) => {
	console.error('Seed failed:', err);
	process.exit(1);
});
