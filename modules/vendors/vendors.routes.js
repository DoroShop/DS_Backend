// vendor.route.js
const express = require("express");
const router = express.Router();
const vendorController = require("./vendors.controller");
const { protect, restrictTo } = require("../../auth/auth.controller");
const { requireFeature } = require("../../middleware/requireFeature");

router.post(
	"/",
	protect,
	restrictTo("user", "admin"),
	vendorController.createVendor
);
router.post("/follow/:vendorId", protect, vendorController.followVendor);
router.get("/", protect, vendorController.getVendor);
router.get("/featured", vendorController.getFeaturedVendor);
router.get("/featured-subscribed", vendorController.getFeaturedSubscribedVendors);
router.put(
	"/",
	protect,
	restrictTo("vendor", "admin"),
	vendorController.updateVendor
);
router.delete("/", protect, restrictTo("admin"), vendorController.deleteVendor);

// Pinned products (subscription benefit)
router.get("/pinned-products", protect, restrictTo("vendor"), vendorController.getPinnedProducts);
router.post("/pin-product", protect, restrictTo("vendor"), requireFeature(), vendorController.pinProduct);
router.delete("/pin-product/:productId", protect, restrictTo("vendor"), requireFeature(), vendorController.unpinProduct);

router.get("/:vendorId/details", vendorController.getVendorDetails);

// Analytics routes
router.post("/profile-view/:id", vendorController.trackProfileView);
router.post("/product-click/:id", vendorController.trackProductClick);

// Monthly revenue routes
router.post(
	"/reset-monthly-revenue",
	protect,
	restrictTo("vendor", "admin"),
	vendorController.resetMonthlyRevenue
);
router.post(
	"/batch-reset-monthly-revenue",
	protect,
	restrictTo("admin"),
	vendorController.batchResetMonthlyRevenue
);

// Financial/Commission routes for vendor dashboard
router.get(
	"/financials",
	protect,
	restrictTo("vendor", "admin"),
	vendorController.getVendorFinancials
);
router.get(
	"/pending-commissions",
	protect,
	restrictTo("vendor", "admin"),
	vendorController.getVendorPendingCODCommissions
);

module.exports = router;
