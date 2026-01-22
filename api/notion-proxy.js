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
    // Get headers from request (Vercel converts headers to lowercase)
    const headers = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Notion-Version': req.headers['notion-version'] || '2025-09-03',
    };

    // Add Authorization header - Vercel converts to lowercase
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.error('[PROXY ERROR] Missing Authorization header');
      console.error('[PROXY DEBUG] Available headers:', Object.keys(req.headers));
      return res.status(401).json({ 
        error: 'Missing Authorization header',
        message: 'Authorization header not found in request'
      });
    }
    
    headers['Authorization'] = authHeader;
    
    // Log token prefix for debugging (first 20 chars only for security)
    const tokenPrefix = authHeader.substring(0, 20);
    console.log('[PROXY] Forwarding to Notion:', url.substring(0, 100));
    console.log('[PROXY] Method:', req.method);
    console.log('[PROXY] Authorization prefix:', tokenPrefix + '...');
    console.log('[PROXY] Authorization starts with Bearer:', authHeader.startsWith('Bearer '));
    console.log('[PROXY] All headers being sent:', Object.keys(headers));

    // Prepare body
    let body = null;
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      // For Vercel, req.body is already parsed if Content-Type is application/json
      // But we need to stringify it for the Notion API
      if (req.body) {
        body = JSON.stringify(req.body);
      }
    }

    // Forward the request to Notion API
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: body,
    });

    // Handle response
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      console.error('[PROXY ERROR] Notion API error:', response.status, errorData);
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
