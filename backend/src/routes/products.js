import { Router } from 'express';
import { catalogService } from '../services/catalogService.js';
import { repository } from '../db/repository.js';
import { scraperService } from '../services/scraperService.js';

export const productsRouter = Router();

/**
 * GET /api/products/search?q=...
 * Proxies and searches the mock store catalog.
 */
productsRouter.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const results = await catalogService.search(query);
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    console.error('[API Error] Product search failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/products/track
 * Body: { external_product_id, url, name, brand, category, sku }
 * Adds product to tracked list and triggers an initial scrape.
 */
productsRouter.post('/track', async (req, res) => {
  try {
    const { external_product_id, url, name, brand, category, sku } = req.body;

    if (!external_product_id) {
      return res.status(400).json({ success: false, error: 'external_product_id is required' });
    }

    // If name is missing, attempt to fetch metadata from catalog
    let productName = name;
    let productUrl = url;
    let productBrand = brand;
    let productCategory = category;
    let productSku = sku;

    if (!productName) {
      const meta = await catalogService.getProductById(external_product_id);
      if (meta) {
        productName = meta.name;
        productUrl = productUrl || meta.url;
        productBrand = productBrand || meta.brand;
        productCategory = productCategory || meta.category;
        productSku = productSku || meta.sku;
      } else {
        productName = `Product ${external_product_id}`;
      }
    }

    const tracked = await repository.addTrackedProduct({
      external_product_id: String(external_product_id),
      url: productUrl || `https://demo.inelabteamdev.com/product/${external_product_id}`,
      name: productName,
      brand: productBrand,
      category: productCategory,
      sku: productSku
    });

    // Trigger initial scrape asynchronously in the background so the user gets immediate UI response
    scraperService.scrapeProduct(tracked, { recordDb: true }).catch((err) => {
      console.error(`[Scraper Background] Initial scrape failed for ${tracked.external_product_id}:`, err.message);
    });

    res.status(201).json({ success: true, data: tracked });
  } catch (err) {
    console.error('[API Error] Track product failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/products
 * Returns list of all tracked products with their latest price, in_stock status, and last scrape time.
 */
productsRouter.get('/', async (req, res) => {
  try {
    const products = await repository.getAllTrackedProducts();
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    console.error('[API Error] Get products failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/products/:id/history
 * Returns historical price records for a tracked product.
 */
productsRouter.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await repository.getPriceHistory(id);
    res.json({ success: true, count: history.length, data: history });
  } catch (err) {
    console.error(`[API Error] Get history failed for ${req.params.id}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/products/:id/log
 * Returns scrape logs for a tracked product.
 */
productsRouter.get('/:id/log', async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await repository.getScrapeLogs(id);
    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    console.error(`[API Error] Get logs failed for ${req.params.id}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
