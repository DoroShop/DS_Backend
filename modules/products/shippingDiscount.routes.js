const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../../auth/auth.controller");
const shippingDiscountService = require("./shippingDiscount.service");

/**
 * GET /v1/shipping-discounts
 * Get all shipping discounts for the authenticated vendor
 */
router.get("/", protect, restrictTo("vendor"), async (req, res, next) => {
  try {
    const vendorId = req.user.id; // products store userId as vendorId
    const activeOnly = req.query.active === "true";
    const discounts = await shippingDiscountService.getVendorShippingDiscounts(vendorId, { activeOnly });
    res.json({ success: true, data: discounts });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/shipping-discounts/customers
 * Get vendor's customers (users who have ordered from them)
 */
router.get("/customers", protect, restrictTo("vendor"), async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const customers = await shippingDiscountService.getVendorCustomers(vendorId);
    res.json({ success: true, data: customers });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/shipping-discounts
 * Create a new shipping discount
 */
router.post("/", protect, restrictTo("vendor"), async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const discount = await shippingDiscountService.createShippingDiscount(vendorId, req.body);
    res.status(201).json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /v1/shipping-discounts/:id
 * Update a shipping discount
 */
router.put("/:id", protect, restrictTo("vendor"), async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const discount = await shippingDiscountService.updateShippingDiscount(vendorId, req.params.id, req.body);
    res.json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /v1/shipping-discounts/:id/end
 * End (deactivate) a shipping discount
 */
router.patch("/:id/end", protect, restrictTo("vendor"), async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const discount = await shippingDiscountService.endShippingDiscount(vendorId, req.params.id);
    res.json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/shipping-discounts/product/:productId
 * Public: get active discount for a product (used at checkout)
 */
router.get("/product/:productId", async (req, res, next) => {
  try {
    const customerId = req.user?.id || null;
    const discount = await shippingDiscountService.getActiveDiscountForProduct(
      req.params.productId,
      customerId
    );
    res.json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
