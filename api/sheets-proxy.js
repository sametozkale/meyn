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
        message: 'Please set GOOGLE_PRIVATE_KEY and GOOGLE_CLIENT_EMAIL environment variables',
        hasPrivateKey: !!privateKey,
        hasClientEmail: !!clientEmail
      });
    }

    // Format private key - handle both escaped and unescaped newlines
    let formattedKey = privateKey;
    // Replace \\n with actual newlines
    formattedKey = formattedKey.replace(/\\n/g, '\n');
    // If still no newlines, try replacing literal \n strings
    if (!formattedKey.includes('\n')) {
      formattedKey = formattedKey.replace(/\\\\n/g, '\n');
    }

    // Authenticate with Google Sheets API
    const jwt = new JWT({
      email: clientEmail,
      key: formattedKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(targetSheetId, jwt);
    await doc.loadInfo();
    
    // Log sheet structure for debugging
    console.log(`[SHEETS PROXY] Sheet loaded: ${doc.title}, Sheet count: ${doc.sheetCount}`);
    doc.sheetsByIndex.forEach((sheet, index) => {
      console.log(`[SHEETS PROXY] Sheet ${index}: ${sheet.title}`);
    });

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
        
        try {
          // Try to get waitlist sheet (second sheet, or first if only one exists)
          let waitlistSheet;
          if (doc.sheetCount > 1) {
            waitlistSheet = doc.sheetsByIndex[1];
          } else {
            waitlistSheet = doc.sheetsByIndex[0];
          }
          
          if (!waitlistSheet) {
            throw new Error('Waitlist sheet not found');
          }
          
          // Load header to understand column structure
          await waitlistSheet.loadHeaderRow();
          
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
          
          // Get updated count after adding email (use same logic as getWaitlistCount)
          const rows = await waitlistSheet.getRows();
          const headerValues = waitlistSheet.headerValues;
          
          let validEmailCount = 0;
          rows.forEach((row, index) => {
            try {
              let email = '';
              
              if (row.get) {
                email = row.get('Email') || '';
              }
              
              if (!email) {
                email = row.Email || row.email || row.EMAIL || '';
              }
              
              if (!email && headerValues && headerValues.length > 0) {
                const emailIndex = headerValues.findIndex(h => h.toLowerCase() === 'email');
                if (emailIndex >= 0 && row._rawData && row._rawData[emailIndex]) {
                  email = row._rawData[emailIndex] || '';
                }
              }
              
              if (!email && row._rawData && row._rawData[0]) {
                email = row._rawData[0] || '';
              }
              
              email = String(email || '').trim();
              const isValidEmail = email !== '' && 
                                   email.includes('@') && 
                                   email.toLowerCase() !== 'email' &&
                                   !email.toLowerCase().startsWith('email') &&
                                   email.length > 3;
              
              if (isValidEmail) {
                validEmailCount++;
              }
            } catch (e) {
              console.error(`[addToWaitlist] Error processing row ${index}:`, e);
            }
          });
          
          const newCount = validEmailCount > 0 ? validEmailCount : 254;
          console.log(`[addToWaitlist] Valid email count after adding: ${validEmailCount}, Returning: ${newCount}`);
          
          result = { success: true, count: newCount };
        } catch (sheetError) {
          console.error('[addToWaitlist] Sheet error:', sheetError);
          throw sheetError; // Re-throw to be caught by outer catch
        }
        break;

      case 'getWaitlistCount':
        // Get total waitlist count (excluding header row)
        try {
          // Try to get waitlist sheet (second sheet, or first if only one exists)
          let countSheet;
          if (doc.sheetCount > 1) {
            countSheet = doc.sheetsByIndex[1];
          } else {
            countSheet = doc.sheetsByIndex[0];
          }
          
          if (!countSheet) {
            throw new Error('Waitlist sheet not found');
          }
          
          // Load header row first to understand column structure
          await countSheet.loadHeaderRow();
          const headerValues = countSheet.headerValues;
          console.log('[getWaitlistCount] Header values:', headerValues);
          
          const rows = await countSheet.getRows();
          console.log('[getWaitlistCount] Total rows:', rows.length);
          
          // Count only rows with valid email addresses
          // getRows() already excludes header row
          let validEmailCount = 0;
          
          if (rows && rows.length > 0) {
            // Filter rows with valid email addresses
            rows.forEach((row, index) => {
              try {
                // Try different ways to access email field
                let email = '';
                
                // First try: use get() method with header name
                if (row.get) {
                  email = row.get('Email') || '';
                }
                
                // Second try: direct property access (case-insensitive)
                if (!email) {
                  email = row.Email || row.email || row.EMAIL || '';
                }
                
                // Third try: access by header index if Email is first column
                if (!email && headerValues && headerValues.length > 0) {
                  const emailIndex = headerValues.findIndex(h => h.toLowerCase() === 'email');
                  if (emailIndex >= 0 && row._rawData && row._rawData[emailIndex]) {
                    email = row._rawData[emailIndex] || '';
                  }
                }
                
                // Fourth try: first column if no header match
                if (!email && row._rawData && row._rawData[0]) {
                  email = row._rawData[0] || '';
                }
                
                // Check if it's a valid email (contains @ and not empty)
                email = String(email || '').trim();
                const isValidEmail = email !== '' && 
                                     email.includes('@') && 
                                     email.toLowerCase() !== 'email' &&
                                     !email.toLowerCase().startsWith('email') &&
                                     email.length > 3; // Basic email validation
                
                if (isValidEmail) {
                  validEmailCount++;
                } else if (email) {
                  console.log(`[getWaitlistCount] Skipping invalid email at row ${index}: "${email}"`);
                }
              } catch (e) {
                console.error(`[getWaitlistCount] Error processing row ${index}:`, e);
              }
            });
          }
          
          // Use actual count, minimum 254 if no emails found
          const totalCount = validEmailCount > 0 ? validEmailCount : 254;
          console.log(`[getWaitlistCount] Valid email count: ${validEmailCount}, Returning: ${totalCount}`);
          
          result = { count: totalCount };
        } catch (sheetError) {
          console.error('[getWaitlistCount] Sheet error:', sheetError);
          console.error('[getWaitlistCount] Error stack:', sheetError.stack);
          // Return default count if sheet access fails
          result = { count: 254 };
        }
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[SHEETS PROXY ERROR]', error);
    console.error('[SHEETS PROXY ERROR] Stack:', error.stack);
    console.error('[SHEETS PROXY ERROR] Action:', req.body?.action);
    console.error('[SHEETS PROXY ERROR] Sheet ID:', targetSheetId);
    
    // Check for specific error types
    let statusCode = 500;
    let errorMessage = error.message || 'Google Sheets API error';
    
    const errorStr = error.toString().toLowerCase();
    const errorMsgLower = (error.message || '').toLowerCase();
    
    if (errorStr.includes('403') || errorMsgLower.includes('403') || errorStr.includes('permission')) {
      statusCode = 403;
      errorMessage = 'Permission denied. Please ensure the Google Sheet is shared with the Service Account email: ' + (process.env.GOOGLE_CLIENT_EMAIL || 'meyn-150@meyn-485212.iam.gserviceaccount.com');
    } else if (errorStr.includes('401') || errorMsgLower.includes('401') || errorStr.includes('unauthorized') || errorStr.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed. Please check GOOGLE_PRIVATE_KEY and GOOGLE_CLIENT_EMAIL environment variables.';
    } else if (errorStr.includes('404') || errorMsgLower.includes('404') || errorStr.includes('not found')) {
      statusCode = 404;
      errorMessage = 'Sheet not found. Please check SHEET_ID_WAITLIST environment variable.';
    } else if (errorStr.includes('sheet') && errorStr.includes('not found')) {
      statusCode = 404;
      errorMessage = 'Sheet tab not found. Please ensure the Google Sheet has the correct tabs.';
    }
    
    return res.status(statusCode).json({ 
      error: errorMessage,
      details: error.toString(),
      action: req.body?.action,
      sheetId: targetSheetId,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
