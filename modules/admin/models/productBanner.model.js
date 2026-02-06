const mongoose = require('mongoose');

const ProductBannerSchema = new mongoose.Schema({
  placement: {
    type: String,
    required: true,
    enum: ['product_page', 'home_hero', 'category_top'],
    default: 'product_page'
  },
  imageUrl: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true // Cloudinary public_id for deletion
  },
  title: {
    type: String,
    trim: true
  },
  altText: {
    type: String,
    required: true,
    trim: true
  },
  linkUrl: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  // Responsive sizes for different screen sizes
  responsiveSizes: {
    small: String, // 1280x720
    large: String  // 1920x1080
  }
}, {
  timestamps: true
});

// Index for efficient queries
ProductBannerSchema.index({ placement: 1, isActive: 1, sortOrder: 1 });
ProductBannerSchema.index({ placement: 1, sortOrder: 1 });

// Virtual for getting active banners sorted
ProductBannerSchema.statics.getActiveBanners = function(placement = 'product_page') {
  return this.find({ 
    placement, 
    isActive: true 
  }).sort({ sortOrder: 1, createdAt: -1 });
};

// Method to get next sort order for a placement
ProductBannerSchema.statics.getNextSortOrder = async function(placement = 'product_page') {
  const lastBanner = await this.findOne({ placement })
    .sort({ sortOrder: -1 });
  return lastBanner ? lastBanner.sortOrder + 1 : 1;
};

const ProductBanner = mongoose.model('ProductBanner', ProductBannerSchema);

module.exports = ProductBanner;