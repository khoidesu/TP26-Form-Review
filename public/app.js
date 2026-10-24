// ============================================================
// 🌊 Signal From The Deep Ocean - Form Evaluator
// Application Logic with Google Sheets & Real-time WebSocket Sync
// ============================================================

// ============================================================
// Render Backend URL (Hosts Express API + WebSocket + GG Sheets)
// ============================================================
const BACKEND_URL = 'https://tp26-form-review.onrender.com';

// If running locally, use relative path (same origin).
// If running on Vercel or any other host, use Render backend URL.
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? ''
  : BACKEND_URL;

const SCORE_MAP = {
  5: 'excellent',
  4: 'good',
  3: 'fair',
  2: 'ok',
  1: 'poor'
};

const RATING_TO_SCORE = {
  'excellent': 5,
  'good': 4,
  'fair': 3,
  'ok': 2,
  'poor': 1
};

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
  currentScore: null,
  wsConnected: false,

  previousScreen: 'setup-screen',
  summaryBanFilter: 'all',
  summarySort: 'score-desc',
  summarySearch: '',
  activeCandidateId: null,
};

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function isHeThong(form) {
  if (!form) return false;
  const b = ((typeof form === 'string' ? form : (form.ban || form.data?.[9])) || '').toLowerCase().trim();
  return b.includes('hệ thống') || b.includes('he thong');
}

function isTTSK(form) {
  if (!form) return false;
  const b = ((typeof form === 'string' ? form : (form.ban || form.data?.[9])) || '').toLowerCase().trim();
  return b.includes('truyền thông') || b.includes('truyen thong') || b.includes('ttsk') || b.includes('tt-sk') || b.includes('sự kiện') || b.includes('su kien');
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function isLink(text) {
  return /^https?:\/\//i.test((text || '').trim());
}

function formatValue(val) {
  if (!val || val === '0' || val === 'N/A') {
    return '<span style="color:var(--text-muted); font-style:italic">Không có câu trả lời</span>';
  }
  // Convert URLs to clickable links
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return String(val).replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
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
  return colorMap[colorArgb.toUpperCase()] || null;
}

function getRatingClass(colorArgb) {
  const rating = mapRatingFromColor(colorArgb);
  return rating ? `rated-${rating}` : '';
}

function getRatingNameFromKey(key) {
  const map = {
    'excellent': 'Cực tốt',
    'good': 'Tốt',
    'fair': 'Tạm',
    'ok': 'OK',
    'poor': 'Tệ'
  };
  return map[key] || null;
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
  return map[colorArgb.toUpperCase()] || null;
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
  return map[argb.toUpperCase()] || '#64748b';
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

// ---- Sync Status Badge ----
function updateSyncStatus(status, text) {
  const badge = $('#sync-status-badge');
  const textEl = $('#sync-status-text');
  if (!badge || !textEl) return;
  badge.className = `sync-status-badge ${status}`;
  textEl.textContent = text;
}

// ============================================================
// Real-Time WebSocket
// ============================================================
let ws = null;
let wsReconnectTimer = null;

function getWebSocketUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  // Connect to Render backend WebSocket server (wss://)
  return BACKEND_URL.replace(/^http/, 'ws');
}

function initWebSocket() {
  const wsUrl = getWebSocketUrl();

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      state.wsConnected = true;
      updateSyncStatus('online', 'GG Sheet: Đồng bộ');
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
      } catch (e) {
        console.error('Error parsing WS message:', e);
      }
    };

    ws.onclose = () => {
      state.wsConnected = false;
      updateSyncStatus('offline', 'Mất kết nối WS');
      if (!wsReconnectTimer) {
        wsReconnectTimer = setTimeout(() => {
          wsReconnectTimer = null;
          initWebSocket();
        }, 3000);
      }
    };

    ws.onerror = () => {
      updateSyncStatus('offline', 'Lỗi kết nối WS');
    };
  } catch (e) {
    console.warn('WebSocket init exception:', e);
  }
}

function handleWebSocketMessage(msg) {
  if (msg.type === 'EVALUATION_UPDATED') {
    const { formId, rowIndex, reviewer, comment, ratingKey, score, fillColor } = msg;

    // Find and update form in local state
    const form = state.forms.find(f => f.rowIndex === rowIndex || f.id === formId);
    if (form) {
      if (!form.evaluations) form.evaluations = {};
      form.evaluations[reviewer] = {
        comment: comment || '',
        ratingKey: ratingKey || null,
        score: score || null,
        fillColor: fillColor || null
      };

      // Re-build sidebar to reflect color dot changes
      buildSidebar();

      // If this form is currently open on evaluation screen
      const currentForm = state.filteredForms[state.currentIndex];
      if (currentForm && (currentForm.rowIndex === rowIndex || currentForm.id === formId)) {
        if (reviewer !== state.selectedReviewer) {
          // Live update "Đánh giá từ người khác"
          renderOtherEvals(currentForm);

          const safeId = reviewer.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
          const targetEl = document.getElementById(`other-eval-${safeId}`);
          if (targetEl) {
            targetEl.classList.add('eval-highlight');
            setTimeout(() => targetEl.classList.remove('eval-highlight'), 2200);
          }

          const scoreText = score ? `${score}đ` : '';
          const ratingText = getRatingNameFromKey(ratingKey) || '';
          const badgeInfo = [scoreText, ratingText].filter(Boolean).join(' • ');
          showToast(`👤 ${reviewer} vừa đánh giá #${formId}: ${badgeInfo || 'Đã lưu'}`, 'info');
        }
      }
      updateProgress();

      // If summary screen is active, re-render leaderboard live
      if ($('#summary-screen')?.classList.contains('active')) {
        renderSummaryView();
      }

      // If candidate detail modal is active for this candidate, refresh it
      if (state.activeCandidateId === formId && $('#candidate-detail-modal')?.style.display !== 'none') {
        openCandidateDetailModal(formId);
      }
    }
  } else if (msg.type === 'REVIEWER_ADDED' || msg.type === 'REVIEWER_DELETED' || msg.type === 'DATA_REFRESHED') {
    loadData().then(() => {
      if ($('#summary-screen')?.classList.contains('active')) {
        renderSummaryView();
      }
    });
  }
}

// ---- Data Loading ----
async function loadData() {
  updateSyncStatus('offline', 'Đang kết nối server...');
  try {
    const res = await fetch(`${API_BASE}/api/data`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    const htCount = data.forms.filter(isHeThong).length;
    const ttskCount = data.forms.filter(isTTSK).length;
    $('#count-ht').textContent = `${htCount} form`;
    $('#count-ttsk').textContent = `${ttskCount} form`;

    // Recompute filtered forms based on active ban
    if (state.selectedBan === 'he-thong') {
      state.filteredForms = state.forms.filter(isHeThong);
    } else if (state.selectedBan === 'ttsk' || state.selectedBan === 'tt-sk') {
      state.filteredForms = state.forms.filter(isTTSK);
    } else {
      state.filteredForms = [...state.forms];
    }

    // Refresh UI components if active
    if ($('#eval-screen')?.classList.contains('active')) {
      buildSidebar();
      updateProgress();
      if (state.currentIndex >= state.filteredForms.length) {
        state.currentIndex = Math.max(0, state.filteredForms.length - 1);
      }
      renderCurrentForm();
    }

    if ($('#summary-screen')?.classList.contains('active')) {
      renderSummaryView();
    }

    updateSyncStatus('online', 'GG Sheet: Đồng bộ');

  } catch (err) {
    console.error('Failed to load data:', err);
    updateSyncStatus('offline', 'Lỗi tải GG Sheet');
    showToast('Không thể tải dữ liệu từ Google Sheet! Kiểm tra kết nối mạng.', 'error');
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
    return ev && (ev.comment || ev.score || ev.fillColor);
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
  const { name } = reviewerPendingDeletion;
  const confirmBtn = $('#confirm-delete-btn');

  try {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<div class="loading-spinner"></div> Đang xoá...';

    const res = await fetch(`${API_BASE}/api/delete-reviewer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
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

      await loadData();

      if (wasSelected) {
        $('#reviewer-select').value = '';
      }

      checkStartReady();

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
      return ev && (ev.comment || ev.score || ev.fillColor);
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

  if (deleteReviewerBtn) {
    deleteReviewerBtn.addEventListener('click', () => {
      if (!state.selectedReviewerCol) return;
      const reviewer = state.reviewers.find(r => r.colIndex === state.selectedReviewerCol);
      if (reviewer) {
        openDeleteReviewerModal(reviewer);
      }
    });
  }

  if (manageReviewersBtn) {
    manageReviewersBtn.addEventListener('click', openManageReviewersModal);
  }

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
        state.reviewers.push({
          name: actualName,
          colIndex: data.colIndex,
          scoreColIndex: data.scoreColIndex
        });
        state.selectedReviewer = actualName;
        state.selectedReviewerCol = data.colIndex;

        populateReviewers();
        reviewerSelect.value = data.colIndex;
        newReviewerInput.value = '';

        showToast(`Đã thêm người chấm vào Google Sheet: ${actualName}`, 'success');
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

  newReviewerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addReviewerBtn.click();
    }
  });

  banBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      banBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedBan = btn.dataset.ban;
      checkStartReady();
    });
  });

  startBtn.addEventListener('click', () => {
    if (state.selectedReviewer && state.selectedBan) {
      startEvaluation();
    }
  });

  const openGuideBtn = $('#open-guide-btn');
  if (openGuideBtn) openGuideBtn.addEventListener('click', openGuideModal);

  const headerGuideBtn = $('#header-guide-btn');
  if (headerGuideBtn) headerGuideBtn.addEventListener('click', openGuideModal);

  const closeGuideBtn = $('#close-guide-btn');
  if (closeGuideBtn) closeGuideBtn.addEventListener('click', closeGuideModal);

  const guideStartBtn = $('#guide-start-btn');
  if (guideStartBtn) guideStartBtn.addEventListener('click', closeGuideModal);

  const closeDeleteBtn = $('#close-delete-modal-btn');
  if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', closeDeleteReviewerModal);

  const cancelDeleteBtn = $('#cancel-delete-btn');
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteReviewerModal);

  const confirmDeleteBtn = $('#confirm-delete-btn');
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', executeDeleteReviewer);

  const closeManageModalBtn = $('#close-manage-modal-btn');
  if (closeManageModalBtn) closeManageModalBtn.addEventListener('click', closeManageReviewersModal);

  const closeManageBtn = $('#close-manage-btn');
  if (closeManageBtn) closeManageBtn.addEventListener('click', closeManageReviewersModal);

  ['#guide-modal', '#delete-confirm-modal', '#manage-reviewers-modal', '#candidate-detail-modal'].forEach(sel => {
    const modal = $(sel);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (sel === '#guide-modal') closeGuideModal();
          else if (sel === '#delete-confirm-modal') closeDeleteReviewerModal();
          else if (sel === '#manage-reviewers-modal') closeManageReviewersModal();
          else if (sel === '#candidate-detail-modal') closeCandidateDetailModal();
        }
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const sidebar = $('#sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        closeSidebar();
        return;
      }

      const delModal = $('#delete-confirm-modal');
      const mgModal = $('#manage-reviewers-modal');
      const gdModal = $('#guide-modal');
      const cdModal = $('#candidate-detail-modal');

      if (cdModal && cdModal.style.display !== 'none') {
        closeCandidateDetailModal();
      } else if (delModal && delModal.style.display !== 'none') {
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
      return ev && (ev.comment || ev.score || ev.fillColor);
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
  if (state.selectedBan === 'he-thong') {
    state.filteredForms = state.forms.filter(isHeThong);
  } else if (state.selectedBan === 'ttsk' || state.selectedBan === 'tt-sk') {
    state.filteredForms = state.forms.filter(isTTSK);
  } else {
    state.filteredForms = [...state.forms];
  }

  state.currentIndex = 0;

  $('#setup-screen').classList.remove('active');
  $('#eval-screen').classList.add('active');

  $('#current-reviewer').textContent = `👤 ${state.selectedReviewer}`;
  $('#current-ban').textContent = state.selectedBan === 'he-thong' ? '⚙️ Hệ thống' : '📢 Truyền thông - Sự kiện';

  buildSidebar();
  renderCurrentForm();
}

function buildSidebar(searchFilter = '') {
  const list = $('#sidebar-list');
  if (!list) return;
  list.innerHTML = '';

  const banName = state.selectedBan === 'he-thong' ? '⚙️ Hệ thống' : '📢 Truyền thông - Sự kiện';
  const subtitle = $('#sidebar-subtitle');
  if (subtitle) {
    subtitle.textContent = `${banName} • ${state.filteredForms.length} form`;
  }

  const q = (searchFilter || '').trim().toLowerCase();

  const matchingForms = [];
  state.filteredForms.forEach((form, idx) => {
    const candidateName = (form.data[2] || '').trim();
    const mssv = (form.data[3] || '').trim();
    const idStr = String(form.id);

    if (q) {
      const match = candidateName.toLowerCase().includes(q) ||
                    mssv.toLowerCase().includes(q) ||
                    idStr === q ||
                    `#${idStr}` === q;
      if (!match) return;
    }

    matchingForms.push({ form, idx });
  });

  if (matchingForms.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 30px 10px; font-size: 13px;">
        Không tìm thấy form nào khớp với "${q}".
      </div>
    `;
    return;
  }

  matchingForms.forEach(({ form, idx }) => {
    const item = document.createElement('div');
    item.className = `sidebar-item ${idx === state.currentIndex ? 'active' : ''}`;

    const eval_ = form.evaluations && form.evaluations[state.selectedReviewer];
    const hasEval = eval_ && (eval_.comment || eval_.score || eval_.fillColor);
    if (hasEval) item.classList.add('evaluated');

    const score = eval_?.score;
    const ratingKey = eval_?.ratingKey;
    const colorBg = eval_?.fillColor ? getColorFromArgb(eval_.fillColor) : (ratingKey && state.ratingColors[ratingKey] ? state.ratingColors[ratingKey].color : null);

    let statusHtml = '';
    if (score) {
      statusHtml = `<span class="sidebar-item-score-badge" style="background: ${colorBg || '#3b82f6'}">${score}đ</span>`;
    } else if (hasEval) {
      statusHtml = `<span class="sidebar-item-status" style="background: ${colorBg || '#10b981'}" title="Đã có nhận xét"></span>`;
    } else {
      statusHtml = `<span style="font-size: 11px; color: var(--text-muted);">Chưa chấm</span>`;
    }

    item.innerHTML = `
      <span class="sidebar-item-id">#${form.id}</span>
      <div class="sidebar-item-info">
        <div class="sidebar-item-name">${form.data[2] || 'N/A'}</div>
        <div class="sidebar-item-meta">${form.data[3] || 'N/A'} • ${form.data[5] || 'N/A'}</div>
      </div>
      ${statusHtml}
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

function updateSidebarActive() {
  $$('.sidebar-item').forEach((item, idx) => {
    item.classList.toggle('active', idx === state.currentIndex);
  });
}

function renderCurrentForm() {
  const form = state.filteredForms[state.currentIndex];
  if (!form) return;

  const isFormTTSK = isTTSK(form);
  const isHT = (state.selectedBan === 'he-thong') || (!isFormTTSK && isHeThong(form));
  const cols = isHT ? state.heThongCols : state.ttskCols;

  // Header
  $('#form-id').textContent = `ID: ${form.id}`;
  $('#form-name').textContent = form.data[2] || 'N/A';
  $('#form-mssv').textContent = `📋 ${form.data[3] || 'N/A'}`;
  $('#form-class').textContent = `🏫 ${form.data[5] || 'N/A'}`;
  $('#form-email').textContent = `📧 ${form.data[4] || 'N/A'}`;

  // Content
  const contentDiv = $('#form-content');
  contentDiv.innerHTML = '';

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
  const eval_ = form.evaluations && form.evaluations[state.selectedReviewer];
  const commentInput = $('#comment-input');

  if (eval_ && eval_.comment) {
    commentInput.value = eval_.comment;
  } else {
    commentInput.value = '';
  }

  // Set rating and score
  state.currentRating = eval_ ? (eval_.ratingKey || mapRatingFromColor(eval_.fillColor)) : null;
  state.currentScore = eval_ ? (eval_.score || (state.currentRating ? RATING_TO_SCORE[state.currentRating] : null)) : null;
  updateRatingButtons();

  // Render other evaluations
  renderOtherEvals(form);

  // Progress
  updateProgress();

  // Navigation buttons
  $('#prev-btn').disabled = state.currentIndex === 0;
  $('#next-btn').disabled = state.currentIndex === state.filteredForms.length - 1;

  // Clear status and validation warning
  $('#save-status').textContent = '';
  $('#save-status').className = 'save-status';
  const ratingContainer = $('#rating-buttons');
  if (ratingContainer) ratingContainer.classList.remove('rating-required-shake');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const splitLeft = $('#split-left');
  if (splitLeft) splitLeft.scrollTop = 0;
}

function updateRatingButtons() {
  $$('.rating-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.rating === state.currentRating);
  });

  const display = $('#current-score-display');
  const reqBadge = $('#required-score-badge');
  if (display) {
    if (state.currentScore) {
      const name = state.ratingColors[state.currentRating]?.name || getRatingNameFromKey(state.currentRating) || '';
      display.textContent = `★ ${state.currentScore} điểm (${name})`;
      display.style.display = 'inline-block';
      if (reqBadge) reqBadge.style.display = 'none';
    } else {
      display.textContent = '';
      display.style.display = 'none';
      if (reqBadge) reqBadge.style.display = 'inline-flex';
    }
  }
}

// Synchronize and render other evaluations
function renderOtherEvals(form) {
  const list = $('#other-evals-list');
  if (!list) return;
  list.innerHTML = '';

  let hasOther = false;

  for (const reviewer of state.reviewers) {
    if (reviewer.name === state.selectedReviewer) continue;

    const eval_ = form.evaluations && form.evaluations[reviewer.name];
    if (eval_ && (eval_.comment || eval_.score || eval_.fillColor || eval_.ratingKey)) {
      hasOther = true;
      const score = eval_.score;
      const ratingKey = eval_.ratingKey || (score ? SCORE_MAP[score] : null) || mapRatingFromColor(eval_.fillColor);
      const ratingClass = ratingKey ? `rated-${ratingKey}` : '';
      const ratingName = getRatingNameFromKey(ratingKey) || (score ? `${score} điểm` : 'Đã chấm');
      const colorHex = eval_.fillColor ? getColorFromArgb(eval_.fillColor) : (ratingKey && state.ratingColors[ratingKey] ? state.ratingColors[ratingKey].color : '#38bdf8');

      const safeId = reviewer.name.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
      const item = document.createElement('div');
      item.className = `other-eval-item ${ratingClass}`;
      item.id = `other-eval-${safeId}`;

      const commentHtml = eval_.comment
        ? formatValue(eval_.comment)
        : '<span class="eval-no-comment">(Đã chấm điểm, không có nhận xét chữ)</span>';

      item.innerHTML = `
        <div class="eval-item-header">
          <div class="eval-reviewer-info">
            <span class="eval-avatar">👤</span>
            <span class="eval-reviewer-name">${reviewer.name}</span>
          </div>
          <div class="eval-score-badge" style="background: ${colorHex}">
            ${score ? `<span class="score-num">${score}đ</span> • ` : ''}${ratingName}
          </div>
        </div>
        <div class="eval-comment">${commentHtml}</div>
      `;
      list.appendChild(item);
    }
  }

  if (!hasOther) {
    list.innerHTML = '<p class="no-evals">Chưa có đánh giá nào từ các giám khảo khác cho form này.</p>';
  }
}

function updateProgress() {
  const total = state.filteredForms.length;
  const current = state.currentIndex + 1;

  const evaluated = state.filteredForms.filter(f => {
    const eval_ = f.evaluations && f.evaluations[state.selectedReviewer];
    return eval_ && (eval_.comment || eval_.score || eval_.fillColor);
  }).length;

  $('#progress-text').textContent = `${current}/${total} (đã chấm: ${evaluated})`;
  $('#progress-fill').style.width = `${(current / total) * 100}%`;
}

// ---- Save Evaluation ----
async function saveEvaluation(goNext = false) {
  const form = state.filteredForms[state.currentIndex];
  if (!form) return false;

  const comment = $('#comment-input').value.trim();
  const rating = state.currentRating;
  const score = state.currentScore;
  const statusEl = $('#save-status');

  // Strict constraint: Mandatory score selection (1 - 5)
  if (!score || !rating) {
    statusEl.className = 'save-status error shake-error';
    statusEl.innerHTML = '⚠️ <strong>Chưa chọn điểm:</strong> Bắt buộc phải chọn mức điểm (1 - 5 điểm) để lưu và chấm bài!';

    // Highlight and trigger shake animation on rating buttons
    const ratingContainer = $('#rating-buttons');
    if (ratingContainer) {
      ratingContainer.classList.remove('rating-required-shake');
      void ratingContainer.offsetWidth; // Force reflow to re-trigger CSS animation
      ratingContainer.classList.add('rating-required-shake');
      ratingContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    showToast('⚠️ Vui lòng chọn điểm đánh giá (1 - 5 điểm) trước khi lưu bài!', 'error');
    return false;
  }

  statusEl.className = 'save-status loading';
  statusEl.textContent = '⏳ Đang lưu vào Google Sheet...';

  try {
    const res = await fetch(`${API_BASE}/api/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowIndex: form.rowIndex,
        reviewerCol: state.selectedReviewerCol,
        reviewerName: state.selectedReviewer,
        comment: comment,
        ratingKey: rating,
        score: score
      })
    });

    const data = await res.json();

    if (data.success) {
      statusEl.className = 'save-status success';
      statusEl.textContent = '✅ Đã lưu Google Sheet thành công!';
      showToast('Đã lưu đánh giá & điểm vào Google Sheet!', 'success');

      // Update local state
      if (!form.evaluations) form.evaluations = {};
      if (!form.evaluations[state.selectedReviewer]) {
        form.evaluations[state.selectedReviewer] = {};
      }
      form.evaluations[state.selectedReviewer].comment = comment;
      form.evaluations[state.selectedReviewer].ratingKey = data.ratingKey || rating;
      form.evaluations[state.selectedReviewer].score = data.score !== undefined ? data.score : score;
      form.evaluations[state.selectedReviewer].fillColor = data.fillColor || (rating && state.ratingColors[rating] ? state.ratingColors[rating].hex : null);

      buildSidebar();
      updateProgress();

      if (goNext && state.currentIndex < state.filteredForms.length - 1) {
        setTimeout(() => {
          state.currentIndex++;
          renderCurrentForm();
          updateSidebarActive();
        }, 300);
      }
    } else {
      throw new Error(data.error || 'Lỗi không xác định khi lưu');
    }
  } catch (err) {
    statusEl.className = 'save-status error';
    statusEl.textContent = `❌ Lỗi: ${err.message}`;
    showToast('Lỗi khi lưu vào Google Sheet!', 'error');
  }
}

// ---- Sidebar Toggle ----
function openSidebar() {
  const sidebar = $('#sidebar');
  if (!sidebar) return;
  sidebar.classList.add('open');

  let overlay = $('#sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebar);
    $('#eval-screen').appendChild(overlay);
  } else {
    overlay.addEventListener('click', closeSidebar);
  }

  // Remove any legacy overlays on body
  document.querySelectorAll('body > .sidebar-overlay').forEach(el => el.remove());

  overlay.classList.add('active');

  // Re-build sidebar with cleared filter
  const searchInput = $('#sidebar-search-input');
  if (searchInput) {
    searchInput.value = '';
  }
  buildSidebar();

  // Scroll active item into view
  setTimeout(() => {
    const activeItem = sidebar.querySelector('.sidebar-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, 60);
}

function closeSidebar() {
  const sidebar = $('#sidebar');
  if (sidebar) sidebar.classList.remove('open');
  const overlay = $('#sidebar-overlay') || $('.sidebar-overlay');
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

  if ($('#eval-screen').classList.contains('active')) {
    const currentForm = state.filteredForms[state.currentIndex];
    if (currentForm) {
      const currentComment = $('#comment-input').value.trim();
      if (!currentForm.evaluations) currentForm.evaluations = {};
      if (!currentForm.evaluations[state.selectedReviewer]) {
        currentForm.evaluations[state.selectedReviewer] = {};
      }
      currentForm.evaluations[state.selectedReviewer].comment = currentComment;
      currentForm.evaluations[state.selectedReviewer].score = state.currentScore;
      if (state.currentRating && state.ratingColors[state.currentRating]) {
        currentForm.evaluations[state.selectedReviewer].fillColor = state.ratingColors[state.currentRating].hex;
      }
    }
  }

  const reviewerName = state.selectedReviewer;
  const now = new Date();

  const evaluatedForms = state.forms.filter(f => {
    const ev = f.evaluations && f.evaluations[reviewerName];
    return ev && (ev.comment || ev.score || ev.fillColor);
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

    const ratingName = getRatingNameFromKey(ev.ratingKey) || getRatingNameFromColor(ev.fillColor);
    const scoreText = ev.score ? `${ev.score} điểm` : '';
    const badgeText = [scoreText, ratingName].filter(Boolean).join(' - ');
    const comment = (ev.comment || '').trim();

    let evalContent = '';
    if (badgeText && comment) {
      evalContent = `[${badgeText}]\n${comment}`;
    } else if (badgeText) {
      evalContent = `[${badgeText}]`;
    } else {
      evalContent = comment;
    }

    return `${form.id}\n${candidateName} - ${mssv} - ${banText}\nđánh giá:\n${evalContent}`;
  });

  const content = blocks.join('\n\n') + '\n';

  const safeReviewerName = reviewerName.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
  const pad = n => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `Danh_gia_${safeReviewerName}_${timestamp}.txt`;

  downloadTxtFile(filename, content);
  showToast(`Đã tải về file: ${filename}`, 'success');
}

// ---- Export Evaluator Reviews as Excel (Comment + Score) ----
async function exportReviewerEvaluationsAsExcel() {
  if (!state.selectedReviewer) {
    showToast('Vui lòng chọn người chấm trước!', 'error');
    return;
  }

  if ($('#eval-screen').classList.contains('active')) {
    const commentInput = $('#comment-input');
    if (commentInput && commentInput.value.trim()) {
      const currentForm = state.filteredForms[state.currentIndex];
      const existingEval = currentForm && currentForm.evaluations && currentForm.evaluations[state.selectedReviewer];
      const currentVal = commentInput.value.trim();
      const currentRatingArgb = state.currentRating && state.ratingColors[state.currentRating] ? state.ratingColors[state.currentRating].hex : null;
      if (!existingEval || existingEval.comment !== currentVal || (existingEval.fillColor || null) !== currentRatingArgb) {
        if (state.currentRating && state.currentScore) {
          await saveEvaluation(false);
        }
      }
    }
  }

  showToast('⏳ Đang tạo file Excel (cột Nhận xét & cột Điểm)...', 'info');

  const reviewerName = state.selectedReviewer;
  const url = `${API_BASE}/api/export-excel?reviewer=${encodeURIComponent(reviewerName)}`;

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
    a.download = `Danh_gia_${safeReviewer}_kem_diem.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    showToast('✅ Đã xuất file Excel kèm cột điểm thành công!', 'success');
  } catch (error) {
    console.error('Export Excel error:', error);
    showToast(`Không thể xuất Excel: ${error.message}`, 'error');
  }
}

// ---- Event Listeners ----
function initEventListeners() {
  // Export Excel buttons
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

  // Force sync button
  const forceSyncBtn = $('#force-sync-btn');
  if (forceSyncBtn) {
    forceSyncBtn.addEventListener('click', async () => {
      try {
        forceSyncBtn.classList.add('rotating');
        showToast('⏳ Đang đồng bộ từ Google Sheet...', 'info');
        const res = await fetch(`${API_BASE}/api/sync`);
        const data = await res.json();
        if (data.success) {
          await loadData();
          if ($('#eval-screen').classList.contains('active')) {
            renderCurrentForm();
            buildSidebar();
          }
          showToast(`✅ Đã đồng bộ Google Sheet! (${data.formCount} form)`, 'success');
        }
      } catch (err) {
        showToast('Lỗi khi đồng bộ từ Google Sheet!', 'error');
      } finally {
        setTimeout(() => forceSyncBtn.classList.remove('rotating'), 600);
      }
    });
  }

  // Rating buttons with 1-5 score
  $$('.rating-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Clear alert animation and error status
      const ratingContainer = $('#rating-buttons');
      if (ratingContainer) ratingContainer.classList.remove('rating-required-shake');
      const statusEl = $('#save-status');
      if (statusEl.classList.contains('shake-error')) {
        statusEl.className = 'save-status';
        statusEl.textContent = '';
      }

      state.currentRating = btn.dataset.rating;
      state.currentScore = parseInt(btn.dataset.score) || RATING_TO_SCORE[state.currentRating] || null;
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

  const sidebarOverlay = $('#sidebar-overlay');
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  const sidebarSearchInput = $('#sidebar-search-input');
  if (sidebarSearchInput) {
    sidebarSearchInput.addEventListener('input', (e) => {
      buildSidebar(e.target.value);
    });
  }

  // Summary Screen Navigation buttons
  const openSummaryBtn = $('#open-summary-btn');
  if (openSummaryBtn) {
    openSummaryBtn.addEventListener('click', () => openSummaryScreen('setup-screen'));
  }

  const headerSummaryBtn = $('#header-summary-btn');
  if (headerSummaryBtn) {
    headerSummaryBtn.addEventListener('click', () => openSummaryScreen('eval-screen'));
  }

  const summaryBackBtn = $('#summary-back-btn');
  if (summaryBackBtn) {
    summaryBackBtn.addEventListener('click', closeSummaryScreen);
  }

  const exportSummaryExcelBtn = $('#export-summary-excel-btn');
  if (exportSummaryExcelBtn) {
    exportSummaryExcelBtn.addEventListener('click', exportSummaryExcel);
  }

  // Summary Ban Filter pills
  $$('.summary-ban-filters .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      $$('.summary-ban-filters .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.summaryBanFilter = pill.dataset.filter;
      renderSummaryView();
    });
  });

  // Summary Sort select
  const summarySortSelect = $('#summary-sort-select');
  if (summarySortSelect) {
    summarySortSelect.addEventListener('change', () => {
      state.summarySort = summarySortSelect.value;
      renderSummaryView();
    });
  }

  // Summary Search input
  const summarySearchInput = $('#summary-search-input');
  if (summarySearchInput) {
    summarySearchInput.addEventListener('input', () => {
      state.summarySearch = summarySearchInput.value;
      renderSummaryView();
    });
  }

  // Candidate Detail Modal buttons
  const closeCdModalBtn = $('#close-cd-modal-btn');
  if (closeCdModalBtn) {
    closeCdModalBtn.addEventListener('click', closeCandidateDetailModal);
  }

  const cdExportExcelBtn = $('#cd-export-excel-btn');
  if (cdExportExcelBtn) {
    cdExportExcelBtn.addEventListener('click', () => exportCandidateExcel(state.activeCandidateId));
  }

  const cdJumpEvalBtn = $('#cd-jump-eval-btn');
  if (cdJumpEvalBtn) {
    cdJumpEvalBtn.addEventListener('click', () => jumpToEvaluateCandidate(state.activeCandidateId));
  }

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
    } else if (e.key >= '1' && e.key <= '5') {
      // Shortcut keys 1-5 for rating!
      const scoreNum = parseInt(e.key);
      const targetRating = SCORE_MAP[scoreNum];
      if (targetRating) {
        state.currentRating = targetRating;
        state.currentScore = scoreNum;

        // Clear alert animation and error status
        const ratingContainer = $('#rating-buttons');
        if (ratingContainer) ratingContainer.classList.remove('rating-required-shake');
        const statusEl = $('#save-status');
        if (statusEl.classList.contains('shake-error')) {
          statusEl.className = 'save-status';
          statusEl.textContent = '';
        }

        updateRatingButtons();
      }
    }
  });

  // Fallback background polling every 12 seconds
  setInterval(async () => {
    if (!state.wsConnected) {
      try {
        await loadData();
        if ($('#eval-screen').classList.contains('active')) {
          const currentForm = state.filteredForms[state.currentIndex];
          if (currentForm) renderOtherEvals(currentForm);
        } else if ($('#summary-screen').classList.contains('active')) {
          renderSummaryView();
        }
      } catch (e) { }
    }
  }, 12000);
}

// ============================================================
// 🏆 Summary Screen & Candidate Detail Modal Logic
// ============================================================

function openSummaryScreen(fromScreen = 'setup-screen') {
  state.previousScreen = fromScreen;
  $('#setup-screen').classList.remove('active');
  $('#eval-screen').classList.remove('active');
  $('#summary-screen').classList.add('active');
  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderSummaryView();
}

function closeSummaryScreen() {
  $('#summary-screen').classList.remove('active');
  if (state.previousScreen === 'eval-screen') {
    $('#eval-screen').classList.add('active');
  } else {
    $('#setup-screen').classList.add('active');
  }
}

function renderSummaryView() {
  const tbody = $('#summary-table-body');
  if (!tbody) return;

  // Process forms with score metrics
  const processedForms = state.forms.map(form => {
    let totalScore = 0;
    let ratedCount = 0;
    state.reviewers.forEach(rev => {
      const ev = form.evaluations && form.evaluations[rev.name];
      if (ev && ev.score !== null && ev.score !== undefined) {
        totalScore += parseInt(ev.score);
        ratedCount++;
      }
    });
    const avgScore = ratedCount > 0 ? parseFloat((totalScore / ratedCount).toFixed(2)) : 0;
    return { form, totalScore, ratedCount, avgScore };
  });

  // Filter by ban
  let list = processedForms;
  if (state.summaryBanFilter === 'he-thong') {
    list = list.filter(item => isHeThong(item.form));
  } else if (state.summaryBanFilter === 'ttsk' || state.summaryBanFilter === 'tt-sk') {
    list = list.filter(item => isTTSK(item.form));
  }

  // Filter by search query
  if (state.summarySearch && state.summarySearch.trim()) {
    const q = state.summarySearch.trim().toLowerCase();
    list = list.filter(item => {
      const name = (item.form.data[2] || '').toLowerCase();
      const mssv = (item.form.data[3] || '').toLowerCase();
      const email = (item.form.data[4] || '').toLowerCase();
      const lop = (item.form.data[5] || '').toLowerCase();
      const idStr = String(item.form.id);
      return name.includes(q) || mssv.includes(q) || email.includes(q) || lop.includes(q) || idStr === q;
    });
  }

  // Sort
  list.sort((a, b) => {
    switch (state.summarySort) {
      case 'score-desc':
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
        return a.form.id - b.form.id;
      case 'score-asc':
        if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
        return a.form.id - b.form.id;
      case 'avg-desc':
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.form.id - b.form.id;
      case 'id-asc':
        return a.form.id - b.form.id;
      case 'name-asc':
        return (a.form.data[2] || '').localeCompare(b.form.data[2] || '', 'vi');
      default:
        return b.totalScore - a.totalScore;
    }
  });

  // Update Overview Stat Cards
  const totalCandidates = state.forms.length;
  const evaluatedCandidates = state.forms.filter(f => {
    return Object.values(f.evaluations || {}).some(ev => ev.score !== null && ev.score !== undefined);
  }).length;
  const maxScore = processedForms.reduce((max, f) => Math.max(max, f.totalScore), 0);
  const totalAllScores = processedForms.reduce((sum, f) => sum + f.totalScore, 0);
  const totalRatedTimes = processedForms.reduce((sum, f) => sum + f.ratedCount, 0);
  const overallAvg = totalRatedTimes > 0 ? (totalAllScores / totalRatedTimes).toFixed(1) : '0';

  if ($('#stat-total-candidates')) $('#stat-total-candidates').textContent = totalCandidates;
  if ($('#stat-evaluated-count')) $('#stat-evaluated-count').textContent = `${evaluatedCandidates}/${totalCandidates}`;
  if ($('#stat-max-score')) $('#stat-max-score').textContent = `${maxScore}đ`;
  if ($('#stat-avg-score')) $('#stat-avg-score').textContent = `${overallAvg} ★`;

  // Update count pills
  const htCount = state.forms.filter(isHeThong).length;
  const ttskCount = state.forms.filter(isTTSK).length;
  if ($('#filter-all-count')) $('#filter-all-count').textContent = totalCandidates;
  if ($('#filter-ht-count')) $('#filter-ht-count').textContent = htCount;
  if ($('#filter-ttsk-count')) $('#filter-ttsk-count').textContent = ttskCount;

  // Render Table Rows
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">
          Không tìm thấy ứng viên phù hợp với điều kiện tìm kiếm.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach((item, idx) => {
    const f = item.form;
    const rank = idx + 1;
    let rankBadge = `<span class="rank-badge rank-normal">#${rank}</span>`;
    if (state.summarySort === 'score-desc') {
      if (rank === 1 && item.totalScore > 0) rankBadge = `<span class="rank-badge rank-1" title="Top 1">🥇 1</span>`;
      else if (rank === 2 && item.totalScore > 0) rankBadge = `<span class="rank-badge rank-2" title="Top 2">🥈 2</span>`;
      else if (rank === 3 && item.totalScore > 0) rankBadge = `<span class="rank-badge rank-3" title="Top 3">🥉 3</span>`;
    }

    const isCandidateHT = isHeThong(f);
    const banClass = isCandidateHT ? 'ban-tag-ht' : 'ban-tag-ttsk';
    const banName = isCandidateHT ? '⚙️ Hệ thống' : '📢 TT - Sự kiện';

    // Reviewer badges
    const revBadges = state.reviewers.map(rev => {
      const ev = f.evaluations && f.evaluations[rev.name];
      if (ev && ev.score !== null && ev.score !== undefined) {
        const color = ev.fillColor ? getColorFromArgb(ev.fillColor) : '#38bdf8';
        return `
          <span class="rev-score-pill" style="--rev-color: ${color}" title="${rev.name}: ${ev.score}đ - ${ev.comment || 'Không có nhận xét'}">
            <span class="rev-dot"></span>
            <strong>${rev.name}:</strong> ${ev.score}đ
          </span>
        `;
      }
      return `
        <span class="rev-score-pill unrated" title="${rev.name}: Chưa chấm">
          <span class="rev-dot"></span>
          <span>${rev.name}: -</span>
        </span>
      `;
    }).join('');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center">${rankBadge}</td>
      <td class="text-center"><span class="table-id-badge">#${f.id}</span></td>
      <td>
        <div class="candidate-cell-name">${f.data[2] || 'N/A'}</div>
        <div class="candidate-cell-meta">
          <span>📋 ${f.data[3] || 'N/A'}</span>
          <span>🏫 ${f.data[5] || 'N/A'}</span>
        </div>
      </td>
      <td><span class="table-ban-badge ${banClass}">${banName}</span></td>
      <td><div class="rev-scores-wrapper">${revBadges}</div></td>
      <td class="text-center">
        <span class="table-total-score ${item.totalScore > 0 ? 'has-score' : ''}">
          ${item.totalScore}đ
        </span>
      </td>
      <td class="text-center">
        <span class="table-avg-score ${item.avgScore > 0 ? 'has-score' : ''}">
          ${item.avgScore > 0 ? `${item.avgScore} ★` : '-'}
        </span>
      </td>
      <td class="text-center">
        <div class="table-action-group">
          <button class="btn btn-ghost btn-sm btn-view-cd" data-id="${f.id}" title="Xem chi tiết câu trả lời và tất cả đánh giá">
            <span>👁️</span> Xem
          </button>
          <button class="btn btn-excel btn-sm btn-export-cd" data-id="${f.id}" title="Tải file Excel riêng của ứng viên này">
            <span>📥</span> Excel
          </button>
        </div>
      </td>
    `;

    tr.querySelector('.btn-view-cd').addEventListener('click', () => openCandidateDetailModal(f.id));
    tr.querySelector('.btn-export-cd').addEventListener('click', () => exportCandidateExcel(f.id));

    tbody.appendChild(tr);
  });
}

function openCandidateDetailModal(candidateId) {
  const form = state.forms.find(f => f.id === parseInt(candidateId));
  if (!form) return;

  state.activeCandidateId = form.id;

  $('#cd-id').textContent = `ID: #${form.id}`;
  $('#cd-name').textContent = form.data[2] || 'N/A';
  $('#cd-meta').textContent = `${form.data[3] || 'N/A'} • ${form.ban || 'N/A'} • ${form.data[5] || 'N/A'} • ${form.data[4] || 'N/A'}`;

  let totalScore = 0;
  let ratedCount = 0;
  state.reviewers.forEach(rev => {
    const ev = form.evaluations && form.evaluations[rev.name];
    if (ev && ev.score !== null && ev.score !== undefined) {
      totalScore += parseInt(ev.score);
      ratedCount++;
    }
  });
  const avg = ratedCount > 0 ? (totalScore / ratedCount).toFixed(2) : '0';

  $('#cd-total-score').textContent = `${totalScore}đ`;
  $('#cd-avg-score').textContent = `${avg} ★`;
  $('#cd-eval-progress').textContent = `${ratedCount}/${state.reviewers.length} GK`;

  const evalsList = $('#cd-evals-list');
  evalsList.innerHTML = '';

  state.reviewers.forEach(rev => {
    const ev = form.evaluations && form.evaluations[rev.name];
    const item = document.createElement('div');
    item.className = 'cd-eval-item';

    if (ev && (ev.score !== null && ev.score !== undefined || ev.comment)) {
      const score = ev.score;
      const ratingKey = ev.ratingKey || (score ? SCORE_MAP[score] : null);
      const ratingName = getRatingNameFromKey(ratingKey) || (score ? `${score} điểm` : 'Đã chấm');
      const colorHex = ev.fillColor ? getColorFromArgb(ev.fillColor) : '#38bdf8';

      item.innerHTML = `
        <div class="cd-eval-header">
          <div class="cd-eval-reviewer">
            <span>👤</span> <strong>${rev.name}</strong>
          </div>
          <div class="cd-eval-badge" style="background: ${colorHex}">
            ${score ? `<strong>${score}đ</strong> • ` : ''}${ratingName}
          </div>
        </div>
        <div class="cd-eval-comment">${ev.comment ? formatValue(ev.comment) : '<em>(Không có nhận xét bằng chữ)</em>'}</div>
      `;
    } else {
      item.classList.add('unrated');
      item.innerHTML = `
        <div class="cd-eval-header">
          <div class="cd-eval-reviewer">
            <span>👤</span> <strong>${rev.name}</strong>
          </div>
          <div class="cd-eval-badge unrated">Chưa đánh giá</div>
        </div>
      `;
    }
    evalsList.appendChild(item);
  });

  const answersList = $('#cd-answers-list');
  answersList.innerHTML = '';

  for (let c = 6; c <= 24; c++) {
    const label = state.columnMap[c] || `Cột ${c}`;
    const value = form.data[c] || '';
    const item = document.createElement('div');
    item.className = `cd-answer-item ${(!value || value === '0') ? 'empty' : ''}`;
    item.innerHTML = `
      <div class="cd-answer-label">
        <span class="col-index">C${c}</span>
        ${label}
      </div>
      <div class="cd-answer-value">${formatValue(value)}</div>
    `;
    answersList.appendChild(item);
  }

  $('#candidate-detail-modal').style.display = 'flex';
}

function closeCandidateDetailModal() {
  state.activeCandidateId = null;
  $('#candidate-detail-modal').style.display = 'none';
}

function exportCandidateExcel(candidateId) {
  if (!candidateId) return;
  const form = state.forms.find(f => f.id === parseInt(candidateId));
  const safeName = ((form && form.data[2]) || 'Ung_vien').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
  showToast(`⏳ Đang tạo file Excel riêng cho ứng viên #${candidateId}...`, 'info');

  const url = `${API_BASE}/api/export-candidate-excel?id=${candidateId}`;
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('Không thể tải file Excel ứng viên');
      return res.blob();
    })
    .then(blob => {
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Danh_gia_Ung_vien_${candidateId}_${safeName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      showToast(`✅ Đã xuất file Excel riêng của ứng viên #${candidateId}!`, 'success');
    })
    .catch(err => {
      showToast(`Lỗi khi xuất Excel: ${err.message}`, 'error');
    });
}

function exportSummaryExcel() {
  showToast('⏳ Đang tạo file Excel bảng tổng hợp điểm...', 'info');
  const url = `${API_BASE}/api/export-summary-excel`;
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('Không thể tải file Excel bảng tổng điểm');
      return res.blob();
    })
    .then(blob => {
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Bang_tong_hop_diem_Trainee_Program_2026.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      showToast('✅ Đã xuất file Excel bảng tổng hợp điểm thành công!', 'success');
    })
    .catch(err => {
      showToast(`Lỗi khi xuất bảng điểm: ${err.message}`, 'error');
    });
}

function jumpToEvaluateCandidate(candidateId) {
  const form = state.forms.find(f => f.id === parseInt(candidateId));
  if (!form) return;

  state.selectedBan = isHeThong(form) ? 'he-thong' : 'ttsk';

  if (!state.selectedReviewer && state.reviewers.length > 0) {
    state.selectedReviewer = state.reviewers[0].name;
    state.selectedReviewerCol = state.reviewers[0].colIndex;
    const revSel = $('#reviewer-select');
    if (revSel) revSel.value = state.selectedReviewerCol;
  }

  if (state.selectedBan === 'he-thong') {
    state.filteredForms = state.forms.filter(isHeThong);
  } else {
    state.filteredForms = state.forms.filter(isTTSK);
  }

  const targetIdx = state.filteredForms.findIndex(f => f.id === form.id);
  state.currentIndex = targetIdx >= 0 ? targetIdx : 0;

  closeCandidateDetailModal();
  closeSummaryScreen();

  $('#setup-screen').classList.remove('active');
  $('#summary-screen').classList.remove('active');
  $('#eval-screen').classList.add('active');

  $('#current-reviewer').textContent = `👤 ${state.selectedReviewer}`;
  $('#current-ban').textContent = state.selectedBan === 'he-thong' ? '⚙️ Hệ thống' : '📢 Truyền thông - Sự kiện';

  buildSidebar();
  renderCurrentForm();
}

// ---- Init ----
async function init() {
  await loadData();
  initSetupScreen();
  initEventListeners();
  initWebSocket();

  if (!localStorage.getItem(GUIDE_STORAGE_KEY)) {
    openGuideModal();
  }
}

document.addEventListener('DOMContentLoaded', init);
