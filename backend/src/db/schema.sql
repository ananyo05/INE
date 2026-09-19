-- ==============================================================================
-- INE Product Price Tracker — Supabase Schema Migration
-- ==============================================================================

-- 1. Enable UUID generation extension if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tracked Products Table
CREATE TABLE IF NOT EXISTS tracked_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_product_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  sku TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for searching and lookup by external_product_id
CREATE INDEX IF NOT EXISTS idx_tracked_products_external_id 
ON tracked_products (external_product_id);

-- 3. Price History Table
-- Records historical prices and stock states for tracked products.
-- CRITICAL INTEGRITY RULE: Never insert rows with null/0/invalid prices.
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for time-series queries and dashboard charts
CREATE INDEX IF NOT EXISTS idx_price_history_product_time 
ON price_history (product_id, scraped_at DESC);

-- 4. Scrape Log Table
-- Audit record of every scrape attempt.
-- Must be transparent and honest, logging successes, retried recoveries, and failures.
CREATE TABLE IF NOT EXISTS scrape_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('success', 'retried', 'failed')),
  http_status INT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL
);

-- Index for querying recent scrape logs per product
CREATE INDEX IF NOT EXISTS idx_scrape_log_product_time 
ON scrape_log (product_id, attempted_at DESC);

-- Enable Row Level Security (RLS) policies for secure public or service access
ALTER TABLE tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_log ENABLE ROW LEVEL SECURITY;

-- Allow public read access to tracked products and history (or service role)
CREATE POLICY "Allow public read on tracked_products" 
ON tracked_products FOR SELECT USING (true);

CREATE POLICY "Allow service_role full access on tracked_products" 
ON tracked_products FOR ALL USING (true);

CREATE POLICY "Allow public read on price_history" 
ON price_history FOR SELECT USING (true);

CREATE POLICY "Allow service_role full access on price_history" 
ON price_history FOR ALL USING (true);

CREATE POLICY "Allow public read on scrape_log" 
ON scrape_log FOR SELECT USING (true);

CREATE POLICY "Allow service_role full access on scrape_log" 
ON scrape_log FOR ALL USING (true);
