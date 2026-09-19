import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.TARGET_STORE_URL || 'https://demo.inelabteamdev.com';

// In-memory catalog cache
let cachedCatalog = [];
let lastFetchedAt = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch catalog items from target store with caching.
 * Fetches multiple pages to build a rich search index.
 */
async function getFullCatalog(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedCatalog.length > 0 && now - lastFetchedAt < CACHE_TTL_MS) {
    return cachedCatalog;
  }

  try {
    const allItems = [];
    // Fetch up to 10 pages of 60 items (600 items), which covers diverse categories
    const pagesToFetch = [1, 2, 3, 4, 5, 6, 7, 8];
    
    const results = await Promise.allSettled(
      pagesToFetch.map((page) =>
        axios.get(`${BASE_URL}/api/catalog?page=${page}&pageSize=60`, {
          timeout: 8000,
          headers: { 'User-Agent': 'INEPriceTracker/1.0' }
        })
      )
    );

    for (const res of results) {
      if (res.status === 'fulfilled' && res.value.data?.items) {
        allItems.push(...res.value.data.items);
      }
    }

    if (allItems.length > 0) {
      // Deduplicate by product ID
      const seen = new Set();
      cachedCatalog = allItems.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      lastFetchedAt = now;
      console.log(`[Catalog] Cached ${cachedCatalog.length} catalog products from mock store.`);
    }

    return cachedCatalog;
  } catch (error) {
    console.error('[Catalog Error] Failed to fetch catalog:', error.message);
    return cachedCatalog; // return whatever we have
  }
}

export const catalogService = {
  /**
   * Search catalog products by query string, or retrieve by exact ID/URL.
   */
  async search(query) {
    const q = (query || '').trim().toLowerCase();

    // 1. If query is a URL or pure number, attempt direct product lookup
    const urlMatch = q.match(/product\/(\d+)/i);
    const directId = urlMatch ? urlMatch[1] : /^\d+$/.test(q) ? q : null;

    if (directId) {
      const product = await this.getProductById(directId);
      if (product) {
        return [product];
      }
    }

    // 2. Fetch catalog and filter by query terms
    const catalog = await getFullCatalog();
    if (!q) {
      // Return first 20 products if query is empty
      return catalog.slice(0, 20).map(formatProduct);
    }

    const matches = catalog.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const brand = (item.brand || '').toLowerCase();
      const category = (item.category || '').toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();

      return (
        name.includes(q) ||
        brand.includes(q) ||
        category.includes(q) ||
        sku.includes(q) ||
        desc.includes(q)
      );
    });

    return matches.slice(0, 30).map(formatProduct);
  },

  /**
   * Fetch a single product's metadata directly by external ID
   */
  async getProductById(externalId) {
    try {
      const res = await axios.get(`${BASE_URL}/api/product/${externalId}`, {
        timeout: 8000,
        headers: { 'User-Agent': 'INEPriceTracker/1.0' }
      });
      if (res.data && res.data.id) {
        return formatProduct(res.data);
      }
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      // Check cache as fallback
      const found = cachedCatalog.find((i) => String(i.id) === String(externalId));
      return found ? formatProduct(found) : null;
    }
  }
};

function formatProduct(item) {
  return {
    external_product_id: String(item.id),
    name: item.name,
    brand: item.brand || null,
    category: item.category || null,
    sku: item.sku || null,
    description: item.description || null,
    url: `${BASE_URL}/product/${item.id}`
  };
}
