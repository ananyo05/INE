import { catalogService } from '../src/services/catalogService.js';

async function runSearchTests() {
  console.log('=== Testing Product Search against Mock Store ===\n');

  // Test 1: Search by brand/keyword "Cobalt"
  console.log('Test 1: Searching for "Cobalt"...');
  const cobaltResults = await catalogService.search('Cobalt');
  console.log(`Found ${cobaltResults.length} matches for "Cobalt".`);
  if (cobaltResults.length > 0) {
    console.log('Sample result:', cobaltResults[0]);
  } else {
    throw new Error('Test 1 Failed: Expected matches for "Cobalt"');
  }

  // Test 2: Search by category "Laptops"
  console.log('\nTest 2: Searching for "Laptops"...');
  const laptopResults = await catalogService.search('Laptops');
  console.log(`Found ${laptopResults.length} matches for "Laptops".`);
  if (laptopResults.length === 0) {
    throw new Error('Test 2 Failed: Expected matches for "Laptops"');
  }

  // Test 3: Search by exact product ID "329"
  console.log('\nTest 3: Direct lookup by ID "329"...');
  const directResults = await catalogService.search('329');
  console.log(`Found ${directResults.length} result(s) for "329":`, directResults[0]?.name);
  if (!directResults[0] || directResults[0].external_product_id !== '329') {
    throw new Error('Test 3 Failed: Expected product 329');
  }

  // Test 4: Direct lookup by full product URL
  console.log('\nTest 4: Direct lookup by URL "https://demo.inelabteamdev.com/product/329"...');
  const urlResults = await catalogService.search('https://demo.inelabteamdev.com/product/329');
  console.log(`Found ${urlResults.length} result(s) by URL:`, urlResults[0]?.name);
  if (!urlResults[0] || urlResults[0].external_product_id !== '329') {
    throw new Error('Test 4 Failed: Expected product 329 by URL');
  }

  console.log('\nAll Search Tests Passed Successfully!');
}

runSearchTests().catch((err) => {
  console.error('Search test failed:', err);
  process.exit(1);
});
