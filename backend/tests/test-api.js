import axios from 'axios';
import http from 'http';

const BASE_URL = 'http://localhost:5001';

async function testApi() {
  console.log('=== Running Backend API Integration Tests ===\n');

  // 1. Health check
  console.log('1. Testing GET /health...');
  const healthRes = await axios.get(`${BASE_URL}/health`);
  console.log('Health response:', healthRes.data);
  if (healthRes.data.status !== 'ok') throw new Error('Health check failed');

  // 2. Search
  console.log('\n2. Testing GET /api/products/search?q=blender...');
  const searchRes = await axios.get(`${BASE_URL}/api/products/search?q=blender`);
  console.log(`Found ${searchRes.data.count} items matching "blender"`);
  if (!searchRes.data.success || searchRes.data.count === 0) throw new Error('Search failed');

  const itemToTrack = searchRes.data.data[0];
  console.log('Item to track:', itemToTrack.name, `(ID: ${itemToTrack.external_product_id})`);

  // 3. Track product
  console.log('\n3. Testing POST /api/products/track...');
  const trackRes = await axios.post(`${BASE_URL}/api/products/track`, {
    external_product_id: itemToTrack.external_product_id,
    name: itemToTrack.name,
    url: itemToTrack.url,
    brand: itemToTrack.brand,
    category: itemToTrack.category,
    sku: itemToTrack.sku
  });
  console.log('Track response:', trackRes.data);
  const trackedProduct = trackRes.data.data;
  if (!trackedProduct.id) throw new Error('Track product failed');

  // 4. List tracked products
  console.log('\n4. Testing GET /api/products...');
  const listRes = await axios.get(`${BASE_URL}/api/products`);
  console.log(`Found ${listRes.data.count} tracked product(s)`);
  if (listRes.data.count === 0) throw new Error('List tracked products failed');

  // 5. Test cron-triggered scrape run
  console.log('\n5. Testing POST /api/scrape/run...');
  const scrapeRunRes = await axios.post(
    `${BASE_URL}/api/scrape/run`,
    {},
    {
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET || 'your-secure-cron-secret-token'}`
      },
      timeout: 60000
    }
  );
  console.log('Scrape run summary:', {
    total: scrapeRunRes.data.total,
    succeeded: scrapeRunRes.data.succeeded,
    retried: scrapeRunRes.data.retried,
    failed: scrapeRunRes.data.failed,
    duration_ms: scrapeRunRes.data.duration_ms
  });
  if (!scrapeRunRes.data.success) throw new Error('Scrape run failed');

  // 6. Test GET /api/products/:id/history
  console.log(`\n6. Testing GET /api/products/${trackedProduct.id}/history...`);
  const historyRes = await axios.get(`${BASE_URL}/api/products/${trackedProduct.id}/history`);
  console.log(`Found ${historyRes.data.count} price history row(s):`, historyRes.data.data);
  if (historyRes.data.count === 0) throw new Error('Price history expected');

  // 7. Test GET /api/products/:id/log
  console.log(`\n7. Testing GET /api/products/${trackedProduct.id}/log...`);
  const logRes = await axios.get(`${BASE_URL}/api/products/${trackedProduct.id}/log`);
  console.log(`Found ${logRes.data.count} scrape log row(s):`, logRes.data.data);
  if (logRes.data.count === 0) throw new Error('Scrape log expected');

  console.log('\nALL API ENDPOINTS TESTED AND VERIFIED SUCCESSFULLY!');
}

testApi().catch((err) => {
  console.error('API Test Error:', err.response?.data || err.message);
  process.exit(1);
});
