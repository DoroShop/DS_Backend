/**
 * ShippingQuote model — persists shipping quotes with a TTL.
 *
 * When a buyer requests a shipping quote at checkout, the result is saved here
 * so that order creation can optionally reference it (quoteId) instead of
 * recalculating from scratch. The TTL index automatically expires documents
 * after 15 minutes.
 */

'use strict';

const mongoose = require('mongoose');

const shippingQuoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    method: {
      type: String,
      required: true,
      enum: ['JNT_MINDORO', 'JNT_BAG'],
      default: 'JNT_MINDORO',
    },
    request: {
      destination: {
        provinceCode: String,
        cityCode: String,
      },
      items: [
        {
          productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
          quantity: Number,
        },
      ],
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    fee: {
      type: Number,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index — Mongo removes docs when expiresAt is reached
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ShippingQuote', shippingQuoteSchema);
