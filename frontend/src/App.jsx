import React, { useState, useEffect } from 'react';
import {
  fetchTrackedProducts,
  searchCatalog,
  trackProduct,
  fetchProductHistory,
  fetchProductLogs,
  triggerBatchScrape
} from './api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart
} from 'recharts';
import {
  TrendingUp,
  Search,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Package,
  Layers,
  Activity,
  Calendar,
  Zap,
  X
} from 'lucide-react';

export default function App() {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('chart'); // 'chart' | 'logs'
  const [loading, setLoading] = useState(true);
  const [scrapingBatch, setScrapingBatch] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Search Modal state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [trackingId, setTrackingId] = useState(null);

  // Load initial products
  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts(selectId = null) {
    try {
      setLoading(true);
      const data = await fetchTrackedProducts();
      setProducts(data);

      if (data.length > 0) {
        const toSelect = selectId
          ? data.find((p) => p.id === selectId) || data[0]
          : selectedProduct
          ? data.find((p) => p.id === selectedProduct.id) || data[0]
          : data[0];
        setSelectedProduct(toSelect);
        loadProductDetails(toSelect.id);
      } else {
        setSelectedProduct(null);
        setHistory([]);
        setLogs([]);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadProductDetails(productId) {
    try {
      const [histData, logsData] = await Promise.all([
        fetchProductHistory(productId),
        fetchProductLogs(productId)
      ]);
      setHistory(histData);
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load product details:', err);
    }
  }

  function handleSelectProduct(product) {
    setSelectedProduct(product);
    loadProductDetails(product.id);
  }

  async function handleBatchScrape() {
    try {
      setScrapingBatch(true);
      await triggerBatchScrape();
      await loadProducts(selectedProduct?.id);
    } catch (err) {
      console.error('Batch scrape failed:', err);
      alert('Batch scrape failed: ' + err.message);
    } finally {
      setScrapingBatch(false);
    }
  }

  // Catalog search debounce
  useEffect(() => {
    if (!searchModalOpen) return;
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const results = await searchCatalog(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchModalOpen]);

  async function handleTrackItem(item) {
    try {
      setTrackingId(item.external_product_id);
      const res = await trackProduct({
        external_product_id: item.external_product_id,
        name: item.name,
        url: item.url,
        brand: item.brand,
        category: item.category,
        sku: item.sku
      });
      await loadProducts(res.data?.id);
      setSearchModalOpen(false);
    } catch (err) {
      alert('Failed to track product: ' + err.message);
    } finally {
      setTrackingId(null);
    }
  }

  // Aggregate stats
  const totalProducts = products.length;
  const inStockProducts = products.filter((p) => p.in_stock).length;
  const totalScraped = logs.length;

  const chartData = history.map((h) => ({
    time: new Date(h.scraped_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    price: Number(h.price),
    in_stock: h.in_stock
  }));

  return (
    <div className="app-container">
      {/* Navbar */}
      <header className="navbar">
        <div className="brand-section">
          <div className="brand-icon">
            <TrendingUp size={24} />
          </div>
          <div>
            <h1 className="brand-title">INE Price Tracker</h1>
            <p className="brand-subtitle">Automated Web Scraper & Telemetry Monitor</p>
          </div>
        </div>

        <div className="nav-actions">
          <button
            className="btn btn-secondary"
            onClick={handleBatchScrape}
            disabled={scrapingBatch || products.length === 0}
          >
            <RefreshCw size={16} className={scrapingBatch ? 'animate-spin' : ''} />
            {scrapingBatch ? 'Scraping Store…' : 'Run Scrape Batch'}
          </button>

          <button className="btn btn-primary" onClick={() => setSearchModalOpen(true)}>
            <Plus size={16} />
            Track Product
          </button>
        </div>
      </header>

      {/* Stats Row */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            <Package size={22} />
          </div>
          <div>
            <div className="stat-value">{totalProducts}</div>
            <div className="stat-label">Tracked Products</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="stat-value">{inStockProducts}</div>
            <div className="stat-label">In Stock Now</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <Activity size={22} />
          </div>
          <div>
            <div className="stat-value">{selectedProduct?.last_scrape_status || 'Idle'}</div>
            <div className="stat-label">Selected Scrape Status</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>
            <Zap size={22} />
          </div>
          <div>
            <div className="stat-value">2h</div>
            <div className="stat-label">Cron Job Interval</div>
          </div>
        </div>
      </section>

      {/* Dashboard Grid */}
      <div className="dashboard-grid">
        {/* Sidebar: Tracked Products List */}
        <aside className="products-sidebar">
          <div className="section-header">
            <h2 className="section-title">
              <Layers size={18} />
              Tracked Items ({products.length})
            </h2>
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
              onClick={() => loadProducts()}
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {products.length === 0 ? (
            <div className="card empty-state">
              <Package size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <p>No products tracked yet.</p>
              <button
                className="btn btn-primary"
                style={{ marginTop: '12px' }}
                onClick={() => setSearchModalOpen(true)}
              >
                Find Product
              </button>
            </div>
          ) : (
            products.map((p) => {
              const isSelected = selectedProduct?.id === p.id;
              return (
                <div
                  key={p.id}
                  className={`product-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectProduct(p)}
                >
                  <div className="product-header">
                    <span className="product-name">{p.name}</span>
                    {p.in_stock === false ? (
                      <span className="badge badge-out-stock">Out of Stock</span>
                    ) : (
                      <span className="badge badge-in-stock">In Stock</span>
                    )}
                  </div>

                  <div className="product-meta">
                    {p.category && <span>{p.category}</span>}
                    {p.brand && <span>• {p.brand}</span>}
                    <span>• ID: {p.external_product_id}</span>
                  </div>

                  <div className="product-footer">
                    <div className="price-display">
                      {p.latest_price ? `₹${Number(p.latest_price).toLocaleString('en-IN')}` : 'Awaiting Scrape'}
                    </div>
                    {p.last_scrape_status && (
                      <span className={`badge badge-${p.last_scrape_status}`}>
                        {p.last_scrape_status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </aside>

        {/* Main Details Panel */}
        <main className="details-panel">
          {selectedProduct ? (
            <>
              {/* Product Header Card */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <h2>{selectedProduct.name}</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                      SKU: {selectedProduct.sku || 'N/A'} • Brand: {selectedProduct.brand || 'N/A'} •
                      Category: {selectedProduct.category || 'N/A'}
                    </p>
                  </div>

                  <a
                    href={selectedProduct.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                  >
                    View on Mock Store
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div style={{ display: 'flex', gap: '24px', alignItems: 'baseline' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Latest Price</span>
                    <div style={{ fontSize: '2.2rem', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
                      {selectedProduct.latest_price
                        ? `₹${Number(selectedProduct.latest_price).toLocaleString('en-IN')}`
                        : 'Scraping in progress…'}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Stock Status</span>
                    <div>
                      {selectedProduct.in_stock === false ? (
                        <span className="badge badge-out-stock" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
                          Out of Stock
                        </span>
                      ) : (
                        <span className="badge badge-in-stock" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
                          In Stock
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Last Scraped</span>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {selectedProduct.last_scraped_at
                        ? new Date(selectedProduct.last_scraped_at).toLocaleString()
                        : 'Pending'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs: Price History vs Scrape Logs */}
              <div className="card">
                <div className="card-header">
                  <div className="tabs-nav">
                    <button
                      className={`tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
                      onClick={() => setActiveTab('chart')}
                    >
                      Price History Chart
                    </button>
                    <button
                      className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
                      onClick={() => setActiveTab('logs')}
                    >
                      Scrape Logs ({logs.length})
                    </button>
                  </div>
                </div>

                {activeTab === 'chart' ? (
                  <div>
                    {chartData.length === 0 ? (
                      <div className="empty-state">
                        <Calendar size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                        <p>No historical price data recorded yet.</p>
                      </div>
                    ) : (
                      <div className="chart-container">
                        <ResponsiveContainer width="100%" height={320}>
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="time" stroke="#64748B" fontSize={12} tickLine={false} />
                            <YAxis
                              stroke="#64748B"
                              fontSize={12}
                              tickFormatter={(v) => `₹${v}`}
                              tickLine={false}
                              domain={['auto', 'auto']}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#1F2937',
                                borderColor: 'rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                color: '#fff'
                              }}
                              formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Price']}
                            />
                            <Area
                              type="monotone"
                              dataKey="price"
                              stroke="#6366F1"
                              strokeWidth={3}
                              fillOpacity={1}
                              fill="url(#priceGradient)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Scrape Logs Table */
                  <div className="table-wrap">
                    {logs.length === 0 ? (
                      <div className="empty-state">
                        <Clock size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                        <p>No scrape attempts logged yet.</p>
                      </div>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Attempted At</th>
                            <th>Status</th>
                            <th>HTTP Code</th>
                            <th>Retries</th>
                            <th>Duration</th>
                            <th>Error / Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((log) => (
                            <tr key={log.id}>
                              <td>{new Date(log.attempted_at).toLocaleTimeString()}</td>
                              <td>
                                <span className={`badge badge-${log.status}`}>{log.status}</span>
                              </td>
                              <td>{log.http_status || '200'}</td>
                              <td>{log.retry_count}</td>
                              <td>{log.duration_ms} ms</td>
                              <td>{log.error_message || 'OK'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card empty-state">
              <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <h3>Select a Tracked Product</h3>
              <p>Choose an item from the sidebar or track a new product from the mock store.</p>
            </div>
          )}
        </main>
      </div>

      {/* Product Search & Track Modal */}
      {searchModalOpen && (
        <div className="modal-overlay" onClick={() => setSearchModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Search INE Mock Store</h3>
              <button
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                onClick={() => setSearchModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="search-input-wrap">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by name, brand (e.g. Cobalt, Ultrabook), or product ID/URL..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="search-results">
                {searching ? (
                  <div className="empty-state">Searching mock store catalog…</div>
                ) : searchResults.length === 0 ? (
                  <div className="empty-state">No products found matching your search.</div>
                ) : (
                  searchResults.map((item) => {
                    const isAlreadyTracked = products.some(
                      (p) => p.external_product_id === item.external_product_id
                    );
                    return (
                      <div key={item.external_product_id} className="search-item">
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Brand: {item.brand || 'N/A'} • Category: {item.category || 'N/A'} • ID:{' '}
                            {item.external_product_id}
                          </div>
                        </div>

                        <button
                          className="btn btn-primary"
                          style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                          disabled={isAlreadyTracked || trackingId === item.external_product_id}
                          onClick={() => handleTrackItem(item)}
                        >
                          {isAlreadyTracked
                            ? 'Tracking'
                            : trackingId === item.external_product_id
                            ? 'Adding…'
                            : 'Track'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
