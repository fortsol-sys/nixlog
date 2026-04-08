'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let allEntries    = [];   // full set loaded from the selected file
let currentPath   = null; // relative path of the selected log file
let sse           = null; // active EventSource
let selectedEntry = null; // entry shown in the detail panel
let selectedRow   = null; // <tr> currently highlighted

let sortCol = 'timestamp';
let sortAsc = true;

// field → value map for active field-filters
let activeFilters = {};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $treeRoot    = document.getElementById('tree-root');
const $logBody     = document.getElementById('log-body');
const $splitView   = document.getElementById('split-view');
const $tableWrap   = document.getElementById('table-wrap');
const $search      = document.getElementById('search');
const $filterExit  = document.getElementById('filter-exit');
const $liveBadge   = document.getElementById('live-badge');
const $themeSelect = document.getElementById('theme-select');
const $hResize     = document.getElementById('h-resize');
const $detailPanel = document.getElementById('detail-panel');
const $detailCnt   = document.getElementById('detail-content');
const $dCommand    = document.getElementById('d-command');
const $dTimestamp  = document.getElementById('d-timestamp');
const $dExit       = document.getElementById('d-exit');
const $dUser       = document.getElementById('d-user');
const $dPwd        = document.getElementById('d-pwd');
const $dTerminal   = document.getElementById('d-terminal');
const $dSession    = document.getElementById('d-session');
const $commentList = document.getElementById('detail-comment-list');
const $commentInput= document.getElementById('detail-comment-input');
const $commentBtn  = document.getElementById('detail-comment-btn');
const $filterChips = document.getElementById('filter-chips');

// ─── Tree ─────────────────────────────────────────────────────────────────────

async function loadTree() {
  try {
    const res  = await fetch('/api/tree');
    const tree = await res.json();
    renderTree(tree, $treeRoot);
    if (currentPath) {
      const el = $treeRoot.querySelector(`[data-path="${CSS.escape(currentPath)}"]`);
      if (el) el.classList.add('active');
    }
  } catch (e) {
    console.error('Tree load failed', e);
  }
}

function renderTree(nodes, container) {
  container.innerHTML = '';
  for (const node of nodes) {
    if (node.type === 'dir') {
      const details = document.createElement('details');
      details.className = 'tree-dir';
      details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = node.name;
      const children = document.createElement('div');
      children.className = 'tree-children';
      renderTree(node.children, children);
      details.append(summary, children);
      container.appendChild(details);
    } else {
      const el = document.createElement('div');
      el.className = 'tree-file';
      el.textContent = node.name;
      el.dataset.path = node.path;
      el.tabIndex = 0;
      el.addEventListener('click', () => selectFile(node.path, el));
      el.addEventListener('keydown', e => { if (e.key === 'Enter') selectFile(node.path, el); });
      container.appendChild(el);
    }
  }
}

function selectFile(path, el) {
  $treeRoot.querySelectorAll('.tree-file').forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  loadLogs(path);
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

async function loadLogs(path) {
  currentPath = path;
  selectedEntry = null;
  selectedRow   = null;
  showDetailPlaceholder();

  $splitView.hidden = false;

  const res = await fetch(`/api/logs?path=${enc(path)}`);
  allEntries = await res.json();
  renderTable();
  startStream(path);
}

// ─── SSE stream ───────────────────────────────────────────────────────────────

function startStream(path) {
  if (sse) sse.close();

  sse = new EventSource(`/api/stream?path=${enc(path)}`);

  sse.onopen = () => {
    $liveBadge.classList.remove('off');
    $liveBadge.textContent = '● LIVE';
  };

  sse.onmessage = ({ data }) => {
    const entry = JSON.parse(data);
    entry.comments = entry.comments || [];
    allEntries.push(entry);

    if (matchesFilter(entry)) {
      $logBody.appendChild(buildRow(entry));
      const w = $tableWrap;
      if (w.scrollHeight - w.scrollTop - w.clientHeight < 120) {
        w.scrollTop = w.scrollHeight;
      }
    }
  };

  sse.onerror = () => {
    $liveBadge.classList.add('off');
    $liveBadge.textContent = '○ OFFLINE';
  };
}

// ─── Field filters (chips) ────────────────────────────────────────────────────

function addFieldFilter(field, value) {
  activeFilters[field] = value;
  renderChips();
  renderTable();
}

function removeFieldFilter(field) {
  delete activeFilters[field];
  renderChips();
  renderTable();
}

function renderChips() {
  $filterChips.innerHTML = '';
  const entries = Object.entries(activeFilters);
  $filterChips.hidden = entries.length === 0;
  for (const [field, value] of entries) {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.innerHTML = `
      <span class="chip-label">${esc(field)}:</span>
      <span>${esc(value)}</span>
      <button class="chip-remove" title="Remove filter">×</button>
    `;
    chip.querySelector('.chip-remove').addEventListener('click', () => removeFieldFilter(field));
    $filterChips.appendChild(chip);
  }
}

// ─── Filtering ────────────────────────────────────────────────────────────────

function matchesFilter(e) {
  const q    = $search.value.trim().toLowerCase();
  const exit = $filterExit.value;
  if (q && !['command', 'pwd', 'user'].some(k => (e[k] || '').toLowerCase().includes(q))) return false;
  if (exit === '0'   && e.exit_code !== 0) return false;
  if (exit === 'err' && e.exit_code === 0) return false;
  // Active field filters
  for (const [field, value] of Object.entries(activeFilters)) {
    const ev = String(e[field] ?? '');
    if (field === 'exit_code') {
      if (ev !== value) return false;
    } else {
      if (!ev.toLowerCase().includes(value.toLowerCase())) return false;
    }
  }
  return true;
}

// ─── Table rendering ──────────────────────────────────────────────────────────

function renderTable() {
  $logBody.innerHTML = '';
  getSorted(allEntries.filter(matchesFilter)).forEach(e => $logBody.appendChild(buildRow(e)));
  // Re-apply selection highlight after re-render
  if (selectedEntry) {
    selectedRow = $logBody.querySelector(`tr[data-id="${selectedEntry.id}"]`) || null;
    if (selectedRow) selectedRow.classList.add('row-selected');
  }
}

function getSorted(entries) {
  return [...entries].sort((a, b) => {
    let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ?  1 : -1;
    return 0;
  });
}

function buildRow(entry) {
  const isErr = entry.exit_code !== 0;
  const tr    = document.createElement('tr');
  tr.dataset.id = entry.id;
  if (isErr) tr.classList.add('row-err');

  const ts  = entry.timestamp ? fmtTime(entry.timestamp) : '';
  const pwd = shortenPath(entry.pwd || '');
  const cmt = (entry.comments || []).length;

  tr.innerHTML = `
    <td class="col-ts"  title="${esc(entry.timestamp || '')}">${esc(ts)}</td>
    <td class="col-user">${esc(entry.user || '')}</td>
    <td class="col-pwd" title="${esc(entry.pwd || '')}">${esc(pwd)}</td>
    <td class="col-cmd"><code>${esc(entry.command || '')}</code></td>
    <td class="col-exit ${isErr ? 'exit-err' : 'exit-ok'}">${entry.exit_code}</td>
    <td class="col-act">${cmt ? `<span class="cmt-badge">💬${cmt}</span>` : ''}</td>
  `;

  tr.style.cursor = 'pointer';
  tr.addEventListener('click', () => selectEntry(tr, entry));
  return tr;
}

// ─── Row selection & detail panel ─────────────────────────────────────────────

function selectEntry(tr, entry) {
  if (selectedRow) selectedRow.classList.remove('row-selected');
  selectedRow   = tr;
  selectedEntry = entry;
  tr.classList.add('row-selected');
  renderDetail(entry);
}

function showDetailPlaceholder() {
  $detailCnt.hidden = true;
}

function renderDetail(entry) {
  $detailCnt.hidden = false;

  // Metadata fields
  $dCommand.textContent   = entry.command   || '';
  $dTimestamp.textContent = entry.timestamp ? fmtDateTime(entry.timestamp) : '';
  $dUser.textContent      = entry.user      || '';
  $dPwd.textContent       = entry.pwd       || '';
  $dPwd.title             = entry.pwd       || '';
  $dTerminal.textContent  = entry.terminal  || '';
  $dSession.textContent   = entry.session_id|| '';

  const isErr = entry.exit_code !== 0;
  $dExit.textContent  = entry.exit_code;
  $dExit.className    = isErr ? 'exit-err' : 'exit-ok';

  // Comments
  renderCommentList(entry.comments || []);

  // Wire up comment submission for this entry
  $commentInput.value = '';
  $commentBtn.onclick = null;
  const submit = async () => {
    const text = $commentInput.value.trim();
    if (!text) return;
    $commentInput.value   = '';
    $commentInput.disabled = true;
    $commentBtn.disabled   = true;
    try {
      const res = await fetch('/api/comments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entry_id: entry.id, log_path: currentPath, comment: text }),
      });
      const c = await res.json();
      entry.comments = entry.comments || [];
      entry.comments.push(c);
      renderCommentList(entry.comments);
      // Update badge in table row
      if (selectedRow) {
        const badge = selectedRow.querySelector('.col-act');
        if (badge) badge.innerHTML = `<span class="cmt-badge">💬${entry.comments.length}</span>`;
      }
    } finally {
      $commentInput.disabled = false;
      $commentBtn.disabled   = false;
      $commentInput.focus();
    }
  };
  $commentBtn.onclick = submit;
  $commentInput.onkeydown = e => { if (e.key === 'Enter') submit(); };
}

function renderCommentList(comments) {
  $commentList.innerHTML = '';
  if (!comments.length) {
    const em = document.createElement('span');
    em.className = 'comment-empty';
    em.textContent = 'No comments yet.';
    $commentList.appendChild(em);
    return;
  }
  for (const c of comments) {
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
      <span class="comment-ts">${esc(fmtDateTime(c.timestamp))}</span>
      <span class="comment-body">${esc(c.comment)}</span>
    `;
    $commentList.appendChild(div);
  }
  $commentList.scrollTop = $commentList.scrollHeight;
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('#log-table th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    sortAsc = sortCol === col ? !sortAsc : true;
    sortCol = col;
    document.querySelectorAll('#log-table th[data-col]').forEach(h =>
      h.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(sortAsc ? 'sorted-asc' : 'sorted-desc');
    renderTable();
  });
});

// ─── Search & filter ──────────────────────────────────────────────────────────

let searchTimer = null;
$search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTable, 150);
});
$filterExit.addEventListener('change', renderTable);

// ─── Horizontal pane resize ───────────────────────────────────────────────────

const DETAIL_HEIGHT_KEY = 'nixlog-detail-height';
const DETAIL_DEFAULT    = 220;

function applyDetailHeight(h) {
  const min  = 60;
  const max  = $splitView.clientHeight - 60 - $hResize.offsetHeight;
  h = Math.min(Math.max(h, min), max);
  $detailPanel.style.height = h + 'px';
  $tableWrap.style.height   = ($splitView.clientHeight - h - $hResize.offsetHeight) + 'px';
}

function initPaneResize() {
  const saved = parseInt(localStorage.getItem(DETAIL_HEIGHT_KEY), 10);
  applyDetailHeight(isNaN(saved) ? DETAIL_DEFAULT : saved);

  $hResize.addEventListener('mousedown', e => {
    e.preventDefault();
    $hResize.classList.add('dragging');
    document.body.style.cursor    = 'row-resize';
    document.body.style.userSelect = 'none';

    const startY      = e.clientY;
    const startHeight = $detailPanel.offsetHeight;

    const onMove = e => {
      const newH = startHeight - (e.clientY - startY);
      applyDetailHeight(newH);
    };

    const onUp = () => {
      $hResize.classList.remove('dragging');
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
      localStorage.setItem(DETAIL_HEIGHT_KEY, $detailPanel.offsetHeight);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Re-apply on window resize
  window.addEventListener('resize', () => {
    applyDetailHeight($detailPanel.offsetHeight);
  });
}

// ─── Column resize ────────────────────────────────────────────────────────────

function initColumnResize() {
  const ths  = Array.from(document.querySelectorAll('#log-table thead th'));
  const cols = Array.from(document.querySelectorAll('#log-table colgroup col'));

  ths.slice(0, -1).forEach((th, i) => {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.addEventListener('click', e => e.stopPropagation());
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      handle.classList.add('dragging');
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';

      const startX     = e.clientX;
      const startWidth = th.offsetWidth;

      const onMove = e => {
        cols[i].style.width = Math.max(40, startWidth + e.clientX - startX) + 'px';
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    th.appendChild(handle);
  });
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('nixlog-theme', theme);
}

$themeSelect.addEventListener('change', () => applyTheme($themeSelect.value));
const savedTheme = localStorage.getItem('nixlog-theme') || 'dark';
$themeSelect.value = savedTheme;
applyTheme(savedTheme);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enc(s) { return encodeURIComponent(s); }

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
}

function fmtDateTime(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function shortenPath(p) {
  return p.replace(/^\/home\/[^/]+/, '~');
}

// ─── Detail-pane filter buttons ───────────────────────────────────────────────

// Map data-field → which element holds the current value
const fieldValueEls = {
  timestamp:  $dTimestamp,
  exit_code:  $dExit,
  user:       $dUser,
  pwd:        $dPwd,
  terminal:   $dTerminal,
  session_id: $dSession,
};

document.querySelectorAll('.filter-by-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedEntry) return;
    const field = btn.dataset.field;
    const value = String(selectedEntry[field] ?? '');
    if (value === '') return;
    addFieldFilter(field, value);
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

initColumnResize();
initPaneResize();
loadTree();
setInterval(loadTree, 60_000);
