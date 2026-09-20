# INE Product Price Tracker

A full-stack price/stock tracking application that monitors product listings on a mock e-commerce store, scraping price and availability data on a schedule and surfacing it through a web UI.

Built for the INE Software Engineer Intern take-home assignment.

> **Note on process:** this system was built and debugged against the real target site and real deployment infrastructure, not just tested once locally. `DESIGN_NOTE.md` documents four real issues found this way — including one (randomized CSS class names used to defeat scraping) that only surfaced as an inconsistent ~75% success rate under repeated testing, not as an outright failure. That document is worth reading alongside this one for the full picture of what was actually verified versus assumed.

## Live URLs

- **Frontend (Vercel):** https://ine-gold.vercel.app 
- **Backend API (Render):** https://ine-assignment-mzr9.onrender.com
- **GitHub repo:** https://github.com/ananyo05/INE
- **Screen recording (headed scrape run):** https://drive.google.com/drive/folders/1CPRTEBuz-rAz2QL4U33JKr1znLvpO7M7?usp=sharing 
## What it does

- Search a product catalog and track products of interest
- Periodically (every 2 hours, via a scheduled cron job) re-scrape each tracked product's live price and stock status from the mock store
- Store a full price history per product in Postgres (Supabase), so price changes over time are queryable
- Log every scrape attempt — success, retry, or failure — for transparency and debugging
- Handle scraping failures gracefully with retries and exponential backoff, rather than silently dropping data or crashing

## Why Playwright, not a lightweight HTTP fetch

The mock store (`https://demo.inelabteamdev.com`) does not serve price or stock data in the initial HTML response. Price is deliberately locked behind a client-side "Reveal price" interaction that requires:

1. Simulated human pointer movement over the price area (the store enforces a minimum number of mouse moves and a minimum dwell time before the "Reveal price" button becomes clickable — this is a bot-detection measure)
2. Clicking the "Reveal price" button, which triggers a client-side WASM-based unlock routine before the real price is rendered

None of this is observable via a plain HTTP GET — the price literally doesn't exist in the DOM (or in any API response) until a real browser executes this interaction. This is why the backend uses Playwright to drive a real (headless) Chromium browser rather than a lightweight scraper — it's a requirement of the target site's design, not a shortcut or over-engineering.

## Architecture

```
frontend/   React + Vite SPA — search, track, and view product price history
backend/    Express API — catalog search, tracked-product management, Playwright-based scraper
```

- **Backend** deployed on Render (root directory `backend`)
- **Frontend** deployed on Vercel (root directory `frontend`)
- **Database:** Supabase (Postgres) — stores tracked products, `price_history`, and `scrape_log`
- **Scheduler:** an external cron service (cron-job.org) calls a protected backend endpoint every 2 hours to trigger a batch scrape of all tracked products

## Setup

### Backend

```bash
cd backend
npm install
npx playwright install chromium
npm start
```

Environment variables (`backend/.env`):

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase service key (accepts both legacy `eyJ...` JWT format and new `sb_secret_...` format) |
| `CRON_SECRET` | Shared secret required to trigger `/api/scrape/run`; generate with `openssl rand -hex 32` |
| `TARGET_STORE_URL` | Base URL of the store being scraped (defaults to the mock store) |
| `PORT` | Port the server listens on (defaults to `5001`) |

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Environment variables (`frontend/.env` or the hosting platform's env settings):

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Full base URL of the backend API, including the `/api` suffix, e.g. `https://ine-assignment-mzr9.onrender.com/api` |

### Render-specific configuration

- **Build Command:** `npm install && npx playwright install chromium`
- **Start Command:** `npm start`
- **Root Directory:** `backend`
- Additional environment variable required for Playwright's browser to be found at runtime: `PLAYWRIGHT_BROWSERS_PATH=0` (installs the browser binary inside `node_modules`, which persists into the runtime container, rather than an external cache path that does not)

### Vercel-specific configuration

- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Environment variable:** `VITE_API_BASE_URL` set to the Render backend URL + `/api`

## Scheduled scraping

A cron job (configured via cron-job.org) sends an authenticated `POST` request to:

```
https://ine-assignment-mzr9.onrender.com/api/scrape/run
Authorization: Bearer <CRON_SECRET>
```

every 2 hours, triggering a full batch re-scrape of all tracked products.

A second, unauthenticated endpoint — `POST /api/scrape/trigger-manual` — exists for the frontend's manual "refresh now" button. It runs the same underlying batch-scrape logic but deliberately does **not** require the cron secret, since that secret must never be exposed to the browser (see the security note in DESIGN_NOTE.md).

## Testing

From `backend/`:

```bash
npm run test:search    # catalog search endpoint tests
npm run test:scraper   # scraper unit/integration tests
```

Both run against a real Supabase connection.

## Demonstration recording

`backend/scripts/scrape-headed.js` runs the scraper in headed (visible browser) mode against three scenarios:

- Product `329` — a successful scrape
- Product `714` — a successful scrape of an out-of-stock item
- Product `999999` — a deliberately invalid product ID, demonstrating honest failure handling (retries, then logs a clean failure with zero fabricated data)

```bash
cd backend
npm run scrape:headed
```

See the recording linked at the top of this document.
