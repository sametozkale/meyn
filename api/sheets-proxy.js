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

  console.log('[SHEETS PROXY] Request received:', {
    method: req.method,
    action: req.body?.action,
    hasSheetId: !!req.body?.sheetId,
    hasValues: !!req.body?.values,
    optionId: req.body?.optionId
  });

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
      case 'getCounter': {
        // Get counter value for a specific option from waitlist sheet
        if (!optionId) {
          return res.status(400).json({ error: 'Missing optionId parameter' });
        }
        
        // Base values for each option
        const baseValues = {
          '1': 27,
          '2': 12,
          '3': 5
        };
        const baseValue = baseValues[optionId] || 0;
        
          // Get waitlist sheet (use first sheet since all data is in one sheet)
          const counterSheet = doc.sheetsByIndex[0];
        
        if (!counterSheet) {
          throw new Error('Waitlist sheet not found');
        }
        
        // Load header row to find "Selected Option" column
        await counterSheet.loadHeaderRow();
        const headerValues = counterSheet.headerValues;
        const selectedOptionIndex = headerValues.findIndex(h => 
          h.toLowerCase() === 'selected option' || 
          h.toLowerCase() === 'selectedoption' ||
          h.toLowerCase() === 'option'
        );
        
        if (selectedOptionIndex === -1) {
          // Column doesn't exist yet, return base value
          console.log(`[getCounter] Selected Option column not found, returning base value: ${baseValue}`);
          result = { count: baseValue };
          break;
        }
        
        // Count rows with matching Selected Option
        const rows = await counterSheet.getRows();
        let addedCount = 0;
        
        rows.forEach((row) => {
          try {
            let selectedOption = '';
            
            // Try different ways to access Selected Option field
            if (row.get) {
              selectedOption = row.get('Selected Option') || row.get('SelectedOption') || row.get('Option') || '';
            }
            
            if (!selectedOption) {
              selectedOption = row['Selected Option'] || row.SelectedOption || row.Option || '';
            }
            
            if (!selectedOption && row._rawData && row._rawData[selectedOptionIndex]) {
              selectedOption = row._rawData[selectedOptionIndex] || '';
            }
            
            selectedOption = String(selectedOption || '').trim();
            
            // Check if this row has the selected option
            if (selectedOption === optionId || selectedOption === parseInt(optionId).toString()) {
              addedCount++;
            }
          } catch (e) {
            console.error(`[getCounter] Error processing row:`, e);
          }
        });
        
        // Display count = Base value + Added count
        const displayCount = baseValue + addedCount;
        console.log(`[getCounter] Option ${optionId}: Base=${baseValue}, Added=${addedCount}, Display=${displayCount}`);
        
        result = { count: displayCount };
        break;
      }

      case 'incrementCounter': {
        // Increment counter for a specific option - now handled via waitlist sheet
        // This action just returns the updated count (actual increment happens when email is added)
        if (!optionId) {
          return res.status(400).json({ error: 'Missing optionId parameter' });
        }
        
        // Base values for each option
        const incBaseValues = {
          '1': 27,
          '2': 12,
          '3': 5
        };
        const incBaseValue = incBaseValues[optionId] || 0;
        
        // Get waitlist sheet (use first sheet since all data is in one sheet)
        const incCounterSheet = doc.sheetsByIndex[0];
        
        if (!incCounterSheet) {
          throw new Error('Waitlist sheet not found');
        }
        
        // Load header row to find "Selected Option" column
        await incCounterSheet.loadHeaderRow();
        const incHeaderValues = incCounterSheet.headerValues;
        const incSelectedOptionIndex = incHeaderValues.findIndex(h => 
          h.toLowerCase() === 'selected option' || 
          h.toLowerCase() === 'selectedoption' ||
          h.toLowerCase() === 'option'
        );
        
        // Count rows with matching Selected Option
        const incRows = await incCounterSheet.getRows();
        let incAddedCount = 0;
        
        if (incSelectedOptionIndex !== -1) {
          incRows.forEach((row) => {
            try {
              let selectedOption = '';
              
              if (row.get) {
                selectedOption = row.get('Selected Option') || row.get('SelectedOption') || row.get('Option') || '';
              }
              
              if (!selectedOption) {
                selectedOption = row['Selected Option'] || row.SelectedOption || row.Option || '';
              }
              
              if (!selectedOption && row._rawData && row._rawData[incSelectedOptionIndex]) {
                selectedOption = row._rawData[incSelectedOptionIndex] || '';
              }
              
              selectedOption = String(selectedOption || '').trim();
              
              if (selectedOption === optionId || selectedOption === parseInt(optionId).toString()) {
                incAddedCount++;
              }
            } catch (e) {
              console.error(`[incrementCounter] Error processing row:`, e);
            }
          });
        }
        
        // Display count = Base value + Added count
        const displayCountAfterIncrement = incBaseValue + incAddedCount;
        console.log(`[incrementCounter] Option ${optionId}: Base=${incBaseValue}, Added=${incAddedCount}, Display=${displayCountAfterIncrement}`);
        
        result = { count: displayCountAfterIncrement };
        break;
      }

      case 'addToWaitlist': {
        // Add row to waitlist sheet (always add new row)
        if (!values) {
          return res.status(400).json({ error: 'Missing values parameter' });
        }
        
        // Allow empty email for counter clicks
        const emailValue = values.email || '';
        
        try {
          // Get waitlist sheet (use first sheet since all data is in one sheet)
          const waitlistSheet = doc.sheetsByIndex[0];
          
          if (!waitlistSheet) {
            throw new Error('Waitlist sheet not found');
          }
          
          // Load header to understand column structure
          await waitlistSheet.loadHeaderRow();
          
          // Always add new row (simplified - no update logic)
          const rowData = {
            Email: emailValue,
            'Created Date': values.createdDate || new Date().toISOString(),
            Browser: values.browser || '',
            OS: values.os || '',
            Device: values.device || '',
            'User Agent': values.userAgent || '',
            Language: values.language || '',
            Timezone: values.timezone || '',
            'Form Source': values.formSource || 'modal'
          };
          
          // Add Selected Option if provided
          if (values.selectedOption) {
            rowData['Selected Option'] = values.selectedOption;
          }
          
          console.log('[addToWaitlist] Adding new row to sheet:', JSON.stringify(rowData, null, 2));
          console.log('[addToWaitlist] Sheet headers:', waitlistSheet.headerValues);
          
          try {
            await waitlistSheet.addRow(rowData);
            console.log('[addToWaitlist] Row added successfully to sheet');
          } catch (addRowError) {
            console.error('[addToWaitlist] Error adding row:', addRowError);
            console.error('[addToWaitlist] Error details:', addRowError.message, addRowError.stack);
            throw addRowError;
          }
          
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
          
          // Display count = Real count + 254
          const displayCount = validEmailCount + 254;
          console.log(`[addToWaitlist] Valid email count: ${validEmailCount}, Display count: ${displayCount}`);
          
          result = { success: true, count: displayCount };
        } catch (sheetError) {
          console.error('[addToWaitlist] Sheet error:', sheetError);
          throw sheetError; // Re-throw to be caught by outer catch
        }
        break;

      case 'getWaitlistCount': {
        // Get total waitlist count (excluding header row)
        try {
          // Get waitlist sheet (use first sheet since all data is in one sheet)
          const countSheet = doc.sheetsByIndex[0];
          
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
          
          // Display count = Real count + 254 (always add 254, even if count is 0)
          const displayCount = validEmailCount + 254;
          console.log(`[getWaitlistCount] Valid email count: ${validEmailCount}, Display count: ${displayCount}`);
          
          result = { count: displayCount };
        } catch (sheetError) {
          console.error('[getWaitlistCount] Sheet error:', sheetError);
          console.error('[getWaitlistCount] Error stack:', sheetError.stack);
          // Return default count if sheet access fails
          result = { count: 254 };
        }
        break;
      }

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
