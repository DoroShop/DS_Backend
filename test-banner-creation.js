const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Test banner creation endpoint
const testBannerCreation = async () => {
  try {
    console.log('🔍 Testing banner creation endpoint...\n');
    
    // First check if we can reach the public banner endpoint
    try {
      const publicResponse = await axios.get('http://localhost:3001/v1/product-banners?placement=product_page');
      console.log('✅ Public banner endpoint accessible');
      console.log('📊 Current banners:', publicResponse.data);
    } catch (error) {
      console.log('❌ Public banner endpoint error:', error.message);
    }
    
    // Create a simple test image buffer (1x1 pixel PNG)
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);

    // Create form data
    const form = new FormData();
    form.append('image', testImageBuffer, {
      filename: 'test-banner.png',
      contentType: 'image/png'
    });
    form.append('placement', 'product_page');
    form.append('title', 'Test Banner');
    form.append('altText', 'Test banner alt text');
    form.append('isActive', 'true');

    console.log('\n🔨 Attempting to create banner...');
    
    // Note: This will fail because we don't have admin auth, but it will show us what's happening with the route
    const createResponse = await axios.post(
      'http://localhost:3001/v1/admin/product-banners',
      form,
      {
        headers: {
          ...form.getHeaders(),
          // We don't have a valid admin token, so this will fail auth
          // But we can see if the route is accessible
        }
      }
    );

    console.log('✅ Banner creation successful:', createResponse.data);

  } catch (error) {
    if (error.response) {
      console.log('📄 Response status:', error.response.status);
      console.log('📄 Response data:', error.response.data);
      
      if (error.response.status === 401) {
        console.log('✅ Route is accessible (authentication required as expected)');
      } else if (error.response.status === 404) {
        console.log('❌ Route not found - there may be a routing issue');
      } else {
        console.log('⚠️  Other error - status:', error.response.status);
      }
    } else {
      console.log('❌ Network error:', error.message);
    }
  }
};

// Run the test
testBannerCreation();