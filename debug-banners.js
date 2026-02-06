const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/doros');
    console.log('MongoDB connected');
    return conn;
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

// Banner schema (copied from model)
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
    required: true
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
  responsiveSizes: {
    small: String,
    large: String
  }
}, {
  timestamps: true
});

const ProductBanner = mongoose.model('ProductBanner', ProductBannerSchema);

const debugBanners = async () => {
  await connectDB();
  
  console.log('\n=== DEBUGGING BANNERS ===');
  
  // Check all banners
  const allBanners = await ProductBanner.find({});
  console.log(`\n📊 Total banners in database: ${allBanners.length}`);
  
  if (allBanners.length > 0) {
    console.log('\n🔍 All banners:');
    allBanners.forEach((banner, index) => {
      console.log(`\nBanner ${index + 1}:`);
      console.log(`  _id: ${banner._id}`);
      console.log(`  placement: ${banner.placement}`);
      console.log(`  isActive: ${banner.isActive}`);
      console.log(`  title: ${banner.title || 'No title'}`);
      console.log(`  altText: ${banner.altText}`);
      console.log(`  sortOrder: ${banner.sortOrder}`);
      console.log(`  imageUrl: ${banner.imageUrl}`);
      console.log(`  createdAt: ${banner.createdAt}`);
    });
  }
  
  // Check product_page banners specifically
  const productPageBanners = await ProductBanner.find({ placement: 'product_page' });
  console.log(`\n🎯 Product page banners: ${productPageBanners.length}`);
  
  // Check active product_page banners
  const activeProductPageBanners = await ProductBanner.find({ 
    placement: 'product_page', 
    isActive: true 
  });
  console.log(`\n✅ Active product page banners: ${activeProductPageBanners.length}`);
  
  if (activeProductPageBanners.length > 0) {
    console.log('\n📋 Active product page banners details:');
    activeProductPageBanners.forEach((banner, index) => {
      console.log(`  ${index + 1}. ${banner.title || 'Untitled'} (sortOrder: ${banner.sortOrder})`);
    });
  }
  
  // Test the exact query from the controller
  console.log('\n🔍 Testing exact controller query...');
  const controllerQuery = await ProductBanner.find({ 
    placement: 'product_page', 
    isActive: true 
  })
  .sort({ sortOrder: 1, createdAt: -1 })
  .select('imageUrl altText linkUrl title responsiveSizes sortOrder');
  
  console.log(`📦 Controller query result: ${controllerQuery.length} banners`);
  if (controllerQuery.length > 0) {
    console.log('📄 Controller query banners:');
    controllerQuery.forEach((banner, index) => {
      console.log(`  ${index + 1}. Title: ${banner.title || 'No title'}`);
      console.log(`     Alt: ${banner.altText}`);
      console.log(`     Image: ${banner.imageUrl}`);
    });
  }
  
  process.exit(0);
};

debugBanners().catch(console.error);