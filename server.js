const express = require('express');
const ExcelJS = require('exceljs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Find the Excel file
function getExcelPath() {
  const files = fs.readdirSync(__dirname);
  const xlsxFile = files.find(f => f.endsWith('.xlsx'));
  if (!xlsxFile) throw new Error('No xlsx file found');
  return path.join(__dirname, xlsxFile);
}

// Helper: extract cell value (handle formulas, rich text, etc.)
function getCellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  const v = cell.value;
  // ExcelJS formula object: { formula, result }
  if (typeof v === 'object' && v !== null) {
    if (v.result !== undefined && v.result !== null) {
      // result can also be richText
      if (typeof v.result === 'object' && v.result.richText) {
        return v.result.richText.map(rt => rt.text).join('');
      }
      return String(v.result);
    }
    if (v.richText) {
      return v.richText.map(rt => rt.text).join('');
    }
    if (v.text) return String(v.text);
    if (v.formula) return ''; // formula with no cached result
    return String(v);
  }
  return String(v);
}

// Mapping: RESPONSES sheet column -> ĐÁNH GIÁ sheet column label
// RESPONSES columns: F(6)=Họ tên, G(7)=MSSV, I(9)=Email, J(10)=Lớp,
// L(12)..AD(30) = answer columns
// ĐÁNH GIÁ columns: 1=ID, 2=Họ tên, 3=MSSV, 4=Email, 5=Lớp, 6..24=answers
const RESPONSE_TO_EVAL_MAP = {
  // RESPONSES col -> ĐÁNH GIÁ col index
  6: 2,   // Họ và tên
  7: 3,   // MSSV
  9: 4,   // Email
  10: 5,  // Lớp sinh hoạt
  12: 6,  // Tự định nghĩa bản thân
  13: 7,  // Kỹ năng mới
  14: 8,  // Lịch học
  15: 9,  // Lĩnh vực (Ban)
  16: 10, // Ngôn ngữ lập trình
  17: 11, // Định hướng nghề nghiệp
  18: 12, // Kế hoạch nhóm
  19: 13, // Kiến thức Hệ thống
  20: 14, // Lĩnh vực hứng thú TTSK
  21: 15, // Kỹ năng thiết kế
  22: 16, // Thiết bị chụp ảnh
  23: 17, // Link sản phẩm
  24: 18, // Tìm ý tưởng sáng tạo
  25: 19, // Xử lý ý kiến phản đối
  26: 20, // Leader/Khác
  27: 21, // Quản lý nhóm
  28: 22, // Xử lý sự cố
  29: 23, // Mong đợi Trainee
  30: 24, // Lời nhắn BTC
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

// Which columns are relevant for which ban
const HE_THONG_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19, 23, 24];
const TTSK_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

// Rating color map
const RATING_COLORS = {
  'excellent': { hex: 'FF00C853', name: 'Cực tốt', color: '#00C853' },
  'good':      { hex: 'FF2196F3', name: 'Tốt', color: '#2196F3' },
  'fair':      { hex: 'FFFFD600', name: 'Tạm', color: '#FFD600' },
  'ok':        { hex: 'FFFF9100', name: 'OK', color: '#FF9100' },
  'poor':      { hex: 'FFFF1744', name: 'Tệ', color: '#FF1744' }
};

// GET /api/data - Read all forms data
app.get('/api/data', async (req, res) => {
  try {
    const filePath = getExcelPath();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // ---- Read actual data from RESPONSES sheet ----
    const wsResp = workbook.getWorksheet('RESPONSES');
    const responseData = {}; // key: ID, value: { colIndex: value }

    for (let rowIdx = 2; rowIdx <= wsResp.rowCount; rowIdx++) {
      const row = wsResp.getRow(rowIdx);
      const id = getCellValue(row.getCell(1)); // Column A = Id
      if (!id || id === '' || id === '0') continue;

      const data = { 1: id }; // col 1 = ID
      for (const [respCol, evalCol] of Object.entries(RESPONSE_TO_EVAL_MAP)) {
        const val = getCellValue(row.getCell(parseInt(respCol)));
        data[evalCol] = val;
      }
      responseData[id] = data;
    }

    // ---- Read evaluations from ĐÁNH GIÁ sheet ----
    const wsEval = workbook.getWorksheet('ĐÁNH GIÁ');

    // Get reviewer names from row 2 (columns 26+)
    const reviewers = [];
    const row2 = wsEval.getRow(2);
    for (let col = 26; col <= 50; col++) {
      const val = getCellValue(row2.getCell(col));
      if (val) {
        reviewers.push({ name: val, colIndex: col });
      }
    }

    // Build forms list
    const forms = [];
    for (let rowIdx = 3; rowIdx <= wsEval.rowCount; rowIdx++) {
      const row = wsEval.getRow(rowIdx);
      const idCell = row.getCell(1);
      const id = getCellValue(idCell);
      if (!id || id === '' || id === '0') continue;

      // Get form data from RESPONSES
      const formData = responseData[id] || { 1: id };

      // Read existing evaluations from ĐÁNH GIÁ
      const evaluations = {};
      for (const reviewer of reviewers) {
        const cell = row.getCell(reviewer.colIndex);
        const val = getCellValue(cell);
        let fillColor = null;

        if (cell.style && cell.style.fill) {
          const fill = cell.style.fill;
          if (fill.fgColor && fill.fgColor.argb && fill.fgColor.argb !== '00000000') {
            fillColor = fill.fgColor.argb;
          }
        }

        evaluations[reviewer.name] = {
          comment: val,
          fillColor: fillColor
        };
      }

      forms.push({
        rowIndex: rowIdx,
        id: parseInt(id),
        data: formData,
        ban: formData[9] || '',
        evaluations: evaluations
      });
    }

    // Sort by ID
    forms.sort((a, b) => a.id - b.id);

    res.json({
      forms,
      reviewers,
      columnMap: COLUMN_MAP,
      heThongCols: HE_THONG_COLS,
      ttskCols: TTSK_COLS,
      ratingColors: RATING_COLORS
    });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/evaluate - Save evaluation
app.post('/api/evaluate', async (req, res) => {
  try {
    const { rowIndex, reviewerCol, comment, ratingKey } = req.body;

    const filePath = getExcelPath();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const wsEval = workbook.getWorksheet('ĐÁNH GIÁ');
    const row = wsEval.getRow(rowIndex);
    const cell = row.getCell(reviewerCol);

    // Set comment
    cell.value = comment;

    // Set fill color based on rating
    if (ratingKey && RATING_COLORS[ratingKey]) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: RATING_COLORS[ratingKey].hex }
      };
    } else {
      cell.fill = {
        type: 'pattern',
        pattern: 'none'
      };
    }

    cell.alignment = { wrapText: true, vertical: 'top' };

    row.commit();
    await workbook.xlsx.writeFile(filePath);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving evaluation:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/add-reviewer - Add a new reviewer column
app.post('/api/add-reviewer', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Vui lòng nhập tên người chấm' });

    const trimmedName = name.trim();
    const filePath = getExcelPath();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const wsEval = workbook.getWorksheet('ĐÁNH GIÁ');
    const row2 = wsEval.getRow(2);

    // Check for duplicate name & find next available column
    let nextCol = null;
    for (let col = 26; col <= 50; col++) {
      const val = getCellValue(row2.getCell(col));
      if (val && val.trim().toLowerCase() === trimmedName.toLowerCase()) {
        return res.status(400).json({ error: `Người chấm "${trimmedName}" đã tồn tại!` });
      }
      if (!val && nextCol === null) {
        nextCol = col;
      }
    }

    if (!nextCol) {
      return res.status(400).json({ error: 'Đã đạt giới hạn tối đa số lượng người chấm (cột 50)' });
    }

    const cell = row2.getCell(nextCol);
    cell.value = trimmedName;
    cell.font = { bold: true, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF176' }
    };
    cell.alignment = { horizontal: 'center' };

    row2.commit();
    await workbook.xlsx.writeFile(filePath);

    res.json({ success: true, colIndex: nextCol, name: trimmedName });
  } catch (error) {
    console.error('Error adding reviewer:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/delete-reviewer - Delete a reviewer column and shift subsequent columns left
app.post('/api/delete-reviewer', async (req, res) => {
  try {
    const { name, colIndex } = req.body;
    if (!name && !colIndex) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tên hoặc cột người chấm cần xoá' });
    }

    const filePath = getExcelPath();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const wsEval = workbook.getWorksheet('ĐÁNH GIÁ');
    const row2 = wsEval.getRow(2);

    // Collect all reviewer columns
    const reviewers = [];
    for (let col = 26; col <= 50; col++) {
      const val = getCellValue(row2.getCell(col));
      if (val) {
        reviewers.push({ name: val, colIndex: col });
      }
    }

    // Find the target reviewer
    let target = null;
    if (colIndex) {
      target = reviewers.find(r => r.colIndex === parseInt(colIndex));
    }
    if (!target && name) {
      target = reviewers.find(r => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    }

    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy người chấm cần xoá' });
    }

    const targetCol = target.colIndex;
    const lastCol = reviewers[reviewers.length - 1].colIndex;

    // Shift reviewer columns to the left from targetCol to lastCol for row 2 to wsEval.rowCount
    for (let r = 2; r <= wsEval.rowCount; r++) {
      const row = wsEval.getRow(r);
      for (let c = targetCol; c < lastCol; c++) {
        const nextCell = row.getCell(c + 1);
        const currCell = row.getCell(c);
        currCell.value = nextCell.value;
        currCell.style = nextCell.style ? JSON.parse(JSON.stringify(nextCell.style)) : {};
      }
      const lastCell = row.getCell(lastCol);
      lastCell.value = null;
      lastCell.style = {};
      row.commit();
    }

    await workbook.xlsx.writeFile(filePath);

    res.json({ success: true, deletedName: target.name, deletedCol: targetCol });
  } catch (error) {
    console.error('Error deleting reviewer:', error);
    res.status(500).json({ error: error.message });
  }
});
// Helper to infer rating color from text if fillColor was not set
function inferRatingColor(val, existingFill) {
  if (existingFill) return existingFill;
  if (!val) return null;
  const s = String(val).toUpperCase();
  if (s.includes('GUD!') || s.includes('CỰC TỐT')) return 'FF00C853';
  if (s.includes('GOOD!') || s.includes('TỐT')) return 'FF2196F3';
  if (s.includes('MID!') || s.includes('TẠM')) return 'FFFFD600';
  if (s.includes('OKI!') || s.includes('OK!')) return 'FFFF9100';
  if (s.includes('BAD!') || s.includes('TỆ')) return 'FFFF1744';
  return null;
}

// GET /api/export-excel - Export 1-column Excel file with both Hệ thống and TT-SK in exact row order
app.get('/api/export-excel', async (req, res) => {
  try {
    const reviewerName = req.query.reviewer;
    if (!reviewerName) {
      return res.status(400).json({ error: 'Reviewer name required' });
    }

    const filePath = getExcelPath();
    const wbMaster = new ExcelJS.Workbook();
    await wbMaster.xlsx.readFile(filePath);

    const wsEval = wbMaster.getWorksheet('ĐÁNH GIÁ');
    const wsResp = wbMaster.getWorksheet('RESPONSES');

    // Find reviewer column in row 2 of ĐÁNH GIÁ
    let reviewerCol = null;
    const row2 = wsEval.getRow(2);
    for (let col = 26; col <= 50; col++) {
      const val = getCellValue(row2.getCell(col));
      if (val && val.trim().toLowerCase() === reviewerName.trim().toLowerCase()) {
        reviewerCol = col;
        break;
      }
    }

    if (!reviewerCol) {
      return res.status(404).json({ error: `Reviewer '${reviewerName}' not found` });
    }

    // Build map of response data by ID
    const responseData = {};
    for (let r = 2; r <= wsResp.rowCount; r++) {
      const row = wsResp.getRow(r);
      const id = getCellValue(row.getCell(1));
      if (!id || id === '' || id === '0') continue;
      responseData[id] = {
        name: getCellValue(row.getCell(6)),
        mssv: getCellValue(row.getCell(7)),
        email: getCellValue(row.getCell(9)),
        ban: getCellValue(row.getCell(15))
      };
    }

    // Create export workbook
    const wbOut = new ExcelJS.Workbook();
    wbOut.creator = 'Signal From The Deep Ocean - Form Evaluator';
    wbOut.created = new Date();

    // ----------------------------------------------------
    // Sheet 1: 1 Cột Copy Vào File Tổng (Khớp chuẩn từng dòng)
    // ----------------------------------------------------
    const ws1 = wbOut.addWorksheet('Cot_Copy_Vao_File_Tong');
    ws1.getColumn(1).width = 70;

    // Row 1: Header ĐÁNH GIÁ
    const r1 = ws1.getRow(1);
    r1.getCell(1).value = 'ĐÁNH GIÁ';
    r1.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r1.height = 26;

    // Row 2: Reviewer Name (Matches row 2 in master sheet)
    const r2 = ws1.getRow(2);
    r2.getCell(1).value = reviewerName;
    r2.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF176' } };
    r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r2.height = 26;

    // List of candidate rows for Sheet 2
    const candidateList = [];

    // Rows 3 to wsEval.rowCount (matches exact row in master sheet!)
    for (let r = 3; r <= wsEval.rowCount; r++) {
      const masterRow = wsEval.getRow(r);
      const idVal = getCellValue(masterRow.getCell(1));
      if (!idVal || idVal === '' || idVal === '0') continue;

      const outRow = ws1.getRow(r);
      const cell = outRow.getCell(1);
      const masterCell = masterRow.getCell(reviewerCol);

      const val = getCellValue(masterCell);
      cell.value = val;

      let fillArgb = null;
      if (masterCell.style && masterCell.style.fill && masterCell.style.fill.fgColor && masterCell.style.fill.fgColor.argb) {
        fillArgb = masterCell.style.fill.fgColor.argb;
      }
      fillArgb = inferRatingColor(val, fillArgb);

      if (fillArgb && fillArgb !== '00000000') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fillArgb }
        };
      }

      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
      cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (val) {
        outRow.height = Math.max(30, Math.min(140, String(val).split('\n').length * 18 + 12));
      } else {
        outRow.height = 22;
      }

      // Collect data for Sheet 2
      const candidateInfo = responseData[idVal] || {};
      candidateList.push({
        rowIdx: r,
        id: idVal,
        ban: candidateInfo.ban || getCellValue(masterRow.getCell(9)) || 'N/A',
        name: candidateInfo.name || getCellValue(masterRow.getCell(2)) || 'N/A',
        mssv: candidateInfo.mssv || getCellValue(masterRow.getCell(3)) || 'N/A',
        comment: val,
        fillArgb: fillArgb
      });
    }

    // ----------------------------------------------------
    // Sheet 2: Bảng Đối Chiếu Chi Tiết (Có đầy đủ thông tin để kiểm tra)
    // ----------------------------------------------------
    const ws2 = wbOut.addWorksheet('Doi_Chieu_Chi_Tiet');
    ws2.columns = [
      { header: 'Dòng Excel', key: 'rowIdx', width: 12 },
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Ban', key: 'ban', width: 24 },
      { header: 'Họ và tên', key: 'name', width: 26 },
      { header: 'MSSV', key: 'mssv', width: 16 },
      { header: 'Đánh giá (' + reviewerName + ')', key: 'comment', width: 65 },
      { header: 'Màu / Xếp loại', key: 'ratingName', width: 18 }
    ];

    // Format Sheet 2 Header
    const s2Header = ws2.getRow(1);
    s2Header.height = 26;
    s2Header.eachCell(c => {
      c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const ratingNames = {
      'FF00C853': 'Cực tốt (Xanh lá)',
      'FF2196F3': 'Tốt (Xanh dương)',
      'FFFFD600': 'Tạm (Vàng)',
      'FFFF9100': 'OK (Cam)',
      'FFFF1744': 'Tệ (Đỏ)'
    };

    candidateList.forEach(cand => {
      const addedRow = ws2.addRow({
        rowIdx: cand.rowIdx,
        id: cand.id,
        ban: cand.ban,
        name: cand.name,
        mssv: cand.mssv,
        comment: cand.comment,
        ratingName: cand.fillArgb ? (ratingNames[cand.fillArgb] || 'Đã chấm') : (cand.comment ? 'Chưa chọn màu' : 'Chưa chấm')
      });

      // Cell style for Comment and Rating in Sheet 2
      const commentCell = addedRow.getCell(6);
      commentCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      if (cand.fillArgb && cand.fillArgb !== '00000000') {
        commentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: cand.fillArgb }
        };
      }

      addedRow.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      addedRow.getCell(2).alignment = { horizontal: 'center', vertical: 'top' };
      addedRow.getCell(3).alignment = { vertical: 'top' };
      addedRow.getCell(4).alignment = { vertical: 'top' };
      addedRow.getCell(5).alignment = { horizontal: 'center', vertical: 'top' };
      addedRow.getCell(7).alignment = { horizontal: 'center', vertical: 'top' };

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
        addedRow.height = 22;
      }
    });

    // Send file
    const safeReviewer = reviewerName.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
    const filename = `Danh_gia_${safeReviewer}_1cot.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    await wbOut.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting excel:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌊 Form Evaluation Server running on port ${PORT}`);
});
