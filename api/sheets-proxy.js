// Google Sheets API Proxy for Vercel Serverless Function
// This file should be in /api/sheets-proxy.js

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, sheetId, range, values, optionId } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter' });
  }

  // Get sheet ID from request body or environment variable
  const targetSheetId = sheetId || process.env.SHEET_ID_WAITLIST;
  
  if (!targetSheetId) {
    return res.status(400).json({ error: 'Missing sheetId parameter or SHEET_ID_WAITLIST environment variable' });
  }

  try {
    // Service Account credentials from environment variables
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    
    if (!privateKey || !clientEmail) {
      console.error('[SHEETS PROXY ERROR] Missing Google Service Account credentials');
      return res.status(500).json({ 
        error: 'Google Service Account credentials not configured',
        message: 'Please set GOOGLE_PRIVATE_KEY and GOOGLE_CLIENT_EMAIL environment variables'
      });
    }

    // Authenticate with Google Sheets API
    const jwt = new JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(targetSheetId, jwt);
    await doc.loadInfo();

    let result;

    switch (action) {
      case 'getCounter':
        // Get counter value for a specific option
        if (!optionId) {
          return res.status(400).json({ error: 'Missing optionId parameter' });
        }
        
        const counterSheet = doc.sheetsByIndex[0]; // First sheet for counters
        await counterSheet.loadCells('A:B'); // Load Option and Count columns
        
        // Find row with matching Option
        let count = 0;
        let found = false;
        for (let row = 1; row <= counterSheet.rowCount; row++) {
          const optionCell = counterSheet.getCell(row, 0); // Column A
          const countCell = counterSheet.getCell(row, 1); // Column B
          
          if (optionCell.value === optionId) {
            count = parseInt(countCell.value) || 0;
            found = true;
            break;
          }
        }
        
        // If not found, return default
        if (!found) {
          count = optionId === '1' ? 27 : optionId === '2' ? 12 : 5;
        }
        
        result = { count };
        break;

      case 'incrementCounter':
        // Increment counter for a specific option
        if (!optionId) {
          return res.status(400).json({ error: 'Missing optionId parameter' });
        }
        
        const incCounterSheet = doc.sheetsByIndex[0];
        await incCounterSheet.loadCells('A:B');
        
        // Find row with matching Option
        let rowIndex = -1;
        let currentCount = 0;
        for (let row = 1; row <= incCounterSheet.rowCount; row++) {
          const optionCell = incCounterSheet.getCell(row, 0);
          if (optionCell.value === optionId) {
            rowIndex = row;
            const countCell = incCounterSheet.getCell(row, 1);
            currentCount = parseInt(countCell.value) || 0;
            break;
          }
        }
        
        const newCount = currentCount + 1;
        
        if (rowIndex > 0) {
          // Update existing row
          const countCell = incCounterSheet.getCell(rowIndex, 1);
          countCell.value = newCount;
          await incCounterSheet.saveUpdatedCells();
        } else {
          // Add new row
          await incCounterSheet.addRow({
            Option: optionId,
            Count: newCount
          });
        }
        
        result = { count: newCount };
        break;

      case 'addToWaitlist':
        // Add email to waitlist
        if (!values || !values.email) {
          return res.status(400).json({ error: 'Missing email in values parameter' });
        }
        
        const waitlistSheet = doc.sheetsByIndex[1] || doc.sheetsByIndex[0]; // Second sheet for waitlist, fallback to first
        await waitlistSheet.addRow({
          Email: values.email,
          'Created Date': values.createdDate || new Date().toISOString(),
          Browser: values.browser || '',
          OS: values.os || '',
          Device: values.device || '',
          'User Agent': values.userAgent || '',
          Language: values.language || '',
          Timezone: values.timezone || '',
          'Form Source': values.formSource || 'modal'
        });
        
        result = { success: true };
        break;

      case 'getWaitlistCount':
        // Get total waitlist count
        const countSheet = doc.sheetsByIndex[1] || doc.sheetsByIndex[0];
        const rows = await countSheet.getRows();
        const totalCount = rows.length;
        
        result = { count: totalCount };
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[SHEETS PROXY ERROR]', error);
    return res.status(500).json({ 
      error: error.message || 'Google Sheets API error',
      details: error.toString()
    });
  }
}
