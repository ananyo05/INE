const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

export async function fetchTrackedProducts() {
  const res = await fetch(`${API_BASE}/products`);
  if (!res.ok) throw new Error(`Failed to fetch products (${res.status})`);
  const json = await res.json();
  return json.data || [];
}

export async function searchCatalog(query) {
  const q = encodeURIComponent(query || '');
  const res = await fetch(`${API_BASE}/products/search?q=${q}`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = await res.json();
  return json.data || [];
}

export async function trackProduct(productData) {
  const res = await fetch(`${API_BASE}/products/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productData)
  });
  if (!res.ok) throw new Error(`Track product failed (${res.status})`);
  return res.json();
}

export async function fetchProductHistory(productId) {
  const res = await fetch(`${API_BASE}/products/${productId}/history`);
  if (!res.ok) throw new Error(`Failed to fetch history (${res.status})`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchProductLogs(productId) {
  const res = await fetch(`${API_BASE}/products/${productId}/log`);
  if (!res.ok) throw new Error(`Failed to fetch logs (${res.status})`);
  const json = await res.json();
  return json.data || [];
}

export async function triggerBatchScrape() {
  const res = await fetch(`${API_BASE}/scrape/trigger-manual`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`Batch scrape trigger failed (${res.status})`);
  return res.json();
}

