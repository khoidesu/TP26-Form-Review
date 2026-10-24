const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const ExcelJS = require('exceljs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const googleSheetsService = require('./googleSheetsService');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Track connected WebSocket clients
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    clients.delete(ws);
  });

  // Send initial welcome message
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Real-time WebSocket connected' }));
});

// Ping interval to keep connections alive
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// Broadcast helper
function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Find local Excel file (if present, for backup)
function getExcelPath() {
  try {
    const files = fs.readdirSync(__dirname);
    const xlsxFile = files.find(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
    return xlsxFile ? path.join(__dirname, xlsxFile) : null;
  } catch (e) {
    return null;
  }
}

// Helper: Backup evaluation to local Excel file
async function backupToLocalExcel(rowIndex, reviewerName, comment, ratingKey, score) {
  try {
    const filePath = getExcelPath();
    if (!filePath) return;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const wsEval = workbook.getWorksheet('ĐÁNH GIÁ');
    if (!wsEval) return;

    // Find reviewer column in row 2
    let reviewerCol = null;
    const row2 = wsEval.getRow(2);
    for (let c = 26; c <= 50; c++) {
      const v = row2.getCell(c).value;
      if (v && String(v).trim().toLowerCase() === reviewerName.trim().toLowerCase()) {
        reviewerCol = c;
        break;
      }
    }

    if (reviewerCol) {
      const row = wsEval.getRow(rowIndex);
      const cell = row.getCell(reviewerCol);
      cell.value = comment;

      if (ratingKey && googleSheetsService.RATING_COLORS[ratingKey]) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: googleSheetsService.RATING_COLORS[ratingKey].hex }
        };
      } else {
        cell.fill = { type: 'pattern', pattern: 'none' };
      }
      cell.alignment = { wrapText: true, vertical: 'top' };
      row.commit();
      await workbook.xlsx.writeFile(filePath);
    }
  } catch (err) {
    console.warn('Local Excel backup warning:', err.message);
  }
}

// GET /api/data - Fetch all forms & reviewer data from Google Sheet
app.get('/api/data', async (req, res) => {
  try {
    const data = await googleSheetsService.fetchFromGoogleSheet(false);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/data:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sync - Force refresh from Google Sheet
app.get('/api/sync', async (req, res) => {
  try {
    const data = await googleSheetsService.fetchFromGoogleSheet(true);
    broadcast({ type: 'DATA_REFRESHED', lastSynced: data.lastSynced });
    res.json({ success: true, lastSynced: data.lastSynced, formCount: data.forms.length });
  } catch (error) {
    console.error('Error in /api/sync:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/evaluate - Save evaluation (comment + 1-5 score) to Google Sheet & Broadcast
app.post('/api/evaluate', async (req, res) => {
  try {
    const { rowIndex, reviewerName, reviewerCol, comment, ratingKey, score } = req.body;

    if (!rowIndex || (!reviewerName && !reviewerCol)) {
      return res.status(400).json({ error: 'Thiếu thông tin đánh giá (rowIndex, reviewer)!' });
    }

    // Validation: Reviewer MUST choose a score (1 - 5)
    const parsedScore = (score !== undefined && score !== null && score !== '') ? parseInt(score) : null;
    if (!ratingKey && (parsedScore === null || isNaN(parsedScore) || parsedScore < 1 || parsedScore > 5)) {
      return res.status(400).json({ error: 'Bắt buộc phải chọn điểm đánh giá (1 - 5 điểm) trước khi lưu và chấm bài!' });
    }

    // Save to Google Sheet
    const result = await googleSheetsService.saveEvaluation({
      rowIndex: parseInt(rowIndex),
      reviewerName,
      reviewerCol: reviewerCol ? parseInt(reviewerCol) : undefined,
      comment: comment || '',
      ratingKey: ratingKey || null,
      score: parsedScore || undefined
    });

    // Find form ID for broadcasting
    const cache = await googleSheetsService.fetchFromGoogleSheet(false);
    const form = cache.forms.find(f => f.rowIndex === parseInt(rowIndex));
    const formId = form ? form.id : parseInt(rowIndex) - 2;
    const actualReviewerName = reviewerName || (cache.reviewers.find(r => r.colIndex === parseInt(reviewerCol))?.name);

    // Broadcast to all connected WebSocket clients
    broadcast({
      type: 'EVALUATION_UPDATED',
      rowIndex: parseInt(rowIndex),
      formId: formId,
      reviewer: actualReviewerName,
      comment: comment || '',
      ratingKey: result.ratingKey,
      score: result.score,
      fillColor: result.fillColor,
      timestamp: new Date().toISOString()
    });

    // Backup to local file asynchronously
    backupToLocalExcel(parseInt(rowIndex), actualReviewerName, comment, ratingKey, result.score);

    res.json({
      success: true,
      score: result.score,
      ratingKey: result.ratingKey,
      fillColor: result.fillColor
    });
  } catch (error) {
    console.error('Error in /api/evaluate:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/add-reviewer - Add a new reviewer column to Google Sheet
app.post('/api/add-reviewer', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập tên người chấm!' });
    }

    const result = await googleSheetsService.addReviewer(name);

    // Broadcast reviewer added
    broadcast({
      type: 'REVIEWER_ADDED',
      name: result.name,
      colIndex: result.colIndex,
      scoreColIndex: result.scoreColIndex
    });

    res.json(result);
  } catch (error) {
    console.error('Error in /api/add-reviewer:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/delete-reviewer - Delete/clear reviewer columns in Google Sheet
app.post('/api/delete-reviewer', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tên người chấm cần xoá!' });
    }

    const result = await googleSheetsService.deleteReviewer(name);

    broadcast({
      type: 'REVIEWER_DELETED',
      deletedName: name
    });

    res.json(result);
  } catch (error) {
    console.error('Error in /api/delete-reviewer:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/gemini/models - Fetch available models supporting generateContent for the key
app.get('/api/gemini/models', async (req, res) => {
  const apiKey = req.headers['x-gemini-key'] || req.query.apiKey;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'Vui lòng cung cấp Gemini API Key!' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || `Lỗi truy vấn danh sách model (HTTP ${response.status})`
      });
    }

    const models = (data.models || [])
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => {
        const id = m.name.replace(/^models\//, '');
        return {
          id,
          displayName: m.displayName || id,
          description: m.description || ''
        };
      });

    res.json({ success: true, models });
  } catch (error) {
    console.error('Error fetching Gemini models:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to check if a model is deprecated, not found, or unsupported
function isGeminiModelUnavailable(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('is not found') || 
         msg.includes('no longer available') || 
         msg.includes('not supported') ||
         msg.includes('not found for api version');
}

// POST /api/gemini/test-key - Test if a Gemini API key is valid
app.post('/api/gemini/test-key', async (req, res) => {
  const apiKey = req.headers['x-gemini-key'] || req.body.apiKey;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'Vui lòng cung cấp Gemini API Key!' });
  }

  const model = req.body.model || 'gemini-3.8-flash';
  let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

  try {
    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Ping' }] }]
      })
    });

    let data = await response.json();

    // Auto-fallback if the specified model is no longer available or not found
    if (!response.ok && isGeminiModelUnavailable(data.error)) {
      const fallbackModel = model === 'gemini-3.8-flash' ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash';
      url = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey.trim()}`;
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Ping' }] }]
        })
      });
      data = await response.json();
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || `API Key không hợp lệ (HTTP ${response.status})`
      });
    }

    res.json({ success: true, message: 'Gemini API Key hợp lệ và sẵn sàng hoạt động!' });
  } catch (error) {
    console.error('Error testing Gemini key:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/gemini/suggest - Call Gemini to analyze candidate responses and suggest score/comment
app.post('/api/gemini/suggest', async (req, res) => {
  const apiKey = req.headers['x-gemini-key'] || req.body.apiKey;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'Chưa có Gemini API Key! Vui lòng cài đặt API Key cá nhân.' });
  }

  const { prompt, systemInstruction, model } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Thiếu nội dung bài làm ứng viên cần phân tích!' });
  }

  const modelName = model || 'gemini-3.8-flash';
  let url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey.trim()}`;

  try {
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = await response.json();

    // Auto-fallback if the specified model is no longer available or not found
    if (!response.ok && isGeminiModelUnavailable(data.error)) {
      const fallbackModel = modelName === 'gemini-3.8-flash' ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash';
      console.warn(`Model ${modelName} unavailable, falling back to ${fallbackModel}...`);
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey.trim()}`;
      response = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      data = await response.json();
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || `Lỗi Gemini API (HTTP ${response.status})`
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(500).json({ error: 'Gemini không trả về phản hồi hợp lệ.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        parsed = { rawText: text };
      }
    }

    res.json({ success: true, result: parsed });
  } catch (error) {
    console.error('Error calling Gemini suggest:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/export-excel - Export Excel file with Reviewer comments and scores
app.get('/api/export-excel', async (req, res) => {
  try {
    const reviewerName = req.query.reviewer;
    if (!reviewerName) {
      return res.status(400).json({ error: 'Cần có tên người chấm (reviewer)' });
    }

    const data = await googleSheetsService.fetchFromGoogleSheet(false);
    const reviewer = data.reviewers.find(r => r.name.toLowerCase() === reviewerName.trim().toLowerCase());

    if (!reviewer) {
      return res.status(404).json({ error: `Không tìm thấy người chấm '${reviewerName}'` });
    }

    const wbOut = new ExcelJS.Workbook();
    wbOut.creator = 'Signal From The Deep Ocean - Form Evaluator';
    wbOut.created = new Date();

    // ----------------------------------------------------
    // Sheet 1: Cot_Copy_Vao_File_Tong (Cột nhận xét + Cột Điểm)
    // ----------------------------------------------------
    const ws1 = wbOut.addWorksheet('Cot_Copy_Vao_File_Tong');
    ws1.getColumn(1).width = 75; // Cột Nhận xét
    ws1.getColumn(2).width = 16; // Cột Điểm

    // Row 1: Header
    const r1 = ws1.getRow(1);
    r1.getCell(1).value = 'ĐÁNH GIÁ (NHẬN XÉT)';
    r1.getCell(2).value = 'ĐIỂM (1 - 5)';
    [1, 2].forEach(c => {
      r1.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      r1.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      r1.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    r1.height = 28;

    // Row 2: Reviewer Name & Score Header
    const r2 = ws1.getRow(2);
    r2.getCell(1).value = reviewer.name;
    r2.getCell(2).value = `Điểm - ${reviewer.name}`;
    [1, 2].forEach(c => {
      r2.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      r2.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF176' } };
      r2.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    r2.height = 28;

    const candidateList = [];

    // Rows 3 to ... matching rowIndex
    data.forms.forEach(form => {
      const outRow = ws1.getRow(form.rowIndex);
      const ev = form.evaluations[reviewer.name] || {};

      const commentCell = outRow.getCell(1);
      const scoreCell = outRow.getCell(2);

      commentCell.value = ev.comment || '';
      scoreCell.value = ev.score !== null && ev.score !== undefined ? ev.score : '';

      const fillArgb = ev.fillColor;
      if (fillArgb && fillArgb !== '00000000') {
        commentCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
        scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
      }

      commentCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
      commentCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

      scoreCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
      scoreCell.alignment = { vertical: 'middle', horizontal: 'center' };

      [1, 2].forEach(c => {
        outRow.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });

      if (ev.comment) {
        outRow.height = Math.max(30, Math.min(140, String(ev.comment).split('\n').length * 18 + 12));
      } else {
        outRow.height = 24;
      }

      candidateList.push({
        rowIdx: form.rowIndex,
        id: form.id,
        ban: form.ban || 'N/A',
        name: form.data[2] || 'N/A',
        mssv: form.data[3] || 'N/A',
        comment: ev.comment || '',
        score: ev.score,
        ratingKey: ev.ratingKey,
        fillArgb: fillArgb
      });
    });

    // ----------------------------------------------------
    // Sheet 2: Doi_Chieu_Chi_Tiet
    // ----------------------------------------------------
    const ws2 = wbOut.addWorksheet('Doi_Chieu_Chi_Tiet');
    ws2.columns = [
      { header: 'Dòng Excel', key: 'rowIdx', width: 12 },
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Ban', key: 'ban', width: 24 },
      { header: 'Họ và tên', key: 'name', width: 26 },
      { header: 'MSSV', key: 'mssv', width: 16 },
      { header: 'Đánh giá (' + reviewer.name + ')', key: 'comment', width: 65 },
      { header: 'Điểm (1-5)', key: 'score', width: 14 },
      { header: 'Màu / Xếp loại', key: 'ratingName', width: 20 }
    ];

    const s2Header = ws2.getRow(1);
    s2Header.height = 28;
    s2Header.eachCell(c => {
      c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const ratingNames = {
      'excellent': 'Cực tốt (5đ)',
      'good': 'Tốt (4đ)',
      'fair': 'Tạm (3đ)',
      'ok': 'OK (2đ)',
      'poor': 'Tệ (1đ)'
    };

    candidateList.forEach(cand => {
      const addedRow = ws2.addRow({
        rowIdx: cand.rowIdx,
        id: cand.id,
        ban: cand.ban,
        name: cand.name,
        mssv: cand.mssv,
        comment: cand.comment,
        score: cand.score !== null && cand.score !== undefined ? `${cand.score} điểm` : 'Chưa chấm',
        ratingName: cand.ratingKey && ratingNames[cand.ratingKey] ? ratingNames[cand.ratingKey] : (cand.comment ? 'Chưa chọn màu' : 'Chưa chấm')
      });

      const commentCell = addedRow.getCell(6);
      const scoreCell = addedRow.getCell(7);

      commentCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      scoreCell.alignment = { horizontal: 'center', vertical: 'middle' };

      if (cand.fillArgb && cand.fillArgb !== '00000000') {
        commentCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cand.fillArgb } };
        scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cand.fillArgb } };
      }

      addedRow.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      addedRow.getCell(2).alignment = { horizontal: 'center', vertical: 'top' };
      addedRow.getCell(3).alignment = { vertical: 'top' };
      addedRow.getCell(4).alignment = { vertical: 'top' };
      addedRow.getCell(5).alignment = { horizontal: 'center', vertical: 'top' };
      addedRow.getCell(8).alignment = { horizontal: 'center', vertical: 'top' };

      addedRow.eachCell(c => {
        c.font = { name: 'Calibri', size: 11 };
        c.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });

      if (cand.comment) {
        addedRow.height = Math.max(28, Math.min(140, String(cand.comment).split('\n').length * 18 + 10));
      } else {
        addedRow.height = 24;
      }
    });

    const safeReviewer = reviewer.name.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
    const filename = `Danh_gia_${safeReviewer}_kem_diem.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    await wbOut.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting excel:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/export-candidate-excel - Export dedicated Excel file for ONE candidate
app.get('/api/export-candidate-excel', async (req, res) => {
  try {
    const candidateId = parseInt(req.query.id);
    if (!candidateId) {
      return res.status(400).json({ error: 'Cần cung cấp ID ứng viên' });
    }

    const data = await googleSheetsService.fetchFromGoogleSheet(false);
    const form = data.forms.find(f => f.id === candidateId);

    if (!form) {
      return res.status(404).json({ error: `Không tìm thấy ứng viên ID #${candidateId}` });
    }

    const wbOut = new ExcelJS.Workbook();
    wbOut.creator = 'Signal From The Deep Ocean - Form Evaluator';
    wbOut.created = new Date();

    const ratingNames = {
      'excellent': 'Cực tốt (5đ)',
      'good': 'Tốt (4đ)',
      'fair': 'Tạm (3đ)',
      'ok': 'OK (2đ)',
      'poor': 'Tệ (1đ)'
    };

    // ----------------------------------------------------
    // Sheet 1: Đánh giá chi tiết của ứng viên
    // ----------------------------------------------------
    const ws1 = wbOut.addWorksheet('Danh_Gia_Tong_Hop');
    ws1.getColumn(1).width = 8;
    ws1.getColumn(2).width = 22;
    ws1.getColumn(3).width = 16;
    ws1.getColumn(4).width = 20;
    ws1.getColumn(5).width = 75;

    // Title banner
    ws1.mergeCells('A1:E1');
    const r1 = ws1.getCell('A1');
    r1.value = `ĐÁNH GIÁ ỨNG VIÊN: ${form.data[2] || 'N/A'} (ID: #${form.id})`;
    r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    r1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(1).height = 36;

    // Candidate metadata
    const metaRows = [
      ['Họ và tên:', form.data[2] || 'N/A', 'MSSV:', form.data[3] || 'N/A'],
      ['Ban ứng tuyển:', form.ban || 'N/A', 'Lớp:', form.data[5] || 'N/A'],
      ['Email:', form.data[4] || 'N/A', 'Form ID:', `#${form.id}`]
    ];

    metaRows.forEach((m, idx) => {
      const rowIdx = 3 + idx;
      const row = ws1.getRow(rowIdx);
      row.getCell(2).value = m[0];
      row.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF475569' } };
      row.getCell(3).value = m[1];
      row.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
      row.getCell(4).value = m[2];
      row.getCell(4).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF475569' } };
      row.getCell(5).value = m[3];
      row.getCell(5).font = { name: 'Calibri', size: 11 };
      row.height = 22;
    });

    // Reviewer table header at row 7
    const hRow = ws1.getRow(7);
    hRow.values = ['', 'STT', 'Giám khảo', 'Điểm số (1-5)', 'Mức xếp loại', 'Nhận xét chi tiết'];
    // Re-assign correctly to columns 1-5
    ws1.getCell('A7').value = 'STT';
    ws1.getCell('B7').value = 'Giám khảo';
    ws1.getCell('C7').value = 'Điểm số (1-5)';
    ws1.getCell('D7').value = 'Mức xếp loại';
    ws1.getCell('E7').value = 'Nhận xét chi tiết';

    ['A7', 'B7', 'C7', 'D7', 'E7'].forEach(addr => {
      const cell = ws1.getCell(addr);
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    hRow.height = 28;

    let totalScore = 0;
    let ratedCount = 0;
    let currRow = 8;

    data.reviewers.forEach((rev, revIdx) => {
      const ev = form.evaluations && form.evaluations[rev.name];
      const row = ws1.getRow(currRow);

      const hasRated = ev && (ev.score !== null && ev.score !== undefined);
      if (hasRated) {
        totalScore += parseInt(ev.score);
        ratedCount++;
      }

      row.getCell(1).value = revIdx + 1;
      row.getCell(2).value = rev.name;
      row.getCell(3).value = hasRated ? `${ev.score} điểm` : 'Chưa chấm';
      row.getCell(4).value = ev?.ratingKey && ratingNames[ev.ratingKey] ? ratingNames[ev.ratingKey] : (hasRated ? 'Đã chấm' : '-');
      row.getCell(5).value = ev?.comment || (hasRated ? '(Không có nhận xét chữ)' : 'Chưa có đánh giá');

      row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'top' };
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'top' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'top' };
      row.getCell(5).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

      const fillArgb = ev?.fillColor;
      if (fillArgb && fillArgb !== '00000000') {
        row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
        row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
      }

      [1, 2, 3, 4, 5].forEach(col => {
        row.getCell(col).font = { name: 'Calibri', size: 11 };
        row.getCell(col).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });

      row.height = ev?.comment ? Math.max(28, Math.min(120, String(ev.comment).split('\n').length * 18 + 10)) : 24;
      currRow++;
    });

    // Summary Total & Avg Row
    const sumRow = ws1.getRow(currRow);
    sumRow.getCell(1).value = '';
    sumRow.getCell(2).value = 'TỔNG ĐIỂM / TRUNG BÌNH';
    sumRow.getCell(3).value = `${totalScore} điểm`;
    sumRow.getCell(4).value = ratedCount > 0 ? `TB: ${(totalScore / ratedCount).toFixed(2)} ★` : '0 ★';
    sumRow.getCell(5).value = `Đã có ${ratedCount}/${data.reviewers.length} giám khảo hoàn thành đánh giá`;

    [2, 3, 4, 5].forEach(c => {
      sumRow.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      sumRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF176' } };
      sumRow.getCell(c).border = {
        top: { style: 'medium', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } }
      };
    });
    sumRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    sumRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    sumRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    sumRow.getCell(5).alignment = { vertical: 'middle' };
    sumRow.height = 30;

    // ----------------------------------------------------
    // Sheet 2: Toàn bộ câu trả lời form của ứng viên
    // ----------------------------------------------------
    const ws2 = wbOut.addWorksheet('Cau_Tra_Loi_Chi_Tiet');
    ws2.getColumn(1).width = 10;
    ws2.getColumn(2).width = 38;
    ws2.getColumn(3).width = 85;

    const s2H = ws2.getRow(1);
    s2H.values = ['Mã cột', 'Câu hỏi / Hạng mục', 'Nội dung câu trả lời của ứng viên'];
    ['A1', 'B1', 'C1'].forEach(addr => {
      const cell = ws2.getCell(addr);
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    s2H.height = 28;

    for (let c = 1; c <= 24; c++) {
      const label = data.columnMap[c] || `Cột ${c}`;
      const answer = form.data[c] || '';
      const r = ws2.addRow([`C${c}`, label, answer]);

      r.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      r.getCell(2).alignment = { vertical: 'top' };
      r.getCell(2).font = { name: 'Calibri', size: 11, bold: true };
      r.getCell(3).alignment = { wrapText: true, vertical: 'top' };
      r.getCell(3).font = { name: 'Calibri', size: 11 };

      [1, 2, 3].forEach(col => {
        r.getCell(col).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });

      r.height = answer ? Math.max(26, Math.min(140, String(answer).split('\n').length * 18 + 10)) : 22;
    }

    const safeName = (form.data[2] || 'Ung_vien').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
    const filename = `Danh_gia_Ung_vien_${form.id}_${safeName}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    await wbOut.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting candidate excel:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/export-summary-excel - Export full leaderboard/summary of all candidates
app.get('/api/export-summary-excel', async (req, res) => {
  try {
    const data = await googleSheetsService.fetchFromGoogleSheet(false);
    const wbOut = new ExcelJS.Workbook();
    wbOut.creator = 'Signal From The Deep Ocean - Form Evaluator';
    wbOut.created = new Date();

    const ws = wbOut.addWorksheet('Bang_Tong_Hop_Diem');

    // Calculate score metrics for each form
    const rankedForms = data.forms.map(form => {
      let totalScore = 0;
      let ratedCount = 0;
      data.reviewers.forEach(rev => {
        const ev = form.evaluations && form.evaluations[rev.name];
        if (ev && ev.score !== null && ev.score !== undefined) {
          totalScore += parseInt(ev.score);
          ratedCount++;
        }
      });
      const avgScore = ratedCount > 0 ? parseFloat((totalScore / ratedCount).toFixed(2)) : 0;
      return { form, totalScore, ratedCount, avgScore };
    });

    // Sort by Total Score descending
    rankedForms.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      return a.form.id - b.form.id;
    });

    // Columns configuration
    const cols = [
      { header: 'Hạng', key: 'rank', width: 8 },
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Họ và tên', key: 'name', width: 24 },
      { header: 'MSSV', key: 'mssv', width: 14 },
      { header: 'Ban ứng tuyển', key: 'ban', width: 22 },
      { header: 'Lớp', key: 'class', width: 14 },
      { header: 'Email', key: 'email', width: 28 }
    ];

    data.reviewers.forEach(rev => {
      cols.push({ header: `Điểm (${rev.name})`, key: `score_${rev.name}`, width: 15 });
    });

    cols.push(
      { header: 'Tổng điểm', key: 'totalScore', width: 14 },
      { header: 'Điểm TB', key: 'avgScore', width: 14 },
      { header: 'Số GK đã chấm', key: 'ratedCount', width: 16 }
    );

    ws.columns = cols;

    // Header styling
    const headerRow = ws.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell(c => {
      c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    rankedForms.forEach((item, idx) => {
      const f = item.form;
      const rowData = {
        rank: idx + 1,
        id: f.id,
        name: f.data[2] || 'N/A',
        mssv: f.data[3] || 'N/A',
        ban: f.ban || 'N/A',
        class: f.data[5] || 'N/A',
        email: f.data[4] || 'N/A',
        totalScore: item.totalScore,
        avgScore: item.avgScore,
        ratedCount: `${item.ratedCount}/${data.reviewers.length}`
      };

      data.reviewers.forEach(rev => {
        const ev = f.evaluations && f.evaluations[rev.name];
        rowData[`score_${rev.name}`] = ev && ev.score !== null && ev.score !== undefined ? `${ev.score}đ` : '-';
      });

      const added = ws.addRow(rowData);
      added.height = 24;

      added.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      added.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      added.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      added.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      added.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

      // Reviewer score styling
      let colIdx = 8;
      data.reviewers.forEach(rev => {
        const ev = f.evaluations && f.evaluations[rev.name];
        const cell = added.getCell(colIdx);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (ev && ev.fillColor && ev.fillColor !== '00000000') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ev.fillColor } };
          cell.font = { bold: true };
        }
        colIdx++;
      });

      // Total Score & Avg styling
      const totalCell = added.getCell(colIdx);
      totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
      totalCell.font = { bold: true, size: 11, color: { argb: 'FF0369A1' } };

      const avgCell = added.getCell(colIdx + 1);
      avgCell.alignment = { horizontal: 'center', vertical: 'middle' };
      avgCell.font = { bold: true };

      const countCell = added.getCell(colIdx + 2);
      countCell.alignment = { horizontal: 'center', vertical: 'middle' };

      added.eachCell(c => {
        c.font = c.font || { name: 'Calibri', size: 11 };
        c.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });
    });

    const filename = `Bang_tong_hop_diem_Trainee_Program_2026.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    await wbOut.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting summary excel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Note: Background polling interval removed to prevent automatic reloads and screen interrupts.
// Sync to Google Sheet happens explicitly when users save evaluations or click sync.

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌊 Signal Form Evaluator Server running on port ${PORT}`);
  console.log(`📊 Connected to Google Sheet: https://docs.google.com/spreadsheets/d/1EkPPK0w5yLrSAGAxsbb3Td8lYZcpuYda4XxFONUyS0E`);
  console.log(`⚡ WebSocket live sync enabled`);
});
