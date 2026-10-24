// ============================================================
// 🌊 Signal From The Deep Ocean - Form Evaluator
// Application Logic
// ============================================================

const API_BASE = '';

// App State
const state = {
  forms: [],
  filteredForms: [],
  reviewers: [],
  columnMap: {},
  heThongCols: [],
  ttskCols: [],
  ratingColors: {},
  
  selectedReviewer: null,
  selectedReviewerCol: null,
  selectedBan: null,
  currentIndex: 0,
  currentRating: null,
};

// ---- Utility Functions ----
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function isLink(text) {
  return /^https?:\/\//i.test(text.trim());
}

function formatValue(val) {
  if (!val || val === '0' || val === 'N/A') return '<span style="color:var(--text-muted); font-style:italic">Không có câu trả lời</span>';
  // Convert URLs to links
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return val.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function mapRatingFromColor(colorArgb) {
  if (!colorArgb) return null;
  const colorMap = {
    'FF00C853': 'excellent',
    'FF2196F3': 'good',
    'FFFFD600': 'fair',
    'FFFF9100': 'ok',
    'FFFF1744': 'poor',
  };
  return colorMap[colorArgb] || null;
}

function getRatingClass(colorArgb) {
  const rating = mapRatingFromColor(colorArgb);
  return rating ? `rated-${rating}` : '';
}

function getRatingNameFromColor(colorArgb) {
  if (!colorArgb) return null;
  const map = {
    'FF00C853': 'Cực tốt',
    'FF2196F3': 'Tốt',
    'FFFFD600': 'Tạm',
    'FFFF9100': 'OK',
    'FFFF1744': 'Tệ',
  };
  return map[colorArgb] || null;
}

function downloadTxtFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Data Loading ----
async function loadData() {
  try {
    const res = await fetch(`${API_BASE}/api/data`);
    const data = await res.json();
    
    state.forms = data.forms;
    state.reviewers = data.reviewers;
    state.columnMap = data.columnMap;
    state.heThongCols = data.heThongCols;
    state.ttskCols = data.ttskCols;
    state.ratingColors = data.ratingColors;
    
    // Populate reviewer select
    populateReviewers();
    
    // Count by ban
    const htCount = data.forms.filter(f => f.ban === 'Hệ thống').length;
    const ttskCount = data.forms.filter(f => f.ban === 'Truyền thông - Sự kiện').length;
    $('#count-ht').textContent = `${htCount} form`;
    $('#count-ttsk').textContent = `${ttskCount} form`;
    
  } catch (err) {
    console.error('Failed to load data:', err);
    showToast('Không thể tải dữ liệu! Kiểm tra server.', 'error');
  }
}

function populateReviewers() {
  const select = $('#reviewer-select');
  select.innerHTML = '<option value="">-- Chọn người chấm --</option>';
  
  state.reviewers.forEach(r => {
    const option = document.createElement('option');
    option.value = r.colIndex;
    option.textContent = r.name;
    select.appendChild(option);
  });

  // Preserve selection if still valid
  if (state.selectedReviewerCol && state.reviewers.some(r => r.colIndex === state.selectedReviewerCol)) {
    select.value = state.selectedReviewerCol;
  }
}

// ============================================================
// Modal & Action Handlers
// ============================================================

const GUIDE_STORAGE_KEY = 'tp2026_guide_seen';
let reviewerPendingDeletion = null;

function openGuideModal() {
  const seen = localStorage.getItem(GUIDE_STORAGE_KEY) === 'true';
  const cb = $('#dont-show-guide-cb');
  if (cb) cb.checked = seen;
  $('#guide-modal').style.display = 'flex';
}

function closeGuideModal() {
  const cb = $('#dont-show-guide-cb');
  if (cb && cb.checked) {
    localStorage.setItem(GUIDE_STORAGE_KEY, 'true');
  } else {
    localStorage.removeItem(GUIDE_STORAGE_KEY);
  }
  $('#guide-modal').style.display = 'none';
}

function openDeleteReviewerModal(reviewer) {
  if (!reviewer) return;
  reviewerPendingDeletion = reviewer;

  // Count how many forms this reviewer evaluated
  const count = state.forms.filter(f => {
    const ev = f.evaluations && f.evaluations[reviewer.name];
    return ev && (ev.comment || ev.fillColor);
  }).length;

  $('#delete-target-name').textContent = reviewer.name;

  if (count > 0) {
    $('#delete-eval-count').textContent = count;
    $('#delete-warning-eval').style.display = 'flex';
    $('#delete-info-eval').style.display = 'none';
  } else {
    $('#delete-warning-eval').style.display = 'none';
    $('#delete-info-eval').style.display = 'flex';
  }

  $('#delete-confirm-modal').style.display = 'flex';
}

function closeDeleteReviewerModal() {
  reviewerPendingDeletion = null;
  $('#delete-confirm-modal').style.display = 'none';
}

async function executeDeleteReviewer() {
  if (!reviewerPendingDeletion) return;
  const { name, colIndex } = reviewerPendingDeletion;
  const confirmBtn = $('#confirm-delete-btn');

  try {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<div class="loading-spinner"></div> Đang xoá...';

    const res = await fetch(`${API_BASE}/api/delete-reviewer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, colIndex })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Đã xoá người chấm: ${name}`, 'success');
      closeDeleteReviewerModal();

      const wasSelected = state.selectedReviewer === name;
      if (wasSelected) {
        state.selectedReviewer = null;
        state.selectedReviewerCol = null;
      }

      // Reload fresh data from server
      await loadData();

      if (wasSelected) {
        $('#reviewer-select').value = '';
      }

      checkStartReady();

      // If manage reviewers modal is open, re-render its list
      if ($('#manage-reviewers-modal').style.display !== 'none') {
        renderManageReviewersList();
      }
    } else {
      showToast(data.error || 'Lỗi khi xoá người chấm!', 'error');
    }
  } catch (err) {
    console.error('Error deleting reviewer:', err);
    showToast('Lỗi máy chủ khi xoá người chấm!', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<span>🗑️</span> Xác nhận xoá';
  }
}

function openManageReviewersModal() {
  renderManageReviewersList();
  $('#manage-reviewers-modal').style.display = 'flex';
}

function closeManageReviewersModal() {
  $('#manage-reviewers-modal').style.display = 'none';
}

function renderManageReviewersList() {
  const container = $('#manage-reviewers-list');
  container.innerHTML = '';

  if (!state.reviewers || state.reviewers.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px;">Chưa có tài khoản người chấm nào.</div>';
    return;
  }

  state.reviewers.forEach(r => {
    const count = state.forms.filter(f => {
      const ev = f.evaluations && f.evaluations[r.name];
      return ev && (ev.comment || ev.fillColor);
    }).length;

    const row = document.createElement('div');
    row.className = 'manage-reviewer-row';
    row.innerHTML = `
      <div class="manage-reviewer-info">
        <div class="manage-reviewer-avatar">👤</div>
        <div>
          <div class="manage-reviewer-name">${r.name}</div>
          <span class="manage-reviewer-count ${count > 0 ? 'has-eval' : ''}">
            ${count > 0 ? `Đã chấm ${count} form` : 'Chưa chấm form nào'}
          </span>
        </div>
      </div>
      <button class="btn-danger-icon" type="button" title="Xoá người chấm ${r.name}">
        <span>🗑️</span> Xoá
      </button>
    `;

    row.querySelector('.btn-danger-icon').addEventListener('click', () => {
      openDeleteReviewerModal(r);
    });

    container.appendChild(row);
  });
}

// ---- Setup Screen Logic ----
function initSetupScreen() {
  const reviewerSelect = $('#reviewer-select');
  const deleteReviewerBtn = $('#delete-reviewer-btn');
  const manageReviewersBtn = $('#manage-reviewers-btn');
  const newReviewerInput = $('#new-reviewer');
  const addReviewerBtn = $('#add-reviewer-btn');
  const banBtns = $$('.ban-btn');
  const startBtn = $('#start-btn');
  
  // Reviewer selection
  reviewerSelect.addEventListener('change', () => {
    const col = parseInt(reviewerSelect.value);
    if (col) {
      const reviewer = state.reviewers.find(r => r.colIndex === col);
      state.selectedReviewer = reviewer ? reviewer.name : null;
      state.selectedReviewerCol = col;
    } else {
      state.selectedReviewer = null;
      state.selectedReviewerCol = null;
    }
    checkStartReady();
  });

  // Delete currently selected reviewer button
  if (deleteReviewerBtn) {
    deleteReviewerBtn.addEventListener('click', () => {
      if (!state.selectedReviewerCol) return;
      const reviewer = state.reviewers.find(r => r.colIndex === state.selectedReviewerCol);
      if (reviewer) {
        openDeleteReviewerModal(reviewer);
      }
    });
  }

  // Manage reviewers button
  if (manageReviewersBtn) {
    manageReviewersBtn.addEventListener('click', openManageReviewersModal);
  }
  
  // Add new reviewer
  addReviewerBtn.addEventListener('click', async () => {
    const name = newReviewerInput.value.trim();
    if (!name) return;
    
    try {
      addReviewerBtn.disabled = true;
      addReviewerBtn.innerHTML = '<div class="loading-spinner"></div>';
      
      const res = await fetch(`${API_BASE}/api/add-reviewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      
      const data = await res.json();
      if (data.success) {
        const actualName = data.name || name;
        state.reviewers.push({ name: actualName, colIndex: data.colIndex });
        state.selectedReviewer = actualName;
        state.selectedReviewerCol = data.colIndex;
        
        populateReviewers();
        reviewerSelect.value = data.colIndex;
        newReviewerInput.value = '';
        
        showToast(`Đã thêm người chấm: ${actualName}`, 'success');
        checkStartReady();
      } else {
        showToast(data.error || 'Lỗi khi thêm người chấm!', 'error');
      }
    } catch (err) {
      showToast('Lỗi khi thêm người chấm!', 'error');
    } finally {
      addReviewerBtn.disabled = false;
      addReviewerBtn.innerHTML = '<span>+</span> Thêm';
    }
  });

  // Also support pressing Enter in new-reviewer input
  newReviewerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addReviewerBtn.click();
    }
  });
  
  // Ban selection
  banBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      banBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedBan = btn.dataset.ban;
      checkStartReady();
    });
  });
  
  // Start button
  startBtn.addEventListener('click', () => {
    if (state.selectedReviewer && state.selectedBan) {
      startEvaluation();
    }
  });

  // Guide buttons
  const openGuideBtn = $('#open-guide-btn');
  if (openGuideBtn) openGuideBtn.addEventListener('click', openGuideModal);

  const headerGuideBtn = $('#header-guide-btn');
  if (headerGuideBtn) headerGuideBtn.addEventListener('click', openGuideModal);

  const closeGuideBtn = $('#close-guide-btn');
  if (closeGuideBtn) closeGuideBtn.addEventListener('click', closeGuideModal);

  const guideStartBtn = $('#guide-start-btn');
  if (guideStartBtn) guideStartBtn.addEventListener('click', closeGuideModal);

  // Delete modal buttons
  const closeDeleteBtn = $('#close-delete-modal-btn');
  if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', closeDeleteReviewerModal);

  const cancelDeleteBtn = $('#cancel-delete-btn');
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteReviewerModal);

  const confirmDeleteBtn = $('#confirm-delete-btn');
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', executeDeleteReviewer);

  // Manage modal buttons
  const closeManageModalBtn = $('#close-manage-modal-btn');
  if (closeManageModalBtn) closeManageModalBtn.addEventListener('click', closeManageReviewersModal);

  const closeManageBtn = $('#close-manage-btn');
  if (closeManageBtn) closeManageBtn.addEventListener('click', closeManageReviewersModal);

  // Backdrop clicks for all modals
  ['#guide-modal', '#delete-confirm-modal', '#manage-reviewers-modal'].forEach(sel => {
    const modal = $(sel);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (sel === '#guide-modal') closeGuideModal();
          else if (sel === '#delete-confirm-modal') closeDeleteReviewerModal();
          else if (sel === '#manage-reviewers-modal') closeManageReviewersModal();
        }
      });
    }
  });

  // Global ESC key to close active modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const delModal = $('#delete-confirm-modal');
      const mgModal = $('#manage-reviewers-modal');
      const gdModal = $('#guide-modal');

      if (delModal && delModal.style.display !== 'none') {
        closeDeleteReviewerModal();
      } else if (mgModal && mgModal.style.display !== 'none') {
        closeManageReviewersModal();
      } else if (gdModal && gdModal.style.display !== 'none') {
        closeGuideModal();
      }
    }
  });
}

function checkStartReady() {
  const ready = state.selectedReviewer && state.selectedBan;
  $('#start-btn').disabled = !ready;

  // Toggle delete button
  const deleteBtn = $('#delete-reviewer-btn');
  if (deleteBtn) {
    deleteBtn.style.display = state.selectedReviewer ? 'inline-flex' : 'none';
    if (state.selectedReviewer) {
      deleteBtn.title = `Xoá người chấm "${state.selectedReviewer}"`;
    }
  }

  const setupExportBtn = $('#setup-export-btn');
  const setupReviewerName = $('#setup-reviewer-name');
  const setupExportExcelBtn = $('#setup-export-excel-btn');
  const setupReviewerNameExcel = $('#setup-reviewer-name-excel');

  if (state.selectedReviewer) {
    const evaluatedCount = state.forms.filter(f => {
      const ev = f.evaluations && f.evaluations[state.selectedReviewer];
      return ev && (ev.comment || ev.fillColor);
    }).length;

    if (evaluatedCount > 0) {
      setupExportBtn.style.display = 'block';
      setupReviewerName.textContent = `${state.selectedReviewer} (${evaluatedCount} đánh giá)`;
      if (setupExportExcelBtn) {
        setupExportExcelBtn.style.display = 'block';
        if (setupReviewerNameExcel) setupReviewerNameExcel.textContent = `${state.selectedReviewer} (${evaluatedCount} đánh giá)`;
      }
    } else {
      setupExportBtn.style.display = 'none';
      if (setupExportExcelBtn) setupExportExcelBtn.style.display = 'none';
    }
  } else {
    setupExportBtn.style.display = 'none';
    if (setupExportExcelBtn) setupExportExcelBtn.style.display = 'none';
  }
}

// ---- Evaluation Screen Logic ----
function startEvaluation() {
  // Filter forms by ban
  if (state.selectedBan === 'he-thong') {
    state.filteredForms = state.forms.filter(f => f.ban === 'Hệ thống');
  } else {
    state.filteredForms = state.forms.filter(f => f.ban === 'Truyền thông - Sự kiện');
  }
  
  state.currentIndex = 0;
  
  // Switch screens
  $('#setup-screen').classList.remove('active');
  $('#eval-screen').classList.add('active');
  
  // Set header info
  $('#current-reviewer').textContent = `👤 ${state.selectedReviewer}`;
  $('#current-ban').textContent = state.selectedBan === 'he-thong' ? '⚙️ Hệ thống' : '📢 Truyền thông - Sự kiện';
  
  // Build sidebar
  buildSidebar();
  
  // Show first form
  renderCurrentForm();
}

function buildSidebar() {
  const list = $('#sidebar-list');
  list.innerHTML = '';
  
  state.filteredForms.forEach((form, idx) => {
    const item = document.createElement('div');
    item.className = `sidebar-item ${idx === state.currentIndex ? 'active' : ''}`;
    
    const eval_ = form.evaluations[state.selectedReviewer];
    const hasEval = eval_ && eval_.comment;
    if (hasEval) item.classList.add('evaluated');
    
    const ratingClass = eval_ ? getRatingClass(eval_.fillColor) : '';
    
    item.innerHTML = `
      <span class="sidebar-item-id">#${form.id}</span>
      <span class="sidebar-item-name">${form.data[2] || 'N/A'}</span>
      ${hasEval ? `<span class="sidebar-item-status ${ratingClass}" style="background: ${eval_.fillColor ? getColorFromArgb(eval_.fillColor) : 'var(--text-muted)'}"></span>` : ''}
    `;
    
    item.addEventListener('click', () => {
      state.currentIndex = idx;
      renderCurrentForm();
      updateSidebarActive();
      closeSidebar();
    });
    
    list.appendChild(item);
  });
}

function getColorFromArgb(argb) {
  if (!argb) return 'transparent';
  const map = {
    'FF00C853': '#00C853',
    'FF2196F3': '#2196F3',
    'FFFFD600': '#FFD600',
    'FFFF9100': '#FF9100',
    'FFFF1744': '#FF1744',
  };
  return map[argb] || '#64748b';
}

function updateSidebarActive() {
  $$('.sidebar-item').forEach((item, idx) => {
    item.classList.toggle('active', idx === state.currentIndex);
  });
}

function renderCurrentForm() {
  const form = state.filteredForms[state.currentIndex];
  if (!form) return;
  
  // Determine which columns to show
  const cols = state.selectedBan === 'he-thong' ? state.heThongCols : state.ttskCols;
  
  // Header
  $('#form-id').textContent = `ID: ${form.id}`;
  $('#form-name').textContent = form.data[2] || 'N/A';
  $('#form-mssv').textContent = `📋 ${form.data[3] || 'N/A'}`;
  $('#form-class').textContent = `🏫 ${form.data[5] || 'N/A'}`;
  $('#form-email').textContent = `📧 ${form.data[4] || 'N/A'}`;
  
  // Content
  const contentDiv = $('#form-content');
  contentDiv.innerHTML = '';
  
  // Skip columns 1-5 (already shown in header), show the rest
  const contentCols = cols.filter(c => c > 5);
  
  contentCols.forEach(colIdx => {
    const label = state.columnMap[colIdx] || `Cột ${colIdx}`;
    const value = form.data[colIdx] || '';
    
    const item = document.createElement('div');
    item.className = `content-item ${(!value || value === '0') ? 'empty' : ''}`;
    item.innerHTML = `
      <div class="content-label">
        <span class="col-index">C${colIdx}</span>
        ${label}
      </div>
      <div class="content-value">${formatValue(value)}</div>
    `;
    contentDiv.appendChild(item);
  });
  
  // Load existing evaluation for current reviewer
  const eval_ = form.evaluations[state.selectedReviewer];
  const commentInput = $('#comment-input');
  
  if (eval_ && eval_.comment) {
    commentInput.value = eval_.comment;
  } else {
    commentInput.value = '';
  }
  
  // Set rating
  state.currentRating = eval_ ? mapRatingFromColor(eval_.fillColor) : null;
  updateRatingButtons();
  
  // Other evaluations
  renderOtherEvals(form);
  
  // Progress
  updateProgress();
  
  // Navigation buttons
  $('#prev-btn').disabled = state.currentIndex === 0;
  $('#next-btn').disabled = state.currentIndex === state.filteredForms.length - 1;
  
  // Clear status
  $('#save-status').textContent = '';
  $('#save-status').className = 'save-status';
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const splitLeft = $('#split-left');
  if (splitLeft) splitLeft.scrollTop = 0;
}

function updateRatingButtons() {
  $$('.rating-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.rating === state.currentRating);
  });
}

function renderOtherEvals(form) {
  const list = $('#other-evals-list');
  list.innerHTML = '';
  
  let hasOther = false;
  
  for (const reviewer of state.reviewers) {
    if (reviewer.name === state.selectedReviewer) continue;
    
    const eval_ = form.evaluations[reviewer.name];
    if (eval_ && eval_.comment) {
      hasOther = true;
      const ratingClass = getRatingClass(eval_.fillColor);
      
      const item = document.createElement('div');
      item.className = `other-eval-item ${ratingClass}`;
      item.innerHTML = `
        <div class="eval-reviewer-name">${reviewer.name}</div>
        <div class="eval-comment">${eval_.comment}</div>
      `;
      list.appendChild(item);
    }
  }
  
  if (!hasOther) {
    list.innerHTML = '<p class="no-evals">Chưa có đánh giá từ người khác.</p>';
  }
}

function updateProgress() {
  const total = state.filteredForms.length;
  const current = state.currentIndex + 1;
  
  // Count evaluated
  const evaluated = state.filteredForms.filter(f => {
    const eval_ = f.evaluations[state.selectedReviewer];
    return eval_ && eval_.comment;
  }).length;
  
  $('#progress-text').textContent = `${current}/${total} (đã chấm: ${evaluated})`;
  $('#progress-fill').style.width = `${(current / total) * 100}%`;
}

// ---- Save Evaluation ----
async function saveEvaluation(goNext = false) {
  const form = state.filteredForms[state.currentIndex];
  const comment = $('#comment-input').value.trim();
  const rating = state.currentRating;
  
  const statusEl = $('#save-status');
  statusEl.className = 'save-status loading';
  statusEl.textContent = '⏳ Đang lưu...';
  
  try {
    const res = await fetch(`${API_BASE}/api/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowIndex: form.rowIndex,
        reviewerCol: state.selectedReviewerCol,
        comment: comment,
        ratingKey: rating
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      statusEl.className = 'save-status success';
      statusEl.textContent = '✅ Đã lưu thành công!';
      showToast('Đã lưu đánh giá!', 'success');
      
      // Update local state
      if (!form.evaluations[state.selectedReviewer]) {
        form.evaluations[state.selectedReviewer] = {};
      }
      form.evaluations[state.selectedReviewer].comment = comment;
      if (rating && state.ratingColors[rating]) {
        form.evaluations[state.selectedReviewer].fillColor = state.ratingColors[rating].hex;
      } else {
        form.evaluations[state.selectedReviewer].fillColor = null;
      }
      
      // Update sidebar
      buildSidebar();
      
      if (goNext && state.currentIndex < state.filteredForms.length - 1) {
        setTimeout(() => {
          state.currentIndex++;
          renderCurrentForm();
          updateSidebarActive();
        }, 300);
      }
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    statusEl.className = 'save-status error';
    statusEl.textContent = `❌ Lỗi: ${err.message}`;
    showToast('Lỗi khi lưu!', 'error');
  }
}

// ---- Sidebar Toggle ----
function openSidebar() {
  $('#sidebar').classList.add('open');
  // Add overlay
  let overlay = $('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
  }
  setTimeout(() => overlay.classList.add('active'), 10);
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  const overlay = $('.sidebar-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// ---- Export Evaluator Reviews as TXT ----
function exportReviewerEvaluationsAsTxt() {
  if (!state.selectedReviewer) {
    showToast('Vui lòng chọn người chấm trước!', 'error');
    return;
  }

  // If currently on evaluation screen, sync unsaved comment/rating
  if ($('#eval-screen').classList.contains('active')) {
    const currentForm = state.filteredForms[state.currentIndex];
    if (currentForm) {
      const currentComment = $('#comment-input').value.trim();
      if (!currentForm.evaluations[state.selectedReviewer]) {
        currentForm.evaluations[state.selectedReviewer] = {};
      }
      currentForm.evaluations[state.selectedReviewer].comment = currentComment;
      if (state.currentRating && state.ratingColors[state.currentRating]) {
        currentForm.evaluations[state.selectedReviewer].fillColor = state.ratingColors[state.currentRating].hex;
      }
    }
  }

  const reviewerName = state.selectedReviewer;
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN');
  const timeStr = now.toLocaleTimeString('vi-VN');

  // Filter evaluated forms by this reviewer
  const evaluatedForms = state.forms.filter(f => {
    const ev = f.evaluations[reviewerName];
    return ev && (ev.comment || ev.fillColor);
  });

  if (evaluatedForms.length === 0) {
    showToast(`Chưa có đánh giá nào được ghi nhận cho ${reviewerName}!`, 'info');
    return;
  }

  evaluatedForms.sort((a, b) => a.id - b.id);

  const blocks = evaluatedForms.map(form => {
    const ev = form.evaluations[reviewerName];
    const candidateName = (form.data[2] || '').trim();
    const mssv = (form.data[3] || '').trim();

    let banText = (form.ban || '').trim();
    if (banText.toLowerCase().includes('truyền thông')) {
      banText = 'tt-sk';
    } else if (banText.toLowerCase().includes('hệ thống')) {
      banText = 'hệ thống';
    }

    const ratingName = getRatingNameFromColor(ev.fillColor);
    const comment = (ev.comment || '').trim();

    let evalContent = '';
    if (ratingName && comment) {
      evalContent = `[${ratingName}]\n${comment}`;
    } else if (ratingName) {
      evalContent = `[${ratingName}]`;
    } else {
      evalContent = comment;
    }

    return `${form.id}\n${candidateName} - ${mssv} - ${banText}\nđánh giá:\n${evalContent}`;
  });

  const content = blocks.join('\n\n') + '\n';

  // Generate file download
  const safeReviewerName = reviewerName.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
  const pad = n => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `Danh_gia_${safeReviewerName}_${timestamp}.txt`;

  downloadTxtFile(filename, content);
  showToast(`Đã tải về file: ${filename}`, 'success');
}

// ---- Export Evaluator Reviews as 1-Column Excel ----
async function exportReviewerEvaluationsAsExcel() {
  if (!state.selectedReviewer) {
    showToast('Vui lòng chọn người chấm trước!', 'error');
    return;
  }

  // If currently on evaluation screen, save any unsaved comment first
  if ($('#eval-screen').classList.contains('active')) {
    const commentInput = $('#comment-input');
    if (commentInput && commentInput.value.trim()) {
      const currentForm = state.filteredForms[state.currentIndex];
      const existingEval = currentForm && currentForm.evaluations[state.selectedReviewer];
      const currentVal = commentInput.value.trim();
      const currentRatingArgb = state.currentRating && state.ratingColors[state.currentRating] ? state.ratingColors[state.currentRating].hex : null;
      if (!existingEval || existingEval.comment !== currentVal || (existingEval.fillColor || null) !== currentRatingArgb) {
        await saveEvaluation(false);
      }
    }
  }

  showToast('⏳ Đang tạo file Excel 1 cột (cả Hệ thống & TT-SK)...', 'info');

  const reviewerName = state.selectedReviewer;
  const url = `/api/export-excel?reviewer=${encodeURIComponent(reviewerName)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Lỗi khi tải file Excel');
    }

    const blob = await res.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const safeReviewer = reviewerName.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
    a.download = `Danh_gia_${safeReviewer}_1cot.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    showToast('✅ Đã xuất file Excel 1 cột thành công! Dòng khớp chuẩn file tổng.', 'success');
  } catch (error) {
    console.error('Export Excel error:', error);
    showToast(`Không thể xuất Excel: ${error.message}`, 'error');
  }
}

// ---- Event Listeners ----
function initEventListeners() {
  // Export Excel buttons (1 cột cả Hệ thống & TT-SK cùng màu)
  const exportExcelBtn = $('#export-excel-btn');
  if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportReviewerEvaluationsAsExcel);

  const sidebarExportExcelBtn = $('#sidebar-export-excel-btn');
  if (sidebarExportExcelBtn) sidebarExportExcelBtn.addEventListener('click', exportReviewerEvaluationsAsExcel);

  const setupExportExcelBtn = $('#setup-export-excel-btn');
  if (setupExportExcelBtn) setupExportExcelBtn.addEventListener('click', exportReviewerEvaluationsAsExcel);

  // Export TXT buttons
  const exportBtn = $('#export-txt-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportReviewerEvaluationsAsTxt);

  const sidebarExportBtn = $('#sidebar-export-txt-btn');
  if (sidebarExportBtn) sidebarExportBtn.addEventListener('click', exportReviewerEvaluationsAsTxt);

  const setupExportBtn = $('#setup-export-btn');
  if (setupExportBtn) setupExportBtn.addEventListener('click', exportReviewerEvaluationsAsTxt);

  // Rating buttons
  $$('.rating-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.currentRating === btn.dataset.rating) {
        state.currentRating = null; // Toggle off
      } else {
        state.currentRating = btn.dataset.rating;
      }
      updateRatingButtons();
    });
  });
  
  // Save buttons
  $('#save-btn').addEventListener('click', () => saveEvaluation(false));
  $('#save-next-btn').addEventListener('click', () => saveEvaluation(true));
  
  // Navigation
  $('#prev-btn').addEventListener('click', () => {
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderCurrentForm();
      updateSidebarActive();
    }
  });
  
  $('#next-btn').addEventListener('click', () => {
    if (state.currentIndex < state.filteredForms.length - 1) {
      state.currentIndex++;
      renderCurrentForm();
      updateSidebarActive();
    }
  });
  
  // Back button
  $('#back-btn').addEventListener('click', () => {
    $('#eval-screen').classList.remove('active');
    $('#setup-screen').classList.add('active');
    closeSidebar();
  });
  
  // Sidebar
  $('#open-sidebar').addEventListener('click', openSidebar);
  $('#toggle-sidebar').addEventListener('click', closeSidebar);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (!$('#eval-screen').classList.contains('active')) return;
    
    // Don't trigger if typing in textarea/input
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    
    if (e.key === 'ArrowLeft' || e.key === 'a') {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        renderCurrentForm();
        updateSidebarActive();
      }
    } else if (e.key === 'ArrowRight' || e.key === 'd') {
      if (state.currentIndex < state.filteredForms.length - 1) {
        state.currentIndex++;
        renderCurrentForm();
        updateSidebarActive();
      }
    } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveEvaluation(false);
    }
  });
}

// ---- Init ----
async function init() {
  await loadData();
  initSetupScreen();
  initEventListeners();

  // Show welcome guide popup on first visit
  if (!localStorage.getItem(GUIDE_STORAGE_KEY)) {
    openGuideModal();
  }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
