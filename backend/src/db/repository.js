import { supabase, isSupabaseConfigured } from './supabase.js';
import { randomUUID } from 'crypto';

// In-memory store used when Supabase credentials are not configured
const memoryStore = {
  tracked_products: [],
  price_history: [],
  scrape_log: []
};

export const repository = {
  async getAllTrackedProducts() {
    if (isSupabaseConfigured) {
      const { data: products, error } = await supabase
        .from('tracked_products')
        .select(`
          id,
          external_product_id,
          url,
          name,
          category,
          brand,
          sku,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch the latest price and last scrape log for each product
      const enriched = await Promise.all(
        products.map(async (p) => {
          const [priceRes, logRes] = await Promise.all([
            supabase
              .from('price_history')
              .select('price, currency, in_stock, scraped_at')
              .eq('product_id', p.id)
              .order('scraped_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('scrape_log')
              .select('status, attempted_at, duration_ms, retry_count')
              .eq('product_id', p.id)
              .order('attempted_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          ]);

          return {
            ...p,
            latest_price: priceRes.data ? priceRes.data.price : null,
            currency: priceRes.data ? priceRes.data.currency : 'INR',
            in_stock: priceRes.data ? priceRes.data.in_stock : null,
            last_scraped_at: logRes.data ? logRes.data.attempted_at : null,
            last_scrape_status: logRes.data ? logRes.data.status : null
          };
        })
      );

      return enriched;
    }

    // In-memory fallback
    return memoryStore.tracked_products.map((p) => {
      const prices = memoryStore.price_history
        .filter((ph) => ph.product_id === p.id)
        .sort((a, b) => new Date(b.scraped_at) - new Date(a.scraped_at));
      const logs = memoryStore.scrape_log
        .filter((l) => l.product_id === p.id)
        .sort((a, b) => new Date(b.attempted_at) - new Date(a.attempted_at));

      const latestPrice = prices[0] || null;
      const latestLog = logs[0] || null;

      return {
        ...p,
        latest_price: latestPrice ? latestPrice.price : null,
        currency: latestPrice ? latestPrice.currency : 'INR',
        in_stock: latestPrice ? latestPrice.in_stock : null,
        last_scraped_at: latestLog ? latestLog.attempted_at : null,
        last_scrape_status: latestLog ? latestLog.status : null
      };
    });
  },

  async getTrackedProductById(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    return memoryStore.tracked_products.find((p) => p.id === id) || null;
  },

  async getTrackedProductByExternalId(externalId) {
    const extStr = String(externalId);
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .select('*')
        .eq('external_product_id', extStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    return memoryStore.tracked_products.find((p) => p.external_product_id === extStr) || null;
  },

  async addTrackedProduct({ external_product_id, url, name, category, brand, sku }) {
    const extStr = String(external_product_id);
    const existing = await this.getTrackedProductByExternalId(extStr);
    if (existing) {
      return existing;
    }

    const newProduct = {
      id: randomUUID(),
      external_product_id: extStr,
      url: url || `https://demo.inelabteamdev.com/product/${extStr}`,
      name,
      category: category || null,
      brand: brand || null,
      sku: sku || null,
      created_at: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .insert([newProduct])
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    memoryStore.tracked_products.push(newProduct);
    return newProduct;
  },

  async insertPriceHistory({ product_id, price, currency = 'INR', in_stock = true, scraped_at }) {
    // CRITICAL INTEGRITY RULE: Never insert rows with null/0/invalid prices.
    const numPrice = Number(price);
    if (!numPrice || isNaN(numPrice) || numPrice <= 0) {
      throw new Error(`Data Integrity Violation: Refusing to write invalid price (${price}) to price_history`);
    }

    const row = {
      id: randomUUID(),
      product_id,
      price: numPrice,
      currency,
      in_stock: Boolean(in_stock),
      scraped_at: scraped_at || new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('price_history')
        .insert([row])
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    memoryStore.price_history.push(row);
    return row;
  },

  async insertScrapeLog({
    product_id,
    attempted_at,
    status,
    http_status = null,
    error_message = null,
    retry_count = 0,
    duration_ms = 0
  }) {
    if (!['success', 'retried', 'failed'].includes(status)) {
      throw new Error(`Invalid scrape_log status: ${status}. Must be success, retried, or failed.`);
    }

    const row = {
      id: randomUUID(),
      product_id,
      attempted_at: attempted_at || new Date().toISOString(),
      status,
      http_status,
      error_message,
      retry_count,
      duration_ms
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('scrape_log')
        .insert([row])
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    memoryStore.scrape_log.push(row);
    return row;
  },

  async getPriceHistory(productId, limit = 50) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('product_id', productId)
        .order('scraped_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return data || [];
    }

    return memoryStore.price_history
      .filter((ph) => ph.product_id === productId)
      .sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at))
      .slice(-limit);
  },

  async getScrapeLogs(productId, limit = 50) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('scrape_log')
        .select('*')
        .eq('product_id', productId)
        .order('attempted_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    }

    return memoryStore.scrape_log
      .filter((l) => l.product_id === productId)
      .sort((a, b) => new Date(b.attempted_at) - new Date(a.attempted_at))
      .slice(0, limit);
  }
};
