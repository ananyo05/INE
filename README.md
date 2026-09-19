# INE Product Price Tracker

A resilient, production-grade full-stack web application that monitors product price and stock availability on the mock e-commerce store [https://demo.inelabteamdev.com/](https://demo.inelabteamdev.com/) via scheduled and on-demand scraping. Built with a focus on scraper reliability, anti-bot interaction bypass, honest audit logging, and data integrity.

---

## 📌 Deliverable Links (Fill in Once Deployed)
- **GitHub Repository URL**: `[PASTE_GITHUB_REPO_URL_HERE]`
- **Live Frontend (Vercel)**: `[PASTE_VERCEL_FRONTEND_URL_HERE]`
- **Live Backend (Render)**: `[PASTE_RENDER_BACKEND_URL_HERE]`
- **Screen Recording (Headed Mode Video)**: `[PASTE_SCREEN_RECORDING_LINK_HERE]`

---

## 🏗 System Architecture & Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, Recharts, Lucide Icons | Responsive obsidian/slate dark dashboard with real-time catalog search, price history charts, and scrape audit logs |
| **Backend** | Node.js (ESM), Express.js, Playwright | REST API, catalog search proxy, batch scraper with exponential backoff and pointer telemetry emulation |
| **Database** | Supabase (PostgreSQL) | Managed Postgres accessed via `@supabase/supabase-js` with foreign keys, check constraints, and RLS policies |
| **Scheduling** | cron-job.org (or external webhook) | Protected HTTP `POST /api/scrape/run` trigger every 2 hours with Bearer token authentication |

---

## 📊 Data Model & Integrity Invariants

The database schema (`backend/src/db/schema.sql`) implements three core tables:
1. `tracked_products`:
   - `id`: UUID (Primary Key)
   - `external_product_id`: TEXT (Unique identifier on the mock store)
   - `url`: TEXT (Full product link)
   - `name`, `brand`, `category`, `sku`: TEXT
   - `created_at`: TIMESTAMPTZ
2. `price_history`:
   - `id`: UUID (Primary Key)
   - `product_id`: UUID (Foreign Key $\rightarrow$ `tracked_products.id` ON DELETE CASCADE)
   - `price`: NUMERIC(12, 2) (`CHECK (price > 0)`)
   - `currency`: TEXT (Default `'INR'`)
   - `in_stock`: BOOLEAN
   - `scraped_at`: TIMESTAMPTZ
3. `scrape_log`:
   - `id`: UUID (Primary Key)
   - `product_id`: UUID (Foreign Key $\rightarrow$ `tracked_products.id` ON DELETE CASCADE)
   - `attempted_at`: TIMESTAMPTZ
   - `status`: TEXT (`CHECK (status IN ('success', 'retried', 'failed'))`)
   - `http_status`: INT (nullable)
   - `error_message`: TEXT (nullable)
   - `retry_count`: INT (0 for initial success, 1–2 for retry recovery)
   - `duration_ms`: INT

### Strict Integrity Rules:
- **Never insert invalid prices**: A row is inserted into `price_history` **only** if a validated positive numeric price is scraped. Partial scrapes or failures never insert empty/0 rows.
- **Honest scrape logging**: Every single attempt writes to `scrape_log` regardless of success or failure.
- **Flakiness visibility**: Successful scrapes requiring 1 or more retries are logged with `status = 'retried'`.

---

## 🚀 Local Development Quickstart

### Prerequisites
- Node.js 18+ installed
- Chromium for Playwright installed

### 1. Clone & Configure Environment
In `backend/.env`:
```env
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
PORT=5001
CRON_SECRET=your-secure-cron-secret-token
TARGET_STORE_URL=https://demo.inelabteamdev.com
FRONTEND_URL=http://localhost:5173
```
*(Note: If Supabase credentials are not provided, the backend automatically uses a safe in-memory repository store for local testing).*

In `frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:5001/api
```

### 2. Install Dependencies & Playwright
```bash
# Backend
cd backend
npm install
npx playwright install chromium

# Frontend
cd ../frontend
npm install
```

### 3. Start Backend Server
```bash
cd backend
npm run dev
```
Backend runs on `http://localhost:5001`. Health check available at `http://localhost:5001/health`.

### 4. Start Frontend Application
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🎥 Running Headed-Mode Scraper (Screen Recording)

To view the scraper interacting with the real mock store in a visible browser window:
```bash
cd backend
npm run scrape:headed
```
This script:
1. Launches a visible Chromium window (`headless: false, slowMo: 120ms`).
2. Demonstrates realistic pointer movements and dwell time over the price area.
3. Tests 3 representative scenarios:
   - **Product 329**: Standard in-stock item (immediate success).
   - **Product 714**: Out-of-stock item (tests `in_stock = false` detection with valid price).
   - **Product 999999**: Deliberate failure target (demonstrates 3-attempt exponential backoff, honest failure logging, and zero pollution in `price_history`).
4. Outputs real-time progress and a formatted console summary table.

---

## 🌐 Deployment Instructions

### 1. Supabase (Database)
1. Create a free project at [supabase.com](https://supabase.com/).
2. Open the **SQL Editor** in the Supabase dashboard.
3. Paste and execute the contents of `backend/src/db/schema.sql`.
4. Copy your **Project URL** and **service_role secret** key from Project Settings $\rightarrow$ API.

### 2. Render (Backend)
1. Push this repository to GitHub.
2. Log into [render.com](https://render.com/) and create a new **Web Service**.
3. Connect your GitHub repository.
4. Set the following settings:
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npx playwright install chromium`
   - **Start Command**: `npm start`
5. Add Environment Variables:
   - `SUPABASE_URL`: `<your-supabase-url>`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<your-service-role-key>`
   - `CRON_SECRET`: `<create-a-random-secret>`
   - `PORT`: `10000`
   - `TARGET_STORE_URL`: `https://demo.inelabteamdev.com`
   - `FRONTEND_URL`: `https://<your-vercel-domain>.vercel.app`
6. Deploy the service and note your live Render backend URL.

### 3. Vercel (Frontend)
1. Log into [vercel.com](https://vercel.com/) and click **Add New Project**.
2. Select your repository.
3. Configure the project:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
4. Add Environment Variable:
   - `VITE_API_BASE_URL`: `https://<your-render-backend-url>/api`
5. Deploy and note your live Vercel URL.

### 4. cron-job.org (2-Hour Scheduled Scraper)
Because Render's free tier spins down on idle, an external cron service wakes the server every 2 hours:
1. Create a free account at [cron-job.org](https://cron-job.org/).
2. Click **Create Cronjob**:
   - **Title**: `INE Store Price Scrape`
   - **URL**: `https://<your-render-backend-url>/api/scrape/run`
   - **Schedule**: `Every 2 hours` (`0 */2 * * *`)
   - **Request Method**: `POST`
   - **HTTP Headers**:
     - `Authorization`: `Bearer <your-CRON_SECRET>`
     - `Content-Type`: `application/json`
3. Save the job and enable notifications.
