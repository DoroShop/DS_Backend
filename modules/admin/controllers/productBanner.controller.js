const ProductBanner = require('../models/productBanner.model');
const { deleteFromCloudinary, deleteBatchFromCloudinary } = require('../../upload/upload.service');

// Get public banners for display (cached endpoint)
const getPublicBanners = async (req, res, next) => {
  try {
    const { placement = 'product_page' } = req.query;
    console.log('[Banner Debug] Fetching banners for placement:', placement);
    
    const banners = await ProductBanner.getActiveBanners(placement)
      .select('imageUrl altText linkUrl title responsiveSizes sortOrder');
    
    console.log('[Banner Debug] Found banners:', banners.length, banners);
    
    res.status(200).json({
      success: true,
      data: {
        banners,
        count: banners.length
      }
    });
  } catch (error) {
    console.error('[Banner Debug] Error fetching banners:', error);
    next(error);
  }
};

// Admin: Get all banners
const getAllBanners = async (req, res, next) => {
  try {
    const { placement } = req.query;
    const filter = placement ? { placement } : {};
    
    const banners = await ProductBanner.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        banners,
        count: banners.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Create banner
const createBanner = async (req, res, next) => {
  try {
    console.log('[Banner Debug] Create banner request body:', req.body);
    console.log('[Banner Debug] Create banner file:', req.file);
    
    const { placement = 'product_page', title, altText, linkUrl, isActive = true } = req.body;
    
    if (!req.file) {
      console.log('[Banner Debug] No file uploaded');
      return res.status(400).json({
        success: false,
        error: 'Banner image is required'
      });
    }

    if (!req.file.secure_url || !req.file.public_id) {
      console.log('[Banner Debug] File missing secure_url or public_id:', req.file);
      return res.status(400).json({
        success: false,
        error: 'Image upload failed - missing URLs'
      });
    }

    // Get next sort order
    const sortOrder = await ProductBanner.getNextSortOrder(placement);
    console.log('[Banner Debug] Next sort order:', sortOrder);

    const bannerData = {
      placement,
      imageUrl: req.file.secure_url,
      publicId: req.file.public_id,
      title,
      altText,
      linkUrl,
      isActive: isActive === 'true' || isActive === true, // Handle string boolean
      sortOrder,
      responsiveSizes: {
        small: req.file.small_url || req.file.secure_url,
        large: req.file.large_url || req.file.secure_url
      }
    };
    
    console.log('[Banner Debug] Creating banner with data:', bannerData);

    const banner = await ProductBanner.create(bannerData);
    console.log('[Banner Debug] Created banner:', banner);

    res.status(201).json({
      success: true,
      data: { banner }
    });
  } catch (error) {
    console.error('[Banner Debug] Create banner error:', error);
    next(error);
  }
};

// Admin: Update banner
const updateBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const banner = await ProductBanner.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { banner }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Reorder banners
const reorderBanners = async (req, res, next) => {
  try {
    const { banners } = req.body; // Array of { id, sortOrder }

    if (!Array.isArray(banners)) {
      return res.status(400).json({
        success: false,
        error: 'Banners array is required'
      });
    }

    // Update sort orders
    const updatePromises = banners.map(({ id, sortOrder }) =>
      ProductBanner.findByIdAndUpdate(id, { sortOrder })
    );

    await Promise.all(updatePromises);

    res.status(200).json({
      success: true,
      message: 'Banners reordered successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Delete banner
const deleteBanner = async (req, res, next) => {
  try {
    const { id } = req.params;

    const banner = await ProductBanner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found'
      });
    }

    // Delete from Cloudinary
    if (banner.publicId) {
      try {
        await deleteFromCloudinary(banner.publicId);
      } catch (cloudinaryError) {
        console.error('[Banner Delete] Cloudinary deletion failed:', cloudinaryError);
        // Continue with DB deletion even if Cloudinary fails
      }
    }

    // Delete from database
    await ProductBanner.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Banner deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Toggle banner active status
const toggleBannerStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const banner = await ProductBanner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found'
      });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    res.status(200).json({
      success: true,
      data: { banner }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPublicBanners,
  getAllBanners,
  createBanner,
  updateBanner,
  reorderBanners,
  deleteBanner,
  toggleBannerStatus
};