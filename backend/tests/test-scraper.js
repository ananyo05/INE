import { ScraperService } from '../src/services/scraperService.js';
import { repository } from '../src/db/repository.js';

async function runScraperTests() {
  console.log('=== Testing Scraper Service with Retry & Data Integrity ===\n');

  const scraper = new ScraperService({ headless: true });

  // Add 4 test products to repository (3 real, 1 deliberate invalid)
  const testProducts = [
    { external_product_id: '329', name: 'Cobalt Ultrabook Lite', url: 'https://demo.inelabteamdev.com/product/329' },
    { external_product_id: '714', name: 'Summit Approach Shoe S', url: 'https://demo.inelabteamdev.com/product/714' },
    { external_product_id: '112', name: 'Summit Field Monitor Mini', url: 'https://demo.inelabteamdev.com/product/112' },
    { external_product_id: '999999', name: 'Deliberately Invalid Product', url: 'https://demo.inelabteamdev.com/product/999999' }
  ];

  const dbProducts = [];
  for (const p of testProducts) {
    const tracked = await repository.addTrackedProduct(p);
    dbProducts.push(tracked);
  }

  console.log(`Initialized ${dbProducts.length} tracked products in database.\n`);

  // Run scraper against each product
  const results = [];
  for (const product of dbProducts) {
    console.log(`\n========================================`);
    console.log(`Starting scrape for: ${product.name} (ID: ${product.external_product_id})`);
    console.log(`========================================`);
    const res = await scraper.scrapeProduct(product, { recordDb: true });
    results.push(res);
    console.log(`Result: status=${res.status}, price=${res.price}, in_stock=${res.in_stock}, retries=${res.retry_count}, duration=${res.duration_ms}ms`);
  }

  await scraper.closeBrowser();

  // Verification of results & Database integrity
  console.log('\n========================================');
  console.log('Verifying Database Integrity & Log Records');
  console.log('========================================');

  for (const product of dbProducts) {
    const history = await repository.getPriceHistory(product.id);
    const logs = await repository.getScrapeLogs(product.id);

    console.log(`\nProduct ${product.external_product_id} (${product.name}):`);
    console.log(`  Scrape Logs Count: ${logs.length} (Latest Status: ${logs[0]?.status}, Retries: ${logs[0]?.retry_count}, Error: ${logs[0]?.error_message || 'None'})`);
    console.log(`  Price History Count: ${history.length} (Latest Price: ${history[0]?.price || 'None'}, In Stock: ${history[0]?.in_stock})`);

    // Verify invalid product has scrape_log with 'failed' but ZERO price_history entries
    if (product.external_product_id === '999999') {
      if (logs.length === 0 || logs[0].status !== 'failed') {
        throw new Error('Integrity Check Failed: Invalid product must have failed scrape log');
      }
      if (history.length > 0) {
        throw new Error('Integrity Check Failed: Invalid product must NOT have price history rows!');
      }
      console.log('  -> PASSED: Invalid product has honest failed log and 0 price history entries.');
    } else {
      if (history.length === 0 || !history[0].price || history[0].price <= 0) {
        throw new Error(`Integrity Check Failed: Product ${product.external_product_id} must have valid positive price in history`);
      }
      console.log(`  -> PASSED: Valid product has positive price (${history[0].price}) in history.`);
    }
  }

  console.log('\nAll Scraper & Integrity Tests Completed Successfully!');
}

runScraperTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
