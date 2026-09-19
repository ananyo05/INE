# DESIGN_NOTE.md — Scraper Reliability & Engineering Trade-offs

## 1. Architectural Decisions & Trade-offs

### Lightweight Fetch vs. Headless Browser (Playwright)
The project brief requires starting with lightweight HTTP fetch + HTML parsing (cheerio) and only adding Playwright for parts of the page that provably require JS rendering.

We conducted an empirical investigation of the target mock store (`https://demo.inelabteamdev.com/`):
- **Raw HTML / SSR**: `GET /` and `GET /product/:id` return an empty client-side React shell (`<div id="root"></div>`) with zero SSR content, zero product metadata, and zero prices.
- **Catalog & Search (`/api/catalog`)**: The mock store exposes a public JSON endpoint (`GET /api/catalog?page=X&pageSize=Y`). For searching and discovering products, we use lightweight HTTP requests via `axios`. This avoids browser overhead entirely, caching 390+ items in memory for sub-millisecond search performance.
- **Price & Stock Gating**: Deep bundle inspection (`assets/index-B9UiQq4X.js`) revealed that the mock store intentionally hides price and stock behind elaborate client-side anti-bot mechanisms:
  1. Mouse movement tracking (`minMoves: 8`, `minDwellMs: 600`) over `.price-block`.
  2. Trusted click verification (`nativeEvent.isTrusted = true`) on the `Reveal price` button. Synthetic `.click()` events are rejected.
  3. Execution of an in-browser WebAssembly challenge (`Cr(...)`) and client proof-of-work algorithm (`xr(...)`).
  4. Ephemeral token acquisition from `/api/session` and subsequent XOR decryption of the encrypted payload from `/api/products/:id/price`.
- **Conclusion**: A headless browser (Playwright) is provably required for price/stock extraction, satisfying the assignment requirement to justify browser automation over lightweight fetch.

---

## 2. Reliability Strategy & Failure Resilience

### 1. Honeypot & Decoy Price Defense
The mock store intentionally injects decoy price elements to fool naive regex or CSS scrapers:
- Hidden decoy 1: `<span class="price-value" aria-hidden="true" style="display: none;">₹1,12,012</span>`
- Strikethrough MRP: `<span class="mr-m4" style="text-decoration: line-through;">₹2,20,332</span>`
- Hidden decoy 2: `<span class="amount" data-price="true" aria-hidden="true" style="display: none;">₹1,31,276</span>`
- **Genuine Price**: Rendered inside the visible `<output class="... pv-m4">` element. Furthermore, the store injects invisible zero-width spaces (`\u200B`) between digits (e.g. `<span>1​</span><span>,​</span><span>4​</span>...`).
- **Our Solution**: The scraper specifically targets `.price-main output`, strips all zero-width characters (`\u200B-\u200D\uFEFF\xA0`), currency symbols, and commas before numeric validation.

### 2. Handling Delayed & Asynchronous Cookie Interception
- The mock store contains a randomized cookie consent banner (`Yr()`) configured with `Gn = 1500, Kn = 5000`. It spawns a full-page backdrop (`.cookie-overlay`) asynchronously between 1.5 and 5 seconds after page load.
- If a scraper moves pointer coordinates or attempts a click while this overlay is active, Playwright's click action is intercepted (`<div class="cookie-overlay">…</div> intercepts pointer events`).
- **Our Solution**: `clearCookieInterference(page)` runs before pointer moves, before clicking the reveal button, and as an automatic recovery mechanism if an interception occurs.

### 3. Pointer Telemetry Emulation
- To satisfy the client-side `Ar` class requirements (`minMoves >= 8` with `minDwellMs >= 600`), the scraper computes the bounding box of `.price-block` and drives the Playwright cursor through 12 incremental coordinates across 780ms of dwell time before awaiting button activation.

### 4. Exponential Backoff & Flakiness Logging
- **Schedule**: Max 3 attempts per product with exponential backoff: 1,000ms (attempt 1 $\rightarrow$ 2) and 3,000ms (attempt 2 $\rightarrow$ 3).
- **Flakiness Visibility**: When a product succeeds on attempt 2 or 3, it is recorded with `status = 'retried'`, providing transparent visibility into store instability.
- **Graceful Batch Isolation**: A failure on one product never aborts the batch loop; each product runs in an isolated browser context.

### 5. Data Integrity Invariants
- `scrape_log` is written unconditionally on every attempt.
- `price_history` is written **only** when a valid, positive numeric price is parsed. Failed or partial scrapes never insert null, zero, or stale rows.
- Validates edge case where products with "Out of stock" badges still expose valid prices; the scraper accurately captures `in_stock = false` alongside the non-zero price.

---

## 3. Honest Post-Mortem: What the AI Got Wrong on First Attempt

### 1. Asynchronous Cookie Overlay Timing
- **Initial Implementation**: The scraper initially checked for a cookie consent button (`button:has-text("Accept")`) immediately after `page.goto()`.
- **Observed Failure Mode**: When running the headed demo, product 329 timed out after 30 seconds with Playwright logging: `<div class="cookie-overlay">…</div> intercepts pointer events`.
- **Root Cause & Resolution**: Reverse-engineering revealed that `Yr()` in `assets/index-B9UiQq4X.js` uses a delayed timer (`window.setTimeout(..., 1500 + Math.random() * 3500)`). The initial synchronous check ran *before* the banner was mounted. It then appeared mid-interaction and intercepted pointer events. Fixed by creating `clearCookieInterference(page)` which proactively clears any delayed overlays before pointer actions and provides click-interception recovery.

### 2. Decoy / Honeypot Price Extraction
- **Initial Implementation**: Looking for standard price selectors like `.price-value` or elements with `data-price="true"`.
- **Observed Failure Mode**: Inspecting the DOM revealed that `.price-value` and `[data-price="true"]` are hidden honeypots containing fake price numbers (`₹1,12,012` and `₹1,31,276`).
- **Root Cause & Resolution**: The genuine price is isolated inside the `<output>` tag within `.price-main` with zero-width spaces (`\u200B`) between digits. Fixed by scoping extraction to `.price-main output` and stripping zero-width characters with regex `replace(/[\u200B-\u200D\uFEFF\xA0]/g, '')`.

---

## 4. Human Tester Reflection (Placeholder)

*(Fill in honestly from testing experience)*

- **Human Tester Observations**:
- **Edge Cases Encountered**:
- **Further Improvements**:
