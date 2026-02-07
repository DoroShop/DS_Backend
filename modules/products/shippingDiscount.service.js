const ShippingDiscount = require("./shippingDiscount.model");
const Product = require("./products.model");
const mongoose = require("mongoose");

function createError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Get all shipping discounts for a vendor (with product info)
 */
async function getVendorShippingDiscounts(vendorId, { activeOnly = false } = {}) {
  const filter = { vendorId };
  if (activeOnly) filter.isActive = true;

  const discounts = await ShippingDiscount.find(filter)
    .populate("productId", "name imageUrls price shippingDiscountType shippingDiscountValue")
    .populate("eligibleCustomers", "name email imageUrl")
    .sort({ createdAt: -1 })
    .lean();

  return discounts;
}

/**
 * Create a new shipping discount
 */
async function createShippingDiscount(vendorId, data) {
  const { productId, discountType, discountValue, audience, eligibleCustomers, startDate, endDate } = data;

  // Verify the product belongs to this vendor
  const product = await Product.findById(productId).select("vendorId name").lean();
  if (!product) throw createError("Product not found", 404);
  if (String(product.vendorId) !== String(vendorId)) {
    throw createError("You do not own this product", 403);
  }

  // Deactivate any existing active discount for this product
  await ShippingDiscount.updateMany(
    { productId, isActive: true },
    { $set: { isActive: false } }
  );

  const discount = await ShippingDiscount.create({
    vendorId,
    productId,
    discountType,
    discountValue,
    audience: audience || "general",
    eligibleCustomers: audience === "specific" ? (eligibleCustomers || []) : [],
    isActive: true,
    startDate: startDate || new Date(),
    endDate: endDate || null,
  });

  // Also sync the product's inline shippingDiscount fields
  await Product.findByIdAndUpdate(productId, {
    shippingDiscountType: discountType,
    shippingDiscountValue: discountValue,
  });

  // Send notifications to eligible customers when audience is "specific"
  if (audience === "specific" && eligibleCustomers && eligibleCustomers.length > 0) {
    try {
      const Vendor = require("../vendors/vendors.model");
      const vendor = await Vendor.findOne({ userId: vendorId }).select("storeName").lean();
      const storeName = vendor?.storeName || "A seller";
      const discountText = discountType === "PERCENT"
        ? `${discountValue}% off`
        : `₱${Number(discountValue).toFixed(2)} off`;

      await notifyCustomers(eligibleCustomers, {
        type: "shipping_discount",
        title: "You got a shipping discount!",
        message: `${storeName} just gave you a special ${discountText} shipping discount on "${product.name}". Check it out!`,
        referenceType: "shipping_discount",
        referenceId: discount._id,
        actionUrl: `/product/${productId}`,
        priority: "medium",
      });
    } catch (notifErr) {
      console.error("[ShippingDiscount] Failed to send notifications:", notifErr);
    }
  }

  return discount.toObject();
}

/**
 * Update an existing shipping discount
 */
async function updateShippingDiscount(vendorId, discountId, data) {
  const discount = await ShippingDiscount.findById(discountId);
  if (!discount) throw createError("Shipping discount not found", 404);
  if (String(discount.vendorId) !== String(vendorId)) {
    throw createError("You do not own this discount", 403);
  }

  const { discountType, discountValue, audience, eligibleCustomers, endDate } = data;

  // Track previously eligible customers so we only notify new ones
  const previousCustomerIds = discount.eligibleCustomers.map((id) => String(id));

  if (discountType) discount.discountType = discountType;
  if (discountValue !== undefined) discount.discountValue = discountValue;
  if (audience) {
    discount.audience = audience;
    discount.eligibleCustomers = audience === "specific" ? (eligibleCustomers || []) : [];
  }
  if (endDate !== undefined) discount.endDate = endDate;

  await discount.save();

  // Sync product's inline fields if discount is still active
  if (discount.isActive) {
    await Product.findByIdAndUpdate(discount.productId, {
      shippingDiscountType: discount.discountType,
      shippingDiscountValue: discount.discountValue,
    });
  }

  // Notify newly added specific customers
  if (audience === "specific" && eligibleCustomers && eligibleCustomers.length > 0) {
    const newCustomerIds = eligibleCustomers.filter(
      (id) => !previousCustomerIds.includes(String(id))
    );
    if (newCustomerIds.length > 0) {
      try {
        const product = await Product.findById(discount.productId).select("name").lean();
        const Vendor = require("../vendors/vendors.model");
        const vendor = await Vendor.findOne({ userId: vendorId }).select("storeName").lean();
        const storeName = vendor?.storeName || "A seller";
        const dType = discount.discountType;
        const dVal = discount.discountValue;
        const discountText = dType === "PERCENT" ? `${dVal}% off` : `₱${Number(dVal).toFixed(2)} off`;

        await notifyCustomers(newCustomerIds, {
          type: "shipping_discount",
          title: "You got a shipping discount!",
          message: `${storeName} just gave you a special ${discountText} shipping discount on "${product?.name}". Check it out!`,
          referenceType: "shipping_discount",
          referenceId: discount._id,
          actionUrl: `/product/${discount.productId}`,
          priority: "medium",
        });
      } catch (notifErr) {
        console.error("[ShippingDiscount] Failed to send update notifications:", notifErr);
      }
    }
  }

  return discount.toObject();
}

/**
 * End (deactivate) a shipping discount
 */
async function endShippingDiscount(vendorId, discountId) {
  const discount = await ShippingDiscount.findById(discountId);
  if (!discount) throw createError("Shipping discount not found", 404);
  if (String(discount.vendorId) !== String(vendorId)) {
    throw createError("You do not own this discount", 403);
  }

  discount.isActive = false;
  discount.endDate = new Date();
  await discount.save();

  // Reset the product's inline shipping discount
  await Product.findByIdAndUpdate(discount.productId, {
    shippingDiscountType: "NONE",
    shippingDiscountValue: 0,
  });

  return discount.toObject();
}

/**
 * Get the active shipping discount for a product (used at checkout)
 * Checks audience eligibility for a specific customer
 */
async function getActiveDiscountForProduct(productId, customerId = null) {
  const discount = await ShippingDiscount.findOne({
    productId,
    isActive: true,
    $or: [
      { endDate: null },
      { endDate: { $gt: new Date() } },
    ],
  }).lean();

  if (!discount) return null;

  // If audience is specific, check if customer is eligible
  if (discount.audience === "specific" && customerId) {
    const isEligible = discount.eligibleCustomers.some(
      (id) => String(id) === String(customerId)
    );
    if (!isEligible) return null;
  } else if (discount.audience === "specific" && !customerId) {
    return null;
  }

  return discount;
}

/**
 * Get vendor's customers (users who have ordered from this vendor)
 * vendorId here = User._id (since products/orders store userId as vendorId)
 */
async function getVendorCustomers(vendorId) {
  const Order = require("../orders/orders.model");

  const customerIds = await Order.distinct("customerId", {
    vendorId: vendorId,
    status: { $ne: "cancelled" },
  });

  const User = require("../users/users.model");
  const customers = await User.find({ _id: { $in: customerIds } })
    .select("name email imageUrl")
    .lean();

  return customers;
}

/**
 * Send notifications to a list of customer IDs
 */
async function notifyCustomers(customerIds, notificationData) {
  const { createNotification } = require("../notifications/notification.service");

  const promises = customerIds.map((customerId) =>
    createNotification({
      userId: customerId,
      ...notificationData,
    }).catch((err) => {
      console.error(`[ShippingDiscount] Notification failed for ${customerId}:`, err.message);
    })
  );

  await Promise.allSettled(promises);
}

module.exports = {
  getVendorShippingDiscounts,
  createShippingDiscount,
  updateShippingDiscount,
  endShippingDiscount,
  getActiveDiscountForProduct,
  getVendorCustomers,
};
