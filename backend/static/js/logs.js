// ── Адаптация под мобильные ────────────────────────────────────────────────
function measureHeaderHeight() {
  const header  = document.querySelector('.app-header');
  const toolbar = document.querySelector('.toolbar');
  if (!header || !toolbar) return;
  document.documentElement.style.setProperty(
    '--header-offset',
    (header.offsetHeight + toolbar.offsetHeight) + 'px'
  );
}
measureHeaderHeight();
window.addEventListener('resize', measureHeaderHeight);

/* logs.js — страница журнала системы */
'use strict';

const _token = AppStorage.get('access_token');
const _role  = AppStorage.get('user_role');
if (!_token) { AppStorage.clear(); location.href = '/'; }
if (_role !== 'admin') { location.href = '/dashboard'; }  // только admin

const HDRS = { 'Authorization': `Bearer ${_token}`, 'Content-Type': 'application/json' };

// Показываем имя и роль
const _uname = AppStorage.get('user_name') || '';
const _unEl  = document.getElementById('userName');
if (_unEl) _unEl.textContent = _uname;
const _pill = document.getElementById('rolePill');
if (_pill) { _pill.textContent = _role; _pill.className = `role-pill ${_role}`; }
document.getElementById('logoutBtn').addEventListener('click', () => { AppStorage.clear(); location.href = '/'; });

async function apiFetch(url) {
  try {
    const r = await fetch(url, { headers: HDRS });
    if (r.status === 401) { AppStorage.clear(); location.href = '/'; return null; }
    return r.ok ? r.json() : null;
  } catch (e) { console.error(e); return null; }
}

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function loading(el) { el.innerHTML = '<div class="rp-loading"><div class="rp-spinner"></div>Загрузка...</div>'; }
function empty(el, msg='Нет данных') { el.innerHTML = `<div class="rp-empty">${msg}</div>`; }

// ── Tabs ──────────────────────────────────────────────────────────
document.querySelectorAll('.rp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.rp-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');
    if (tab.dataset.panel === 'panelAuditLogs') loadAudit();
  });
});

// ══════════════════════════════════════════════════════════════════
// ТАБ 1: СИСТЕМНЫЕ ЛОГИ (файл app.log)
// ══════════════════════════════════════════════════════════════════

const LEVEL_ORDER = ['CRITICAL', 'ERROR', 'WARNING', 'INFO'];
const ACT_LABEL = { create:'➕ Создание', update:'✏️ Изменение', delete:'🗑 Удаление' };

async function loadFileLogs() {
  const area    = document.getElementById('fileLogsArea');
  const levelBar = document.getElementById('levelBar');
  loading(area);

  const level  = document.getElementById('filterLevel').value;
  const search = document.getElementById('filterSearch').value.trim();
  const lines  = document.getElementById('filterLines').value;

  const params = new URLSearchParams({ lines });
  if (level)  params.set('level',  level);
  if (search) params.set('search', search);

  const data = await apiFetch('/api/audit/file-logs?' + params);
  if (!data) { empty(area, 'Ошибка загрузки логов'); return; }

  const entries = data.entries;
  const countEl = document.getElementById('logsCount');
  if (countEl) countEl.textContent = `${entries.length} записей`;

  // ── Level bar ─────────────────────────────────────────────────
  const counts = { INFO:0, WARNING:0, ERROR:0, CRITICAL:0, AUDIT:0 };
  entries.forEach(e => {
    const l = e.level?.toUpperCase() || 'INFO';
    if (l === 'INFO' && (e.msg||'').startsWith('AUDIT')) counts.AUDIT++;
    else if (counts[l] !== undefined) counts[l]++;
  });
  levelBar.innerHTML = Object.entries(counts)
    .filter(([,v]) => v > 0)
    .map(([l,v]) => `
      <div class="level-chip ${l}" onclick="filterByLevel('${l === 'AUDIT' ? '' : l}')">
        <span class="level-count">${v}</span>
        <span>${l}</span>
      </div>`)
    .join('');

  if (!entries.length) { empty(area, 'Логов нет — попробуйте изменить фильтры'); return; }

  // ── Таблица ───────────────────────────────────────────────────
  const rows = entries.map(e => {
    const lvl  = (e.level || 'INFO').toUpperCase();
    const isAudit = lvl === 'INFO' && (e.msg||'').startsWith('AUDIT');
    const badge = isAudit ? 'AUDIT' : lvl;
    const msg   = esc(e.msg || '');
    const extra = [];
    if (e.user)   extra.push(`<span class="log-extra-key">user:</span> <b>${esc(e.user)}</b>`);
    if (e.path)   extra.push(`<span class="log-extra-key">path:</span> ${esc(e.path)}`);
    if (e.status) extra.push(`<span class="log-extra-key">status:</span> ${esc(e.status)}`);
    if (e.exc)    extra.push(`<span style="color:#c62828;font-size:11px">${esc(e.exc.slice(0,200))}</span>`);
    return `
      <tr class="log-row-${isAudit ? 'INFO' : lvl}">
        <td style="white-space:nowrap;color:#9ca3af;font-size:11px">${esc(e.ts || '')}</td>
        <td><span class="log-badge ${badge}">${badge}</span></td>
        <td style="color:#6b7280;font-size:11px;white-space:nowrap">${esc(e.logger || '')}</td>
        <td class="msg">${msg}${extra.length ? '<br><span style="color:#9ca3af;font-size:11px">'+extra.join(' &nbsp;·&nbsp; ')+'</span>' : ''}</td>
      </tr>`;
  }).join('');

  area.innerHTML = `
    <div class="log-table-wrap">
      <table class="log-table">
        <thead><tr>
          <th>Время</th><th>Уровень</th><th>Модуль</th><th>Сообщение</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

window.filterByLevel = function(lvl) {
  document.getElementById('filterLevel').value = lvl;
  loadFileLogs();
};

document.getElementById('btnFilterLogs').addEventListener('click', loadFileLogs);
document.getElementById('btnRefreshLogs').addEventListener('click', loadFileLogs);
document.getElementById('btnClearFilter').addEventListener('click', () => {
  document.getElementById('filterLevel').value  = '';
  document.getElementById('filterSearch').value = '';
  document.getElementById('filterLines').value  = '200';
  loadFileLogs();
});
document.getElementById('filterSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadFileLogs();
});

// ══════════════════════════════════════════════════════════════════
// ТАБ 2: ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЕЙ (Audit_log в MySQL)
// ══════════════════════════════════════════════════════════════════

const ACT_CLS = { create:'green', update:'yellow', delete:'red' };

async function loadAudit() {
  const area   = document.getElementById('auditLogsArea');
  const sumEl  = document.getElementById('auditSummary');
  loading(area);

  // Сводка
  const stats = await apiFetch('/api/audit/stats');
  if (stats) {
    const s = stats.stats;
    sumEl.innerHTML = `
      <div class="rp-sum-card gray"><div class="rp-sum-num">${s.total}</div><div>Всего</div></div>
      <div class="rp-sum-card green"><div class="rp-sum-num">${s.creates}</div><div>Создано</div></div>
      <div class="rp-sum-card yellow"><div class="rp-sum-num">${s.updates}</div><div>Изменено</div></div>
      <div class="rp-sum-card red"><div class="rp-sum-num">${s.deletes}</div><div>Удалено</div></div>
      <div class="rp-sum-card gray"><div class="rp-sum-num">${s.last_7_days}</div><div>За 7 дней</div></div>`;
  }

  // Лента
  const action = document.getElementById('auditAction').value;
  const user   = document.getElementById('auditUser').value.trim();
  const params = new URLSearchParams({ limit: 300 });
  if (action) params.set('action', action);
  if (user)   params.set('user', user);

  const rows = await apiFetch('/api/audit/recent?' + params);
  if (!rows) { empty(area, 'Ошибка загрузки'); return; }
  if (!rows.length) { empty(area, 'Нет записей аудита'); return; }

  area.innerHTML = rows.map(r => {
    const isUpd = r.action === 'update' && r.field_name;
    return `
      <div class="audit-row audit-${r.action}">
        <div class="audit-meta">
          <span class="rp-badge ${ACT_CLS[r.action]||'gray'}">${ACT_LABEL[r.action]||r.action}</span>
          <span class="audit-fio">${esc(r.applicant_fio)}</span>
          <span class="audit-user">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ${esc(r.changed_by)} <span class="audit-role">${esc(r.changed_by_role)}</span>
          </span>
          <span class="audit-time">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${r.changed_at}
          </span>
        </div>
        ${isUpd ? `
        <div class="audit-change">
          <span class="audit-field">${esc(r.field_name)}</span>
          <span class="audit-old">${esc(r.old_value||'—')}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5c6bc0" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          <span class="audit-new">${esc(r.new_value||'—')}</span>
        </div>` : ''}
      </div>`;
  }).join('');
}

document.getElementById('btnLoadAudit').addEventListener('click', loadAudit);

// ── Logo fallback ─────────────────────────────────────────────────
const _li = document.getElementById('logoImg');
if (_li) _li.addEventListener('error', function () {
  this.style.display = 'none';
  this.parentElement.textContent = 'А';
});

// ── Init ──────────────────────────────────────────────────────────
loadFileLogs();
loadAudit();