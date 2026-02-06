const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/productBanner.controller');
const { protect, restrictTo } = require('../../../auth/auth.controller');
const { uploadBanner, bannerUploadHandler } = require('../../upload/upload.service');

router.use(protect);
router.use(restrictTo('admin'));

// GET /api/admin/product-banners - Get all banners for admin management
router.get('/', bannerController.getAllBanners);

// POST /api/admin/product-banners - Create new banner with image upload
router.post('/', 
  uploadBanner.single('image'), 
  bannerUploadHandler,
  bannerController.createBanner
);

// PUT /api/admin/product-banners/:id - Update banner metadata
router.put('/:id', bannerController.updateBanner);

// PATCH /api/admin/product-banners/reorder - Reorder banners
router.patch('/reorder', bannerController.reorderBanners);

// PATCH /api/admin/product-banners/:id/toggle - Toggle active status
router.patch('/:id/toggle', bannerController.toggleBannerStatus);

// DELETE /api/admin/product-banners/:id - Delete banner and image
router.delete('/:id', bannerController.deleteBanner);

module.exports = router;