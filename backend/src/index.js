import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { productsRouter } from './routes/products.js';
import { scrapeRouter } from './routes/scrape.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: '*', // Allow Vercel frontend or localhost
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-cron-secret']
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'INE Product Price Tracker Backend'
  });
});

// API Routes
app.use('/api/products', productsRouter);
app.use('/api/scrape', scrapeRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[Server] Price Tracker Backend running on port ${PORT}`);
  console.log(`[Server] Health check available at http://localhost:${PORT}/health`);
});
