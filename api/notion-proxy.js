// Notion API Proxy for Vercel Serverless Function
// This file should be in /api/notion-proxy.js

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Notion-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    // Get headers from request
    const headers = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Notion-Version': req.headers['notion-version'] || '2022-06-28',
    };

    // Add Authorization header if present
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    // Forward the request to Notion API
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'OPTIONS' ? JSON.stringify(req.body) : null,
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
