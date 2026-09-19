# PLAN.md — Product Price Tracker Architecture & Implementation Plan

## 1. Overview
This document outlines the architecture, database schema, scraping strategy, retry mechanism, and build plan for the **Product Price Tracker** web application monitoring the mock e-commerce store at `https://demo.inelabteamdev.com/`.

---

## 2. Scraping Strategy & Justification (Lightweight Fetch vs. Playwright)

The project brief dictates:
> *"start with lightweight HTTP fetch + HTML parsing (cheerio). Only add Playwright for parts of the page that provably require JS rendering — check first whether the data is present in the raw HTML/initial payload before reaching for a headless browser. Justify whichever you pick in PLAN.md."*

### Empirical Findings:
1. **Raw HTML Inspection**:
   - `GET https://demo.inelabteamdev.com/` and `GET https://demo.inelabteamdev.com/product/:id` return a bare HTML shell (`<div id="root"></div>`) with no server-side rendered (SSR) markup, no product names, no prices, and no stock status.
2. **Catalog & Search (Lightweight HTTP Fetch)**:
   - The mock store exposes a public JSON endpoint: `GET /api/catalog?page=X&pageSize=Y`.
   - This endpoint returns catalog items containing `id`, `slug`, `name`, `brand`, `category`, `sku`, and `description`.
   - **Decision**: Product search will use lightweight, high-performance `axios`/`fetch` HTTP requests directly against this endpoint without spinning up a browser.
3. **Price & Stock Scrape (Playwright Browser Automation)**:
   - Deep inspection of the client bundle (`assets/index-B9UiQq4X.js`) revealed that the mock store intentionally protects price data:
     - The product API (`/api/product/:id`) contains specifications and reviews, but **omits price and stock**.
     - Price extraction requires solving an anti-bot interaction challenge:
       - User pointer telemetry tracking (`minMoves: 8`, `minDwellMs: 600` over `.price-block`).
       - A trusted user click event (`nativeEvent.isTrusted = true`) on the `Reveal price` button.
       - Execution of an in-browser WebAssembly challenge (`Cr(...)`) and client proof-of-work (`xr(...)`).
       - Obtaining a session token to fetch an encrypted payload from `/api/products/:id/price`, which is XOR-decrypted client-side.
   - **Decision**: Playwright is provably required for price/stock extraction. Lightweight HTML scrapers (cheerio, plain fetch) cannot extract price or stock from this mock store because the data does not exist in the initial HTML or unauthenticated public endpoints.

---

## 3. Database Schema (Supabase / Postgres)

The system requires three relational tables: `tracked_products`, `price_history`, and `scrape_log`.

### SQL Definition

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. tracked_products
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

-- 2. price_history
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  price NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  in_stock BOOLEAN NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying history by product and time
CREATE INDEX IF NOT EXISTS idx_price_history_product_time 
ON price_history (product_id, scraped_at DESC);

-- 3. scrape_log
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

-- Index for querying logs by product
CREATE INDEX IF NOT EXISTS idx_scrape_log_product_time 
ON scrape_log (product_id, attempted_at DESC);
```

### Data Integrity Rules:
- **Never insert invalid prices**: A row is inserted into `price_history` only if a validated, positive numeric price is scraped. If scraping fails or produces null/malformed data, no record is added to `price_history`.
- **Honest scrape logging**: Every single attempt writes a record to `scrape_log` regardless of success or failure.
- **Flakiness visibility**: Successful scrapes requiring 1 or more retries are logged with `status = 'retried'`, giving transparent insight into store flakiness.

---

## 4. Retry Strategy & Scraper Resilience

The mock store exhibits artificial network latency, 429 rate limits, and asynchronous UI delays.

### Scraper Lifecycle per Product:
1. **Max Retries**: 3 attempts (Initial attempt + up to 2 retries).
2. **Backoff Schedule**: Exponential backoff with jitter:
   - Attempt 1 failure $\rightarrow$ wait 1,000ms.
   - Attempt 2 failure $\rightarrow$ wait 3,000ms.
   - Attempt 3 failure $\rightarrow$ wait 8,000ms.
3. **In-Browser Handling**:
   - Navigate to `https://demo.inelabteamdev.com/product/${external_id}` with a 20-second timeout.
   - Handle and dismiss cookie consent if present (`button:has-text("Accept")`).
   - Locate the price container (`.price-block`).
   - Simulate realistic pointer movement over the container: execute at least 10 discrete mouse moves and dwell for 800ms.
   - Wait for the button (`button[aria-label="Reveal price"]`) to become enabled.
   - Click the button.
   - Poll / wait for price element to populate (e.g. text containing `₹` or numeric format) or error banner (`.price-error`) to appear.
4. **Error Classification**:
   - Distinguish transient failures (timeouts, 5xx responses, rate limits) from permanent unavailability ("Out of Stock" or "Price genuinely unavailable").
   - If the store displays an out-of-stock badge with a valid price, stock is marked `false`, and price is recorded.
   - If the price cannot be revealed after retries, log `status = 'failed'` with the exact error message and do not abort the remaining queue.

---

## 5. Express API Specifications

- `GET /api/products/search?q=:query`: Searches mock store catalog via `/api/catalog` and filters by query string.
- `POST /api/products/track`: Adds a product `{ external_product_id, url, name, brand, category, sku }` to `tracked_products`. Immediately triggers an initial background scrape.
- `GET /api/products`: Lists all tracked products along with their most recent price, stock status, and last scrape time.
- `GET /api/products/:id/history`: Returns price and stock time-series history for a product.
- `GET /api/products/:id/log`: Returns scrape attempt logs for a product.
- `POST /api/scrape/run`: Cron-triggered batch scrape endpoint.
  - Protected with `Authorization: Bearer <CRON_SECRET>`.
  - Iterates over all tracked products sequentially with rate limiting.
  - Returns a detailed execution summary: total, succeeded, retried, failed, duration.

---

## 6. Headed-Mode Script (`npm run scrape:headed`)

A standalone CLI script in `backend/scripts/scrape-headed.js`:
- Launches Chromium with `{ headless: false, slowMo: 100 }`.
- Scrapes 3 representative products:
  1. A standard product.
  2. A second product with differing category.
  3. A deliberately failing or high-latency test case (or simulated invalid ID).
- Outputs clear formatted terminal logs of the step-by-step interaction.
- Suitable for screen recording.

---

## 7. Incremental Build Order
1. **Scaffold & Schema**: Setup `backend/` and `frontend/` projects, write migration SQL and Supabase client.
2. **Catalog Search**: Implement and test `/api/products/search` against `https://demo.inelabteamdev.com/api/catalog`.
3. **Scraper Core**: Implement Playwright-based single-product scraper with retry/backoff, tested against real products.
4. **Scrape Schedule Runner**: Build `POST /api/scrape/run` with batch loop and secret protection.
5. **Read Endpoints**: Implement `/api/products`, `/api/products/:id/history`, `/api/products/:id/log`.
6. **Frontend Dashboard**: Build React + Vite UI with search/track dialog, product list cards, Recharts price history chart, and scrape log table.
7. **Headed-Mode Runner**: Create `npm run scrape:headed` for visual demonstration.
8. **Documentation**: Write comprehensive `README.md` and `DESIGN_NOTE.md`.
