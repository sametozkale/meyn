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
    // Debug: Log incoming headers
    console.log('Incoming headers:', Object.keys(req.headers));
    console.log('Authorization header:', req.headers.authorization ? 'Present' : 'Missing');
    
    // Get headers from request (Vercel converts headers to lowercase)
    const headers = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Notion-Version': req.headers['notion-version'] || '2022-06-28',
    };

    // Add Authorization header if present (Vercel converts to lowercase)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error('Missing Authorization header in proxy');
      return res.status(401).json({ error: 'Missing Authorization header', debug: { headers: Object.keys(req.headers) } });
    }
    headers['Authorization'] = authHeader;
    
    console.log('Forwarding to Notion with headers:', Object.keys(headers));

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
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
