const mongoose = require("mongoose");

/**
 * ShippingDiscount – vendor-managed shipping discount offers.
 * 
 * Each discount is tied to a specific product and can be:
 *  - "general"   → applies to ALL customers
 *  - "specific"  → applies only to a hand-picked list of customers (loyal buyers)
 *
 * discountType: FIXED  → flat ₱ off the shipping fee
 *               PERCENT → percentage off the shipping fee
 */
const ShippingDiscountSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    discountType: {
      type: String,
      enum: ["FIXED", "PERCENT"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function (v) {
          if (this.discountType === "PERCENT") return v <= 100;
          return true;
        },
        message: "Percentage discount cannot exceed 100%",
      },
    },
    // "general" = all customers, "specific" = only listed customers
    audience: {
      type: String,
      enum: ["general", "specific"],
      default: "general",
    },
    // Only used when audience === "specific"
    eligibleCustomers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null, // null = no expiry
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one active discount per product
ShippingDiscountSchema.index(
  { productId: 1, isActive: 1 },
  { name: "product_active_discount" }
);

// Vendor lookup
ShippingDiscountSchema.index(
  { vendorId: 1, isActive: 1, createdAt: -1 },
  { name: "vendor_discounts" }
);

module.exports = mongoose.model("ShippingDiscount", ShippingDiscountSchema);
