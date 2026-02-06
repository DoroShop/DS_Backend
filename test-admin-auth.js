const axios = require('axios');

const testAdminAuth = async () => {
  try {
    // First, let's test with a simple GET request to the admin banners endpoint
    console.log('🔍 Testing admin authentication...\n');
    
    // This should return 401 since we don't have a token
    const response = await axios.get('http://localhost:3001/v1/admin/product-banners');
    console.log('Unexpected success:', response.data);
    
  } catch (error) {
    if (error.response) {
      console.log('📊 Response status:', error.response.status);
      console.log('📊 Response data:', error.response.data);
      
      if (error.response.status === 401) {
        console.log('✅ Admin endpoint requires authentication (correct behavior)');
        console.log('🔍 Next: Check if your admin token is valid in the frontend');
        console.log('\n📝 To debug in frontend:');
        console.log('1. Open browser console on admin banner page');
        console.log('2. Check: localStorage.getItem("authStore")');
        console.log('3. Verify user role is "admin"');
        console.log('4. Check if token is not expired');
      } else {
        console.log('❌ Unexpected error status:', error.response.status);
      }
    } else {
      console.log('❌ Network error:', error.message);
    }
  }
};

testAdminAuth();