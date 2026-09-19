import { Router } from 'express';
import { repository } from '../db/repository.js';
import { scraperService } from '../services/scraperService.js';
import dotenv from 'dotenv';

dotenv.config();

export const scrapeRouter = Router();

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Middleware to verify cron secret token.
 * Accepts header Authorization: Bearer <CRON_SECRET> or x-cron-secret: <CRON_SECRET>.
 */
function verifyCronSecret(req, res, next) {
  // If no secret configured in environment, allow with warning in dev mode
  if (!CRON_SECRET || CRON_SECRET === 'your-secure-cron-secret-token') {
    console.warn('[Security Warning] CRON_SECRET not configured or default. Request permitted.');
    return next();
  }

  const authHeader = req.headers.authorization;
  const customHeader = req.headers['x-cron-secret'];

  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (customHeader) {
    token = customHeader.trim();
  }

  if (!token || token !== CRON_SECRET) {
    console.warn('[Security] Unauthorized scrape run attempt rejected.');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing cron secret token'
    });
  }

  next();
}

/**
 * POST /api/scrape/run
 * Scheduled batch scraping endpoint.
 * Iterates through all tracked products, scrapes each with retry, and returns summary.
 */
scrapeRouter.post('/run', verifyCronSecret, async (req, res) => {
  const startTime = Date.now();
  console.log('[Scraper Run] Starting scheduled batch scrape...');

  try {
    const products = await repository.getAllTrackedProducts();

    if (products.length === 0) {
      return res.json({
        success: true,
        message: 'No tracked products found to scrape.',
        total: 0,
        succeeded: 0,
        retried: 0,
        failed: 0,
        duration_ms: Date.now() - startTime,
        results: []
      });
    }

    console.log(`[Scraper Run] Processing ${products.length} tracked products sequentially...`);

    const results = [];
    let succeededCount = 0;
    let retriedCount = 0;
    let failedCount = 0;

    for (const product of products) {
      try {
        const result = await scraperService.scrapeProduct(product, { recordDb: true });
        results.push(result);

        if (result.status === 'success') succeededCount++;
        else if (result.status === 'retried') retriedCount++;
        else failedCount++;
      } catch (itemErr) {
        console.error(`[Scraper Run] Critical error on product ${product.external_product_id}:`, itemErr.message);
        failedCount++;
        results.push({
          product_id: product.id,
          external_product_id: product.external_product_id,
          status: 'failed',
          error_message: itemErr.message,
          retry_count: 3,
          duration_ms: 0
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[Scraper Run] Completed in ${totalDuration}ms: ${succeededCount} succeeded, ${retriedCount} retried, ${failedCount} failed.`);

    res.json({
      success: true,
      total: products.length,
      succeeded: succeededCount,
      retried: retriedCount,
      failed: failedCount,
      duration_ms: totalDuration,
      results
    });
  } catch (err) {
    console.error('[Scraper Run Fatal Error]:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      duration_ms: Date.now() - startTime
    });
  }
});
