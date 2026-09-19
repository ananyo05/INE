import { ScraperService } from '../src/services/scraperService.js';
import { repository } from '../src/db/repository.js';

// ANSI colors for clean terminal recording
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

async function runHeadedScraper() {
  console.log(bold(cyan('\n======================================================================')));
  console.log(bold(cyan('  INE Mock Store Price Tracker — Headed Mode Scraper Demo')));
  console.log(bold(cyan('  Target: https://demo.inelabteamdev.com/')));
  console.log(bold(cyan('======================================================================\n')));
  console.log('Launching visible Chromium browser with pointer emulation (slowMo: 120ms)...\n');

  // Initialize scraper in HEADED mode with slowMo so actions are visually visible
  const scraper = new ScraperService({
    headless: false,
    slowMo: 120
  });

  const demoProducts = [
    {
      external_product_id: '329',
      name: 'Cobalt Ultrabook Lite',
      category: 'Laptops',
      url: 'https://demo.inelabteamdev.com/product/329',
      scenario: 'Standard product (In Stock, Success on attempt 1)'
    },
    {
      external_product_id: '714',
      name: 'Summit Approach Shoe S',
      category: 'Footwear',
      url: 'https://demo.inelabteamdev.com/product/714',
      scenario: 'Edge case (Out of Stock, tests in_stock detection with valid price)'
    },
    {
      external_product_id: '999999',
      name: 'Deliberate Invalid Target',
      category: 'Test/Fail',
      url: 'https://demo.inelabteamdev.com/product/999999',
      scenario: 'Failure case (Deliberate 404/not-found to demonstrate 3x retry + backoff)'
    }
  ];

  const results = [];

  for (let i = 0; i < demoProducts.length; i++) {
    const p = demoProducts[i];
    console.log(bold(`\n[Product ${i + 1}/${demoProducts.length}] ${p.name} (ID: ${p.external_product_id})`));
    console.log(`  Scenario: ${yellow(p.scenario)}`);
    console.log(`  URL: ${p.url}`);

    // Persist to database if not already present
    const tracked = await repository.addTrackedProduct(p);

    const startTime = Date.now();
    const result = await scraper.scrapeProduct(tracked, { recordDb: true });
    const duration = Date.now() - startTime;

    results.push({ ...result, name: p.name, scenario: p.scenario });

    if (result.status === 'success') {
      console.log(green(`  ✔ Outcome: SUCCESS`));
      console.log(`  Price: ₹${result.price.toLocaleString('en-IN')}`);
      console.log(`  Stock: ${result.in_stock ? green('IN STOCK') : red('OUT OF STOCK')}`);
      console.log(`  Retries: ${result.retry_count}`);
      console.log(`  Duration: ${duration}ms`);
    } else if (result.status === 'retried') {
      console.log(yellow(`  ⚡ Outcome: RETRIED (Recovered after flakiness)`));
      console.log(`  Price: ₹${result.price.toLocaleString('en-IN')}`);
      console.log(`  Stock: ${result.in_stock ? green('IN STOCK') : red('OUT OF STOCK')}`);
      console.log(`  Retries: ${result.retry_count}`);
      console.log(`  Duration: ${duration}ms`);
    } else {
      console.log(red(`  ✖ Outcome: FAILED (Honest failure logged after 3 attempts)`));
      console.log(`  Error: ${result.error_message}`);
      console.log(`  Price History Inserted: ${red('NONE (Integrity Enforced)')}`);
      console.log(`  Duration: ${duration}ms`);
    }
  }

  await scraper.closeBrowser();

  // Final Summary Table
  console.log(bold(cyan('\n======================================================================')));
  console.log(bold(cyan('  Headed Scraping Run Summary')));
  console.log(bold(cyan('======================================================================')));
  console.table(
    results.map((r) => ({
      ID: r.external_product_id,
      Name: r.name,
      Status: r.status,
      Price: r.price ? `₹${r.price}` : 'N/A',
      Stock: r.price ? (r.in_stock ? 'In Stock' : 'Out of Stock') : 'N/A',
      Retries: r.retry_count,
      Duration: `${r.duration_ms}ms`
    }))
  );

  console.log(green('\n✔ Headed mode execution finished successfully!'));
  console.log('You can use this terminal log and the visible browser window for your recording.\n');
}

runHeadedScraper().catch((err) => {
  console.error(red('Headed run encountered fatal error:'), err);
  process.exit(1);
});
