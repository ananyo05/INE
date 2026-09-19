import { chromium } from 'playwright';
import { repository } from '../db/repository.js';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.TARGET_STORE_URL || 'https://demo.inelabteamdev.com';
const MAX_ATTEMPTS = 3;
const BACKOFF_DELAYS = [1000, 3000, 8000]; // 1s, 3s, 8s

/**
 * Clean and parse raw price string.
 * Strips zero-width characters (\u200B, \uFEFF, etc.), currency marks, and commas.
 */
export function parsePrice(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText
    .replace(/[\u200B-\u200D\uFEFF\xA0]/g, '')
    .replace(/[₹$,\s]/g, '');
  const num = parseFloat(cleaned);
  return !isNaN(num) && num > 0 ? num : null;
}

/**
 * Determine stock status from text and badge classes.
 */
export function parseStock(stockText, classList = '') {
  const lower = (stockText || '').toLowerCase();
  const classes = (classList || '').toLowerCase();

  if (classes.includes('out-of-stock') || lower.includes('out of stock') || lower.includes('sold out')) {
    return false;
  }
  if (classes.includes('in-stock') || lower.includes('in stock') || lower.includes('left') || lower.includes('selling fast')) {
    return true;
  }
  return true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dismiss any asynchronous cookie banner/overlay spawned by the mock store
 */
async function clearCookieInterference(page) {
  try {
    await page.evaluate(() => {
      const overlays = document.querySelectorAll('.cookie-overlay, .cookie-banner');
      if (overlays.length > 0) {
        overlays.forEach((el) => el.remove());
        document.body.style.overflow = 'auto';
      }
    });
  } catch {
    // Ignore DOM errors if page is navigating
  }
}

export class ScraperService {
  constructor(options = {}) {
    this.headless = options.headless ?? (process.env.HEADLESS !== 'false');
    this.slowMo = options.slowMo ?? 0;
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.headless,
        slowMo: this.slowMo,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  /**
   * Scrapes a single product with exponential retry/backoff,
   * enforces data integrity, and records transparent scrape logs.
   *
   * @param {Object} product - { id, external_product_id, url, name }
   * @param {Object} options - { recordDb: boolean }
   * @returns {Promise<Object>} - Scrape result object
   */
  async scrapeProduct(product, options = { recordDb: true }) {
    const startTime = Date.now();
    const externalId = String(product.external_product_id || product.id);
    const productUrl = product.url || `${BASE_URL}/product/${externalId}`;

    let lastError = null;
    let httpStatus = null;
    let successfulAttempt = null;
    let scrapedPrice = null;
    let inStock = true;

    await this.initBrowser();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const retryIndex = attempt - 1;
      let context = null;
      let page = null;

      try {
        console.log(`[Scraper] Product ${externalId} (${product.name || 'Unknown'}): Attempt ${attempt}/${MAX_ATTEMPTS}...`);

        context = await this.browser.newContext({
          viewport: { width: 1280, height: 800 },
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        page = await context.newPage();

        // 1. Navigate to product page
        const response = await page.goto(productUrl, {
          timeout: 15000,
          waitUntil: 'domcontentloaded'
        });

        httpStatus = response ? response.status() : null;

        if (httpStatus === 404) {
          throw new Error(`Product not found (HTTP 404) at ${productUrl}`);
        }
        if (httpStatus >= 500) {
          throw new Error(`Mock store server error (HTTP ${httpStatus})`);
        }

        // 2. Clear any active or delayed cookie interference
        await clearCookieInterference(page);

        // 3. Wait for price container
        const priceBlock = await page.waitForSelector('.price-block, button[aria-label="Reveal price"]', {
          timeout: 10000
        });

        if (!priceBlock) {
          throw new Error('Price block element not found in DOM');
        }

        // 4. Simulate human pointer telemetry over the price area
        // Mock store requires: minMoves >= 8, minDwellMs >= 600
        const box = await priceBlock.boundingBox();
        if (box) {
          const moveSteps = 12;
          for (let step = 0; step <= moveSteps; step++) {
            await clearCookieInterference(page);
            const x = box.x + (box.width * step) / moveSteps;
            const y = box.y + box.height / 2 + Math.sin(step) * 4;
            await page.mouse.move(x, y);
            await page.waitForTimeout(65); // 12 * 65ms = ~780ms dwell
          }
        }

        // 5. Ensure any delayed cookie dialog is removed before clicking
        await clearCookieInterference(page);

        // 6. Wait for Reveal button to become enabled
        const revealBtn = await page.waitForSelector('button[aria-label="Reveal price"]:not([disabled])', {
          timeout: 5000
        });

        if (!revealBtn) {
          throw new Error('Reveal price button did not become enabled after dwell');
        }

        // 7. Click Reveal price with native pointer click
        await clearCookieInterference(page);
        try {
          await revealBtn.click({ timeout: 6000 });
        } catch (clickErr) {
          // If click was intercepted by overlay, purge it and retry click
          console.warn('[Scraper Notice] Click intercepted, clearing overlay and retrying click...');
          await clearCookieInterference(page);
          await revealBtn.click({ timeout: 6000, force: true });
        }

        // 8. Wait for outcome: either .price-success or .price-error
        // Note: Mock store's Xn() randomly introduces a 900ms delay or retry requirement
        await page.waitForSelector('.price-block.price-success, .price-block.price-error', {
          timeout: 10000
        });

        // 9. Check if store displayed an error
        const isError = await page.$('.price-block.price-error');
        if (isError) {
          const errMsg = await page.$eval('.price-error .price-substatus', (el) => el.innerText).catch(() => 'Store price error');
          throw new Error(`Store returned error: ${errMsg}`);
        }

        // 10. Extract valid price from <output> inside .price-main (ignoring decoy spans)
        const rawOutput = await page.$eval('.price-main output', (el) => el.innerText).catch(() => null);
        const parsed = parsePrice(rawOutput);

        if (!parsed || parsed <= 0) {
          throw new Error(`Malformed or missing price in output element: "${rawOutput}"`);
        }

        // 11. Extract stock badge
        const stockBadge = await page.$('.stock-badge');
        const stockText = stockBadge ? await stockBadge.innerText() : '';
        const stockClasses = stockBadge ? await stockBadge.getAttribute('class') : '';
        const stockStatus = parseStock(stockText, stockClasses);

        // Scrape succeeded!
        scrapedPrice = parsed;
        inStock = stockStatus;
        successfulAttempt = attempt;
        console.log(`[Scraper] Success on attempt ${attempt} for product ${externalId}: ₹${parsed} (In stock: ${inStock})`);
        break;

      } catch (err) {
        lastError = err;
        console.warn(`[Scraper Warning] Attempt ${attempt}/${MAX_ATTEMPTS} failed for product ${externalId}: ${err.message}`);

        if (attempt < MAX_ATTEMPTS) {
          const delay = BACKOFF_DELAYS[retryIndex] || 2000;
          console.log(`[Scraper] Backing off for ${delay}ms before attempt ${attempt + 1}...`);
          await sleep(delay);
        }
      } finally {
        if (context) {
          await context.close().catch(() => {});
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const isSuccess = scrapedPrice !== null;
    const retryCount = successfulAttempt ? successfulAttempt - 1 : MAX_ATTEMPTS - 1;
    const status = !isSuccess ? 'failed' : retryCount > 0 ? 'retried' : 'success';

    const result = {
      product_id: product.id || null,
      external_product_id: externalId,
      status,
      price: scrapedPrice,
      currency: 'INR',
      in_stock: inStock,
      http_status: httpStatus,
      error_message: isSuccess ? null : (lastError ? lastError.message : 'Unknown scrape failure'),
      retry_count: retryCount,
      duration_ms: durationMs,
      attempted_at: new Date().toISOString()
    };

    // Database persistence & integrity enforcement
    if (options.recordDb && product.id) {
      try {
        // ALWAYS insert into scrape_log
        await repository.insertScrapeLog({
          product_id: product.id,
          attempted_at: result.attempted_at,
          status: result.status,
          http_status: result.http_status,
          error_message: result.error_message,
          retry_count: result.retry_count,
          duration_ms: result.duration_ms
        });

        // ONLY insert into price_history when price is a validated positive number
        if (isSuccess && result.price > 0) {
          await repository.insertPriceHistory({
            product_id: product.id,
            price: result.price,
            currency: result.currency,
            in_stock: result.in_stock,
            scraped_at: result.attempted_at
          });
        }
      } catch (dbErr) {
        console.error(`[DB Error] Failed to persist scrape result for ${externalId}:`, dbErr.message);
      }
    }

    return result;
  }
}

export const scraperService = new ScraperService();
