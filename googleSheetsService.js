const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1EkPPK0w5yLrSAGAxsbb3Td8lYZcpuYda4XxFONUyS0E';

const RATING_COLORS = {
  'excellent': { hex: 'FF00C853', name: 'Cực tốt', color: '#00C853', score: 5, rgb: { red: 0.0, green: 0.784, blue: 0.325 } },
  'good':      { hex: 'FF2196F3', name: 'Tốt', color: '#2196F3', score: 4, rgb: { red: 0.129, green: 0.588, blue: 0.953 } },
  'fair':      { hex: 'FFFFD600', name: 'Tạm', color: '#FFD600', score: 3, rgb: { red: 1.0, green: 0.839, blue: 0.0 } },
  'ok':        { hex: 'FFFF9100', name: 'OK', color: '#FF9100', score: 2, rgb: { red: 1.0, green: 0.569, blue: 0.0 } },
  'poor':      { hex: 'FFFF1744', name: 'Tệ', color: '#FF1744', score: 1, rgb: { red: 1.0, green: 0.090, blue: 0.267 } }
};

// Map score to ratingKey
const SCORE_MAP = {
  5: 'excellent',
  4: 'good',
  3: 'fair',
  2: 'ok',
  1: 'poor'
};

const COLUMN_MAP = {
  1: 'ID',
  2: 'Họ và tên',
  3: 'MSSV',
  4: 'Email',
  5: 'Lớp sinh hoạt',
  6: 'Tự định nghĩa bản thân',
  7: 'Kỹ năng mới đã học',
  8: 'Lịch học mong muốn',
  9: 'Lĩnh vực mong muốn (Ban)',
  10: 'Ngôn ngữ lập trình',
  11: 'Định hướng nghề nghiệp',
  12: 'Kế hoạch làm việc nhóm',
  13: 'Kiến thức Hệ thống',
  14: 'Lĩnh vực hứng thú (TTSK)',
  15: 'Kỹ năng thiết kế',
  16: 'Thiết bị chụp ảnh',
  17: 'Link sản phẩm',
  18: 'Tìm ý tưởng sáng tạo',
  19: 'Xử lý ý kiến phản đối',
  20: 'Vai trò Leader/Khác',
  21: 'Quản lý nhóm',
  22: 'Xử lý sự cố sự kiện',
  23: 'Mong đợi Trainee Program',
  24: 'Lời nhắn BTC'
};

const HE_THONG_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19, 23, 24];
const TTSK_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

function getAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } catch (e) {
      console.warn('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY env var:', e.message);
    }
  }

  // Look for test-1-*.json or any service account key file in root
  const files = fs.readdirSync(__dirname);
  const keyFile = files.find(f => f.startsWith('test-1-') && f.endsWith('.json')) ||
                  files.find(f => f.includes('service_account') && f.endsWith('.json'));

  if (keyFile) {
    return new google.auth.GoogleAuth({
      keyFile: path.join(__dirname, keyFile),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  }

  throw new Error('Không tìm thấy file credentials Google Sheets Service Account!');
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

// Convert column index (1-indexed) to letter, e.g. 1 -> A, 26 -> Z, 27 -> AA
function colToLetter(col) {
  let temp;
  let letter = '';
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp - 1) / 26;
  }
  return letter;
}

// Convert letter to column index (1-indexed)
function letterToCol(letter) {
  let col = 0;
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.charCodeAt(i) - 64);
  }
  return col;
}

// Infer rating key and score from text or color
function inferRating(val, colorArgb, scoreVal) {
  if (scoreVal) {
    const num = parseInt(scoreVal);
    if (num >= 1 && num <= 5 && SCORE_MAP[num]) {
      const key = SCORE_MAP[num];
      return {
        key,
        score: num,
        fillColor: RATING_COLORS[key].hex
      };
    }
  }

  if (colorArgb) {
    const s = colorArgb.toUpperCase();
    if (s.includes('00C853')) return { key: 'excellent', score: 5, fillColor: 'FF00C853' };
    if (s.includes('2196F3')) return { key: 'good', score: 4, fillColor: 'FF2196F3' };
    if (s.includes('FFD600')) return { key: 'fair', score: 3, fillColor: 'FFFFD600' };
    if (s.includes('FF9100')) return { key: 'ok', score: 2, fillColor: 'FFFF9100' };
    if (s.includes('FF1744')) return { key: 'poor', score: 1, fillColor: 'FFFF1744' };
  }

  if (val) {
    const s = String(val).toUpperCase();
    if (s.includes('GUD!') || s.includes('CỰC TỐT')) return { key: 'excellent', score: 5, fillColor: 'FF00C853' };
    if (s.includes('GOOD!') || s.includes('TỐT')) return { key: 'good', score: 4, fillColor: 'FF2196F3' };
    if (s.includes('MID!') || s.includes('TẠM')) return { key: 'fair', score: 3, fillColor: 'FFFFD600' };
    if (s.includes('OKI!') || s.includes('OK!') || s.includes('OK NHEN')) return { key: 'ok', score: 2, fillColor: 'FFFF9100' };
    if (s.includes('BAD!') || s.includes('TỆ')) return { key: 'poor', score: 1, fillColor: 'FFFF1744' };
  }

  return null;
}

function rgbToArgb(rgb) {
  if (!rgb) return null;
  const to255 = x => Math.round((x || 0) * 255);
  const toHex = n => n.toString(16).padStart(2, '0').toUpperCase();
  const hex = `FF${toHex(to255(rgb.red))}${toHex(to255(rgb.green))}${toHex(to255(rgb.blue))}`;
  // Don't return white / transparent
  if (hex === 'FFFFFFFF' || hex === 'FF000000') return null;
  return hex;
}

// In-memory cache
let cachedData = null;
let lastFetchTime = 0;
const CACHE_TTL = 15000; // 15 seconds

async function getSheetMetadata() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const evalSheet = res.data.sheets.find(s => s.properties.title === 'ĐÁNH GIÁ') || res.data.sheets[0];
  return {
    evalSheetId: evalSheet.properties.sheetId,
    evalSheetTitle: evalSheet.properties.title
  };
}

async function fetchFromGoogleSheet(force = false) {
  const now = Date.now();
  if (!force && cachedData && (now - lastFetchTime < CACHE_TTL)) {
    return cachedData;
  }

  const sheets = getSheetsClient();
  const { evalSheetId, evalSheetTitle } = await getSheetMetadata();

  // Fetch full data with formatting (up to 500 rows)
  const response = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    ranges: [`${evalSheetTitle}!A1:ZZ500`],
    fields: 'sheets.data.rowData.values(formattedValue,userEnteredFormat.backgroundColor)'
  });

  const sheetData = response.data.sheets[0].data[0];
  const rowDataList = sheetData.rowData || [];

  if (rowDataList.length < 2) {
    throw new Error('Trang tính ĐÁNH GIÁ chưa có dữ liệu hợp lệ!');
  }

  // Row 2 (0-indexed: index 1): Header column names
  const row2Values = (rowDataList[1].values || []).map(cell => cell.formattedValue || '');

  // Detect reviewers and their columns:
  // Reviewer comment column and score column
  // Patterns:
  // Col X: "<Name>"
  // Col X+1: "Điểm - <Name>"
  const reviewers = [];
  const processedNames = new Set();

  for (let c = 25; c < row2Values.length; c++) {
    const val = (row2Values[c] || '').trim();
    if (!val) continue;

    // Skip score header columns if already handled
    if (val.startsWith('Điểm - ') || val.startsWith('Điểm (')) continue;

    const reviewerName = val;
    if (processedNames.has(reviewerName.toLowerCase())) continue;

    // Check if next column or any column is the score column for this reviewer
    let scoreColIndex = null;
    for (let sc = 25; sc < row2Values.length; sc++) {
      const sVal = (row2Values[sc] || '').trim();
      if (sVal === `Điểm - ${reviewerName}` || sVal === `Điểm (${reviewerName})` || sVal === `${reviewerName} (Điểm)`) {
        scoreColIndex = sc + 1; // 1-indexed
        break;
      }
    }

    reviewers.push({
      name: reviewerName,
      colIndex: c + 1, // 1-indexed comment column
      scoreColIndex: scoreColIndex // 1-indexed score column (if found)
    });
    processedNames.add(reviewerName.toLowerCase());
  }

  // Build forms list
  const forms = [];

  for (let r = 2; r < rowDataList.length; r++) {
    const row = rowDataList[r].values || [];
    const idVal = row[0]?.formattedValue?.trim();
    if (!idVal || isNaN(parseInt(idVal))) continue;

    const id = parseInt(idVal);
    const formData = {};

    // Cols 1 to 24 (0 to 23 in array)
    for (let c = 0; c < 24; c++) {
      formData[c + 1] = row[c]?.formattedValue || '';
    }

    // Read evaluations
    const evaluations = {};

    reviewers.forEach(rev => {
      const commentCell = row[rev.colIndex - 1];
      const commentVal = commentCell?.formattedValue || '';
      const commentBg = rgbToArgb(commentCell?.userEnteredFormat?.backgroundColor);

      let scoreVal = null;
      let scoreBg = null;
      if (rev.scoreColIndex && row[rev.scoreColIndex - 1]) {
        const scoreCell = row[rev.scoreColIndex - 1];
        scoreVal = scoreCell?.formattedValue || null;
        scoreBg = rgbToArgb(scoreCell?.userEnteredFormat?.backgroundColor);
      }

      const inferred = inferRating(commentVal, scoreBg || commentBg, scoreVal);

      evaluations[rev.name] = {
        comment: commentVal,
        ratingKey: inferred ? inferred.key : null,
        score: inferred ? inferred.score : (scoreVal ? parseInt(scoreVal) || null : null),
        fillColor: inferred ? inferred.fillColor : (commentBg || null)
      };
    });

    forms.push({
      rowIndex: r + 1, // 1-indexed row for Excel & Sheets
      id: id,
      data: formData,
      ban: formData[9] || '',
      evaluations: evaluations
    });
  }

  // Sort by ID
  forms.sort((a, b) => a.id - b.id);

  cachedData = {
    forms,
    reviewers,
    columnMap: COLUMN_MAP,
    heThongCols: HE_THONG_COLS,
    ttskCols: TTSK_COLS,
    ratingColors: RATING_COLORS,
    sheetId: evalSheetId,
    sheetTitle: evalSheetTitle,
    lastSynced: new Date().toISOString()
  };

  lastFetchTime = now;
  return cachedData;
}

// Save evaluation to Google Sheet
async function saveEvaluation({ rowIndex, reviewerName, reviewerCol, comment, ratingKey, score }) {
  const sheets = getSheetsClient();
  const meta = await getSheetMetadata();
  const currentData = await fetchFromGoogleSheet(false);

  // Find reviewer definition
  let reviewer = currentData.reviewers.find(r => r.name === reviewerName);
  if (!reviewer && reviewerCol) {
    reviewer = currentData.reviewers.find(r => r.colIndex === parseInt(reviewerCol));
  }

  if (!reviewer) {
    throw new Error(`Không tìm thấy người chấm: ${reviewerName || reviewerCol}`);
  }

  const commentCol = reviewer.colIndex; // 1-indexed
  const scoreCol = reviewer.scoreColIndex; // 1-indexed

  // Derive score and color
  let finalScore = (score !== undefined && score !== null && score !== '') ? parseInt(score) : null;
  let ratingInfo = null;

  if (ratingKey && RATING_COLORS[ratingKey]) {
    ratingInfo = RATING_COLORS[ratingKey];
    if (!finalScore) finalScore = ratingInfo.score;
  } else if (finalScore && SCORE_MAP[finalScore]) {
    ratingInfo = RATING_COLORS[SCORE_MAP[finalScore]];
  }

  if (!finalScore || !ratingInfo) {
    throw new Error('Bắt buộc phải chọn điểm đánh giá (từ 1 đến 5 điểm) trước khi lưu!');
  }

  const batchValues = [];

  // Update comment value
  batchValues.push({
    range: `${meta.evalSheetTitle}!${colToLetter(commentCol)}${rowIndex}`,
    values: [[comment || '']]
  });

  // Update score value (if score column exists)
  if (scoreCol) {
    batchValues.push({
      range: `${meta.evalSheetTitle}!${colToLetter(scoreCol)}${rowIndex}`,
      values: [[finalScore !== null && finalScore !== undefined ? String(finalScore) : '']]
    });
  }

  // 1. Write values
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: batchValues
    }
  });

  // 2. Update background colors & formatting
  const requests = [];

  if (ratingInfo) {
    // Comment cell formatting
    requests.push({
      repeatCell: {
        range: {
          sheetId: meta.evalSheetId,
          startRowIndex: rowIndex - 1,
          endRowIndex: rowIndex,
          startColumnIndex: commentCol - 1,
          endColumnIndex: commentCol
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: ratingInfo.rgb,
            wrapStrategy: 'WRAP',
            verticalAlignment: 'TOP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,wrapStrategy,verticalAlignment)'
      }
    });

    // Score cell formatting
    if (scoreCol) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: meta.evalSheetId,
            startRowIndex: rowIndex - 1,
            endRowIndex: rowIndex,
            startColumnIndex: scoreCol - 1,
            endColumnIndex: scoreCol
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: ratingInfo.rgb,
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              textFormat: { bold: true, fontSize: 11 }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
        }
      });
    }
  } else {
    // Clear formatting
    requests.push({
      repeatCell: {
        range: {
          sheetId: meta.evalSheetId,
          startRowIndex: rowIndex - 1,
          endRowIndex: rowIndex,
          startColumnIndex: commentCol - 1,
          endColumnIndex: commentCol
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,wrapStrategy)'
      }
    });

    if (scoreCol) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: meta.evalSheetId,
            startRowIndex: rowIndex - 1,
            endRowIndex: rowIndex,
            startColumnIndex: scoreCol - 1,
            endColumnIndex: scoreCol
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 1, green: 1, blue: 1 },
              horizontalAlignment: 'CENTER'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,horizontalAlignment)'
        }
      });
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests }
    });
  }

  // Update in-memory cache
  if (cachedData) {
    const form = cachedData.forms.find(f => f.rowIndex === rowIndex);
    if (form) {
      form.evaluations[reviewer.name] = {
        comment: comment || '',
        ratingKey: ratingInfo ? ratingKey || SCORE_MAP[finalScore] : null,
        score: finalScore || null,
        fillColor: ratingInfo ? ratingInfo.hex : null
      };
    }
    cachedData.lastSynced = new Date().toISOString();
  }

  return {
    success: true,
    score: finalScore,
    ratingKey: ratingInfo ? ratingKey || SCORE_MAP[finalScore] : null,
    fillColor: ratingInfo ? ratingInfo.hex : null
  };
}

// Add a new reviewer
async function addReviewer(name) {
  const trimmed = name.trim();
  const currentData = await fetchFromGoogleSheet(true);

  if (currentData.reviewers.some(r => r.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`Người chấm "${trimmed}" đã tồn tại!`);
  }

  const sheets = getSheetsClient();
  const meta = await getSheetMetadata();

  // Find max column currently used by reviewers
  let maxCol = 25;
  currentData.reviewers.forEach(r => {
    if (r.colIndex > maxCol) maxCol = r.colIndex;
    if (r.scoreColIndex && r.scoreColIndex > maxCol) maxCol = r.scoreColIndex;
  });

  const newCommentCol = maxCol + 1; // 1-indexed
  const newScoreCol = maxCol + 2;   // 1-indexed

  // Update Row 2 with headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${meta.evalSheetTitle}!${colToLetter(newCommentCol)}2:${colToLetter(newScoreCol)}2`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[trimmed, `Điểm - ${trimmed}`]]
    }
  });

  // Apply styling to header cells
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: meta.evalSheetId,
              startRowIndex: 1,
              endRowIndex: 2,
              startColumnIndex: newCommentCol - 1,
              endColumnIndex: newScoreCol
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.96, blue: 0.98 },
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: meta.evalSheetId,
              dimension: 'COLUMNS',
              startIndex: newCommentCol - 1,
              endIndex: newCommentCol
            },
            properties: { pixelSize: 280 },
            fields: 'pixelSize'
          }
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: meta.evalSheetId,
              dimension: 'COLUMNS',
              startIndex: newScoreCol - 1,
              endIndex: newScoreCol
            },
            properties: { pixelSize: 95 },
            fields: 'pixelSize'
          }
        }
      ]
    }
  });

  // Re-fetch to update cache
  await fetchFromGoogleSheet(true);

  return {
    success: true,
    name: trimmed,
    colIndex: newCommentCol,
    scoreColIndex: newScoreCol
  };
}

// Delete a reviewer
async function deleteReviewer(name) {
  const currentData = await fetchFromGoogleSheet(true);
  const target = currentData.reviewers.find(r => r.name.toLowerCase() === name.trim().toLowerCase());

  if (!target) {
    throw new Error(`Không tìm thấy người chấm: ${name}`);
  }

  const sheets = getSheetsClient();
  const meta = await getSheetMetadata();

  // Clear comment column and score column values and backgrounds
  const clearCols = [target.colIndex];
  if (target.scoreColIndex) clearCols.push(target.scoreColIndex);

  const clearRanges = clearCols.map(c => `${meta.evalSheetTitle}!${colToLetter(c)}2:${colToLetter(c)}500`);
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { ranges: clearRanges }
  });

  const clearRequests = clearCols.map(c => ({
    repeatCell: {
      range: {
        sheetId: meta.evalSheetId,
        startRowIndex: 1,
        endRowIndex: 50,
        startColumnIndex: c - 1,
        endColumnIndex: c
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 1, green: 1, blue: 1 }
        }
      },
      fields: 'userEnteredFormat.backgroundColor'
    }
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: clearRequests }
  });

  // Re-fetch to update cache
  await fetchFromGoogleSheet(true);

  return { success: true, deletedName: name };
}

module.exports = {
  fetchFromGoogleSheet,
  saveEvaluation,
  addReviewer,
  deleteReviewer,
  RATING_COLORS,
  SCORE_MAP,
  COLUMN_MAP,
  HE_THONG_COLS,
  TTSK_COLS,
  colToLetter
};
