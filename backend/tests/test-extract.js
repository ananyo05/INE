import { chromium } from 'playwright';

function parsePriceFromOutput(text) {
  if (!text) return null;
  // Remove zero-width spaces, commas, whitespace, and currency symbols
  const cleaned = text
    .replace(/[\u200B-\u200D\uFEFF\xA0]/g, '')
    .replace(/[₹$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

function parseStock(stockText, classList = '') {
  const lower = (stockText || '').toLowerCase();
  const classes = (classList || '').toLowerCase();

  if (classes.includes('out-of-stock') || lower.includes('out of stock') || lower.includes('sold out')) {
    return false;
  }
  if (classes.includes('in-stock') || lower.includes('in stock') || lower.includes('left') || lower.includes('selling fast')) {
    return true;
  }
  // Default to true if ambiguous
  return true;
}

async function testExtraction() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const productIds = [329, 714, 112];

  for (const id of productIds) {
    console.log(`\n--- Testing Product ${id} ---`);
    await page.goto(`https://demo.inelabteamdev.com/product/${id}`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    
    // Cookie banner
    const cookieBtn = await page.$('button:has-text("Accept"), button:has-text("Allow")');
    if (cookieBtn) await cookieBtn.click().catch(() => {});

    // Hover moves
    const priceBlock = await page.waitForSelector('.price-block, button[aria-label="Reveal price"]', { timeout: 10000 });
    const box = await priceBlock.boundingBox();
    if (box) {
      for (let i = 0; i <= 10; i++) {
        await page.mouse.move(box.x + (box.width * i) / 10, box.y + box.height / 2);
        await page.waitForTimeout(70);
      }
    }

    const revealBtn = await page.waitForSelector('button[aria-label="Reveal price"]:not([disabled])', { timeout: 6000 });
    await revealBtn.click();

    // Wait for success or error
    await page.waitForSelector('.price-block.price-success, .price-block.price-error', { timeout: 8000 });

    const isSuccess = await page.$('.price-block.price-success');
    if (isSuccess) {
      // Extract output
      const rawOutput = await page.$eval('.price-main output', el => el.innerText).catch(() => null);
      const parsedPrice = parsePriceFromOutput(rawOutput);

      const stockBadge = await page.$('.stock-badge');
      const stockText = stockBadge ? await stockBadge.innerText() : '';
      const stockClasses = stockBadge ? await stockBadge.getAttribute('class') : '';
      const inStock = parseStock(stockText, stockClasses);

      console.log(`Success for Product ${id}:`);
      console.log(`  Raw output text: "${rawOutput}"`);
      console.log(`  Parsed Numeric Price: ${parsedPrice} INR`);
      console.log(`  Stock Badge Text: "${stockText}"`);
      console.log(`  In Stock: ${inStock}`);
    } else {
      const errorMsg = await page.$eval('.price-error .price-substatus', el => el.innerText).catch(() => 'Unknown error');
      console.log(`Error for Product ${id}: ${errorMsg}`);
    }
  }

  await browser.close();
}

testExtraction().catch(console.error);
