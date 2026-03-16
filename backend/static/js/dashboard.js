/* dashboard.js — v3 */
'use strict';

// ═══════════════════════════════════════════════════════
// СОСТОЯНИЕ
// ═══════════════════════════════════════════════════════
const State = {
  token:    AppStorage.get('access_token') || '',
  role:     AppStorage.get('user_role')    || 'viewer',
  userName: AppStorage.get('user_name')    || '',
  rows:     [],
  filtered: [],
  selected: null,
  sortCol:  null,
  sortDir:  'asc',
  editingId: null,
  benefits: [],
  subjects: [],
  regions:  [],
};

if (!State.token) { AppStorage.clear(); window.location.href = '/'; }

// ── Проверка истечения токена (уязвимость #8) ─────────────────────────────
const _tokenExpire = parseInt(AppStorage.get('token_expire') || '0', 10);
if (_tokenExpire && Date.now() > _tokenExpire) {
  sessionStorage.clear();
  window.location.href = '/';
}
// Предупреждение за 5 минут до истечения
if (_tokenExpire) {
  const _warnAt = _tokenExpire - 5 * 60 * 1000;
  const _delay  = _warnAt - Date.now();
  if (_delay > 0) {
    setTimeout(() => {
      showToast('Сессия истекает через 5 минут. Сохраните работу.', 'error');
    }, _delay);
  }
  setTimeout(() => {
    AppStorage.clear();
    window.location.href = '/';
  }, _tokenExpire - Date.now());
}



// ═══════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════
async function api(method, url, body) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${State.token}`,
      'Content-Type':  'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    // Сетевая ошибка — показываем пустую таблицу вместо бесконечного спиннера
    showToast('Ошибка соединения с сервером', 'error');
    showLoading(false);
    return null;
  }

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/';
    return null;
  }
  return res;
}

// ═══════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════
const toastEl   = document.getElementById('appToast');
const toastIcon = document.getElementById('toastIcon');
const toastText = document.getElementById('toastText');
let toastTimer;
const SVG_OK  = `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`;
const SVG_ERR = `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`;

function showToast(msg, type = 'success') {
  clearTimeout(toastTimer);
  toastEl.className = `app-toast ${type}`;
  toastIcon.innerHTML = type === 'success' ? SVG_OK : SVG_ERR;
  toastText.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3400);
}

// ═══════════════════════════════════════════════════════
// HEADER
// ═══════════════════════════════════════════════════════
function initHeader() {
  document.getElementById('userName').textContent = State.userName;

  const pill = document.getElementById('rolePill');
  pill.textContent = State.role;
  pill.className   = `role-pill ${State.role}`;

  if (State.role === 'viewer') {
    // Скрываем кнопки действий и экспорта
    ['btnAdd', 'btnEdit', 'btnDelete', 'btnImport', 'btnExport'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Вешаем класс на таблицу — CSS скроет все колонки кроме data-viewer="show"
    const table = document.getElementById('mainTable');
    if (table) table.classList.add('viewer-mode');
  }

  // Кнопка перехода в админ-панель — только для admin
  const adminBtn = document.getElementById('btnAdminPanel');
  if (adminBtn && State.role === 'admin') {
    adminBtn.style.display = 'flex';
  }
  const reportsBtn = document.getElementById('btnReports');
  if (reportsBtn && ['admin','editor'].includes(State.role)) {
    reportsBtn.style.display = 'flex';
  }
  const logsBtn = document.getElementById('btnLogs');
  if (logsBtn && State.role === 'admin') {
    logsBtn.style.display = 'flex';
  }
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  AppStorage.clear();
  window.location.href = '/';
});

// ═══════════════════════════════════════════════════════
// ЗАГРУЗКА ДАННЫХ С СЕРВЕРА
// ═══════════════════════════════════════════════════════
async function loadData() {
  showLoading(true);
  const q   = document.getElementById('searchInput').value.trim();
  const url = `/api/applicants${q ? `?search=${encodeURIComponent(q)}` : ''}`;
  const res = await api('GET', url);

  // api() уже вызвал showLoading(false) при сетевой ошибке
  if (!res) return;

  if (!res.ok) {
    showToast('Ошибка загрузки данных', 'error');
    showLoading(false);
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    showToast('Ошибка разбора ответа сервера', 'error');
    showLoading(false);
    return;
  }

  State.rows     = data;
  State.filtered = [...State.rows];
  renderTable();
  showLoading(false);
}

function showLoading(yes) {
  document.getElementById('tableLoading').style.display = yes ? 'flex'  : 'none';
  document.getElementById('tableScroll').style.display  = yes ? 'none'  : '';
  if (yes) document.getElementById('tableEmpty').style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// РЕНДЕР ТАБЛИЦЫ
// ═══════════════════════════════════════════════════════
function renderTable() {
  const tbody  = document.getElementById('tableBody');
  const empty  = document.getElementById('tableEmpty');
  const scroll = document.getElementById('tableScroll');

  if (!State.filtered.length) {
    scroll.style.display = 'none';
    empty.style.display  = 'flex';
    document.getElementById('counter').textContent = '0 записей';
    return;
  }

  empty.style.display  = 'none';
  scroll.style.display = '';
  document.getElementById('counter').textContent =
    `${State.filtered.length} ${plural(State.filtered.length, 'запись', 'записи', 'записей')}`;

  // Для viewer — только ФИО и рейтинг (без телефонов и прочих контактов)
  const isViewer = State.role === 'viewer';

  tbody.innerHTML = State.filtered.map((r, idx) => {
    if (isViewer) {
      return `
        <tr data-idx="${idx}" data-id="${r.id}"
            class="${State.selected?.id === r.id ? 'selected' : ''}">
          <td data-viewer="show" class="id-cell">${idx + 1}</td>
          <td data-viewer="show">${esc(r.last_name)}</td>
          <td data-viewer="show">${esc(r.first_name)}</td>
          <td data-viewer="show">${esc(r.patronymic || '')}</td>
          <td data-viewer="show" class="rating-cell">${(r.rating || 0).toFixed(1)}</td>
        </tr>`;
    }
    return `
      <tr data-idx="${idx}" data-id="${r.id}"
          class="${State.selected?.id === r.id ? 'selected' : ''}">
        <td class="id-cell">${idx + 1}</td>
        <td>${esc(r.last_name)}</td>
        <td>${esc(r.first_name)}</td>
        <td>${esc(r.patronymic || '')}</td>
        <td>${esc(r.code || '')}</td>
        <td>${esc(r.form_education || '')}</td>
        <td class="rating-cell">${(r.rating || 0).toFixed(1)}</td>
        <td>${esc(r.benefit || '—')}</td>
        <td>${r.has_original ? '<span class="badge-yes">Да</span>' : '<span class="badge-no">Нет</span>'}</td>
        <td>${esc(r.region || '')}</td>
        <td>${esc(r.city || '')}</td>
        <td>${r.dormitory ? '<span class="badge-yes">Да</span>' : '<span class="badge-no">Нет</span>'}</td>
        <td title="${esc(r.institution || '')}">${esc(r.institution || '')}</td>
        <td>${esc(r.submission_date || '')}</td>
        <td>${esc(r.visit_date || '')}</td>
        <td title="${esc(r.info_source || '')}">${esc(r.info_source || '')}</td>
        <td>${esc(r.phone || '')}</td>
        <td>${esc(r.vk || '')}</td>
        <td title="${esc(r.parent_name || '')}">${esc(r.parent_name || '')}</td>
        <td>${esc(r.parent_phone || '')}</td>
        <td title="${esc(r.notes || '')}">${esc(r.notes || '')}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click',    () => selectRow(tr));
    tr.addEventListener('dblclick', () => { selectRow(tr); if (State.role !== 'viewer') openEdit(); });
  });
}

function selectRow(tr) {
  State.selected = { id: +tr.dataset.id, index: +tr.dataset.idx };
  document.querySelectorAll('#tableBody tr').forEach(r => r.classList.remove('selected'));
  tr.classList.add('selected');
  if (State.role !== 'viewer') {
    document.getElementById('btnEdit').disabled   = false;
    document.getElementById('btnDelete').disabled = false;
  }
}

// ═══════════════════════════════════════════════════════
// СОРТИРОВКА
// ═══════════════════════════════════════════════════════
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    State.sortDir = (State.sortCol === col && State.sortDir === 'asc') ? 'desc' : 'asc';
    State.sortCol = col;
    document.querySelectorAll('th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    th.classList.add(State.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    State.filtered.sort((a, b) => {
      let va = a[col] ?? '', vb = b[col] ?? '';
      if (typeof va === 'boolean') { va = +va; vb = +vb; }
      else if (!isNaN(+va) && !isNaN(+vb)) { va = +va; vb = +vb; }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      return State.sortDir === 'asc'
        ? (va < vb ? -1 : va > vb ? 1 : 0)
        : (va > vb ? -1 : va < vb ? 1 : 0);
    });
    renderTable();
  });
});

// ═══════════════════════════════════════════════════════
// ПОИСК
// ═══════════════════════════════════════════════════════
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
let   searchTimer;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim().toLowerCase();
  searchClear.style.display = q ? 'block' : 'none';
  searchTimer = setTimeout(() => {
    State.filtered = q
      ? State.rows.filter(r =>
          Object.values(r).some(v => String(v || '').toLowerCase().includes(q))
        )
      : [...State.rows];
    State.selected = null;
    if (State.role !== 'viewer') {
      document.getElementById('btnEdit').disabled    = true;
      document.getElementById('btnDelete').disabled  = true;
      const _hb = document.getElementById('btnHistory');
      if (_hb) _hb.disabled = true;
    }
    renderTable();
  }, 250);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  State.filtered = [...State.rows];
  renderTable();
});

document.getElementById('btnRefresh').addEventListener('click', () => {
  State.selected = null;
  if (State.role !== 'viewer') {
    document.getElementById('btnEdit').disabled   = true;
    document.getElementById('btnDelete').disabled = true;
  }
  loadData();
});

// ═══════════════════════════════════════════════════════
// ТЕЛЕФОН — автоформатирование +7-XXX-XXX-XX-XX
// ═══════════════════════════════════════════════════════
function formatPhone(raw) {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('8'))                       digits = '7' + digits.slice(1);
  if (!digits.startsWith('7') && digits.length > 0) digits = '7' + digits;
  digits = digits.slice(0, 11);
  let r = '';
  if (digits.length > 0) r  = '+' + digits[0];
  if (digits.length > 1) r += '-' + digits.slice(1, 4);
  if (digits.length > 4) r += '-' + digits.slice(4, 7);
  if (digits.length > 7) r += '-' + digits.slice(7, 9);
  if (digits.length > 9) r += '-' + digits.slice(9, 11);
  return r;
}

function attachPhoneFormat(el) {
  el.addEventListener('input', function () {
    const pos  = this.selectionStart;
    const prev = this.value.length;
    this.value = formatPhone(this.value);
    const diff = this.value.length - prev;
    this.setSelectionRange(pos + diff, pos + diff);
  });
  el.addEventListener('keydown', function (e) {
    if (e.key === 'Backspace') {
      const pos = this.selectionStart;
      if (pos > 0 && /[-+]/.test(this.value[pos - 1])) {
        e.preventDefault();
        const digits = this.value.replace(/\D/g, '').slice(0, -1);
        this.value   = formatPhone(digits);
        const np = this.value.length;
        this.setSelectionRange(np, np);
      }
    }
  });
}

document.querySelectorAll('.phone-input').forEach(attachPhoneFormat);

// ═══════════════════════════════════════════════════════
// СПРАВОЧНИКИ
// ═══════════════════════════════════════════════════════
async function loadRefs() {
  const [benRes, regRes, srcRes, subRes] = await Promise.all([
    api('GET', '/api/applicants/ref/benefits'),
    api('GET', '/api/applicants/ref/regions'),
    api('GET', '/api/applicants/ref/sources'),
    api('GET', '/api/applicants/ref/subjects'),
  ]);

  if (benRes?.ok) {
    State.benefits = await benRes.json();
    const sel = document.getElementById('fBenefit');
    if (sel) {
      // Оставляем только первый option (пустой placeholder)
      while (sel.options.length > 1) sel.remove(1);
      State.benefits.forEach(b =>
        sel.appendChild(new Option(`${b.name} (+${b.points} б.)`, b.name))
      );
    }
  }

  if (regRes?.ok) {
    State.regions = await regRes.json();
    const dl = document.getElementById('regionList');
    if (dl) {
      dl.innerHTML = '';  // очищаем datalist перед заполнением
      State.regions.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.name;
        dl.appendChild(opt);
      });
    }
  }

  if (srcRes?.ok) {
    const srcs = await srcRes.json();
    const sel  = document.getElementById('fInfoSource');
    if (sel) {
      // Очищаем перед заполнением — защита от двойной загрузки
      while (sel.options.length > 1) sel.remove(1);
      srcs.filter(s => s && s.trim()).forEach(s => sel.appendChild(new Option(s, s)));
    }
  }

  if (subRes?.ok) State.subjects = (await subRes.json()).filter(s => s && s.name && s.name.trim());
}

// Обновление datalist городов при вводе региона
let cityLoadTimer;
const fRegionEl = document.getElementById('fRegion');
if (fRegionEl) {
  fRegionEl.addEventListener('input', function () {
    clearTimeout(cityLoadTimer);
    const regionName = this.value.trim();
    cityLoadTimer = setTimeout(() => refreshCityList(regionName), 350);
  });
}

async function refreshCityList(regionName) {
  const dl = document.getElementById('cityList');
  if (!dl) return;
  dl.innerHTML = '';
  if (!regionName) return;
  const res = await api('GET', `/api/applicants/ref/cities?region=${encodeURIComponent(regionName)}`);
  if (!res?.ok) return;
  const cities = await res.json();
  cities.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    dl.appendChild(opt);
  });
}

// Льгота → бонус → пересчёт
const fBenefitEl = document.getElementById('fBenefit');
if (fBenefitEl) {
  fBenefitEl.addEventListener('change', function () {
    const found = State.benefits.find(b => b.name === this.value);
    const pts   = found ? found.points : 0;
    document.getElementById('bonusDisplay').textContent = `${pts} б.`;
    recalcTotal();
  });
}

function recalcTotal() {
  const bonus   = parseInt(document.getElementById('bonusDisplay')?.textContent) || 0;
  const examSum = [...document.querySelectorAll('.exam-score')]
    .reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  const examSumEl = document.getElementById('examSum');
  const totalEl   = document.getElementById('totalRating');
  if (examSumEl) examSumEl.textContent = `${examSum.toFixed(1)} б.`;
  if (totalEl)   totalEl.textContent   = (bonus + examSum).toFixed(1);
}

// ═══════════════════════════════════════════════════════
// ЭКЗАМЕНЫ
// ═══════════════════════════════════════════════════════
const MAX_EXAMS = 3;

function getUsedSubjectIds() {
  return [...document.querySelectorAll('.exam-subject')]
    .map(s => +s.value).filter(Boolean);
}

function refreshSubjectOptions() {
  const usedIds = getUsedSubjectIds();
  document.querySelectorAll('.exam-subject').forEach(sel => {
    const cur = +sel.value;
    sel.querySelectorAll('option[value]').forEach(opt => {
      if (!opt.value) return;
      opt.disabled = usedIds.includes(+opt.value) && +opt.value !== cur;
    });
  });
}

function updateAddExamBtn() {
  const btn = document.getElementById('btnAddExam');
  if (btn) btn.disabled = document.querySelectorAll('.exam-row').length >= MAX_EXAMS;
}

function buildExamRow(id_subject = '', score = '') {
  const usedIds = getUsedSubjectIds();
  const options = State.subjects.map(s => {
    const sel = s.id === +id_subject ? 'selected' : '';
    const dis = usedIds.includes(s.id) && s.id !== +id_subject ? 'disabled' : '';
    return `<option value="${s.id}" ${sel} ${dis}>${esc(s.name)}</option>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'exam-row';
  div.innerHTML = `
    <select class="exam-subject">
      <option value="">— предмет —</option>${options}
    </select>
    <input type="number" class="exam-score" min="0" max="100" step="0.1"
           placeholder="Балл (0–100)" value="${score}" />
    <button type="button" class="btn-remove-exam" title="Удалить">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>`;
  div.querySelector('.exam-subject').addEventListener('change', () => {
    refreshSubjectOptions(); recalcTotal();
  });
  div.querySelector('.exam-score').addEventListener('input', recalcTotal);
  div.querySelector('.btn-remove-exam').addEventListener('click', () => {
    div.remove(); refreshSubjectOptions(); recalcTotal(); updateAddExamBtn();
  });
  return div;
}

const btnAddExamEl = document.getElementById('btnAddExam');
if (btnAddExamEl) {
  btnAddExamEl.addEventListener('click', () => {
    if (document.querySelectorAll('.exam-row').length >= MAX_EXAMS) return;
    document.getElementById('examRows').appendChild(buildExamRow());
    updateAddExamBtn();
  });
}

function clearExams() {
  const examRowsEl = document.getElementById('examRows');
  if (examRowsEl) examRowsEl.innerHTML = '';
  const examSumEl = document.getElementById('examSum');
  const totalEl   = document.getElementById('totalRating');
  if (examSumEl) examSumEl.textContent = '0 б.';
  if (totalEl)   totalEl.textContent   = '0.0';
  updateAddExamBtn();
}

// ═══════════════════════════════════════════════════════
// МОДАЛЬНОЕ ОКНО — ФОРМА
// ═══════════════════════════════════════════════════════
const applicantModalEl = document.getElementById('applicantModal');
const applicantModal   = applicantModalEl ? new bootstrap.Modal(applicantModalEl) : null;

function clearForm() {
  ['fLastName','fFirstName','fPatronymic','fCode','fPhone','fVk',
   'fInstitution','fParentName','fParentPhone','fNotes',
   'fRegion','fCity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const fFormEdu = document.getElementById('fFormEdu');
  const fBenefit = document.getElementById('fBenefit');
  const fInfoSrc = document.getElementById('fInfoSource');
  const fParRel  = document.getElementById('fParentRelation');
  const fSubDate = document.getElementById('fSubmissionDate');
  const fVisDate = document.getElementById('fVisitDate');
  const fOrig    = document.getElementById('fOriginal');
  const fDorm    = document.getElementById('fDormitory');
  const bonDisp  = document.getElementById('bonusDisplay');
  const cityLst  = document.getElementById('cityList');

  if (fFormEdu) fFormEdu.value = 'Очная';
  if (fBenefit) fBenefit.value = '';
  if (fInfoSrc) fInfoSrc.value = '';
  if (fParRel)  fParRel.value  = 'Родитель';
  if (fSubDate) fSubDate.value = '';
  if (fVisDate) fVisDate.value = '';
  if (fOrig)    fOrig.checked  = false;
  if (fDorm)    fDorm.checked  = false;
  if (bonDisp)  bonDisp.textContent = '0 б.';
  if (cityLst)  cityLst.innerHTML   = '';
  document.querySelectorAll('.fc').forEach(el => el.classList.remove('is-invalid'));
  clearExams();
}

function openAdd() {
  State.editingId = null;
  clearForm();
  const titleEl = document.getElementById('modalTitle');
  if (titleEl) titleEl.textContent = 'ДОБАВЛЕНИЕ АБИТУРИЕНТА';
  applicantModal?.show();
}

async function openEdit() {
  if (!State.selected) return;
  const row = State.filtered[State.selected.index];
  if (!row) return;

  State.editingId = row.id;
  clearForm();
  const titleEl = document.getElementById('modalTitle');
  if (titleEl) titleEl.textContent = 'РЕДАКТИРОВАНИЕ АБИТУРИЕНТА';

  document.getElementById('fLastName').value    = row.last_name    || '';
  document.getElementById('fFirstName').value   = row.first_name   || '';
  document.getElementById('fPatronymic').value  = row.patronymic   || '';
  document.getElementById('fCode').value        = row.code         || '';
  document.getElementById('fPhone').value       = row.phone        || '';
  document.getElementById('fVk').value          = row.vk           || '';
  document.getElementById('fInstitution').value = row.institution  || '';
  document.getElementById('fParentName').value  = row.parent_name  || '';
  document.getElementById('fParentPhone').value = row.parent_phone || '';
  document.getElementById('fNotes').value       = row.notes        || '';
  document.getElementById('fOriginal').checked  = row.has_original;
  document.getElementById('fDormitory').checked = row.dormitory;

  if (row.form_education)  document.getElementById('fFormEdu').value       = row.form_education;
  if (row.benefit)         document.getElementById('fBenefit').value        = row.benefit;
  if (row.info_source)     document.getElementById('fInfoSource').value     = row.info_source;
  if (row.parent_relation) document.getElementById('fParentRelation').value = row.parent_relation;

  const found = State.benefits.find(b => b.name === row.benefit);
  document.getElementById('bonusDisplay').textContent = `${found ? found.points : 0} б.`;

  if (row.submission_date) {
    const [d, m, y] = row.submission_date.split('.');
    if (y) document.getElementById('fSubmissionDate').value = `${y}-${m}-${d}`;
  }
  if (row.visit_date) {
    const [d, m, y] = row.visit_date.split('.');
    if (y) document.getElementById('fVisitDate').value = `${y}-${m}-${d}`;
  }

  if (row.region) {
    document.getElementById('fRegion').value = row.region;
    await refreshCityList(row.region);
  }
  if (row.city) document.getElementById('fCity').value = row.city;

  const eRes = await api('GET', `/api/applicants/${row.id}/exams`);
  if (eRes?.ok) {
    const exams = await eRes.json();
    exams.forEach(e =>
      document.getElementById('examRows').appendChild(buildExamRow(e.id_subject, e.score))
    );
    refreshSubjectOptions();
    updateAddExamBtn();
  }

  recalcTotal();
  applicantModal?.show();
}

const btnAddEl = document.getElementById('btnAdd');
const btnEditEl = document.getElementById('btnEdit');
if (btnAddEl)  btnAddEl.addEventListener('click', openAdd);
if (btnEditEl) btnEditEl.addEventListener('click', openEdit);

// ═══════════════════════════════════════════════════════
// ВАЛИДАЦИЯ
// ═══════════════════════════════════════════════════════
const NAME_RE = /^[А-Яа-яЁёA-Za-z\-\s]+$/;

['fLastName','fFirstName','fPatronymic'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', function () {
    const val     = this.value.trim();
    const invalid = val.length > 0 && !NAME_RE.test(val);
    this.classList.toggle('is-invalid', invalid);
    this.title = invalid ? 'Только буквы, дефис и пробел' : '';
  });
});

['fSubmissionDate','fVisitDate'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', function () {
    if (!this.value) { this.classList.remove('is-invalid'); this.title = ''; return; }
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const future = new Date(this.value) > today;
    this.classList.toggle('is-invalid', future);
    this.title = future ? 'Дата не может быть в будущем' : '';
  });
});

function validateForm() {
  let ok = true, errMsg = '';
  const required = {
    fLastName: 'Фамилия', fFirstName: 'Имя', fCode: 'Код специальности',
    fPhone: 'Телефон', fRegion: 'Регион', fCity: 'Город', fInstitution: 'Учебное заведение',
  };
  Object.entries(required).forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const empty = !el.value.trim();
    el.classList.toggle('is-invalid', empty);
    if (empty && !errMsg) errMsg = `Поле «${label}» обязательно для заполнения`;
    if (empty) ok = false;
  });
  [['fLastName','Фамилия'],['fFirstName','Имя'],['fPatronymic','Отчество']].forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value.trim();
    if (val && !NAME_RE.test(val)) {
      el.classList.add('is-invalid');
      if (!errMsg) errMsg = `«${label}» — только буквы, дефис и пробел`;
      ok = false;
    }
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  [['fSubmissionDate','Дата подачи'],['fVisitDate','Дата посещения']].forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.value && new Date(el.value) > today) {
      el.classList.add('is-invalid');
      if (!errMsg) errMsg = `«${label}» не может быть в будущем`;
      ok = false;
    }
  });
  if (!ok) showToast(errMsg, 'error');
  return ok;
}

// ═══════════════════════════════════════════════════════
// СОХРАНЕНИЕ
// ═══════════════════════════════════════════════════════
function buildPayload() {
  return {
    last_name:       document.getElementById('fLastName').value.trim(),
    first_name:      document.getElementById('fFirstName').value.trim(),
    patronymic:      document.getElementById('fPatronymic').value.trim() || null,
    phone:           document.getElementById('fPhone').value.trim(),
    vk:              document.getElementById('fVk').value.trim()         || null,
    city:            document.getElementById('fCity').value.trim(),
    region:          document.getElementById('fRegion').value.trim(),
    code:            document.getElementById('fCode').value.trim(),
    form_education:  document.getElementById('fFormEdu').value,
    base_rating:     0,
    has_original:    document.getElementById('fOriginal').checked,
    submission_date: document.getElementById('fSubmissionDate').value || null,
    institution:     document.getElementById('fInstitution').value.trim(),
    benefit:         document.getElementById('fBenefit').value         || null,
    dormitory:       document.getElementById('fDormitory').checked,
    visit_date:      document.getElementById('fVisitDate').value       || null,
    info_source:     document.getElementById('fInfoSource').value      || null,
    notes:           document.getElementById('fNotes').value.trim()    || null,
    parent_name:     document.getElementById('fParentName').value.trim()  || null,
    parent_phone:    document.getElementById('fParentPhone').value.trim() || null,
    parent_relation: document.getElementById('fParentRelation').value,
  };
}

const btnSaveEl = document.getElementById('btnSave');
if (btnSaveEl) {
  btnSaveEl.addEventListener('click', async function () {
    if (!validateForm()) return;
    this.disabled = true;
    const spinner = this.querySelector('.spinner-border');
    const btnText = this.querySelector('.btn-text');
    spinner.style.display    = 'inline-block';
    btnText.style.visibility = 'hidden';
    try {
      let res, savedId;
      const payload = buildPayload();
      if (State.editingId) {
        res     = await api('PUT', `/api/applicants/${State.editingId}`, payload);
        savedId = State.editingId;
      } else {
        res = await api('POST', '/api/applicants', payload);
        if (res?.ok) { const d = await res.json(); savedId = d.id; }
      }
      if (!res?.ok) {
        const err = await res?.json().catch(() => ({}));
        showToast(err.detail || 'Ошибка сохранения', 'error');
        return;
      }
      if (savedId) {
        const exams = [...document.querySelectorAll('.exam-row')]
          .map(row => ({
            id_subject: parseInt(row.querySelector('.exam-subject').value) || 0,
            score:      parseFloat(row.querySelector('.exam-score').value) || 0,
          }))
          .filter(e => e.id_subject > 0);
        await api('PUT', `/api/applicants/${savedId}/exams`, { exams });
      }
      applicantModal?.hide();
      showToast(State.editingId ? 'Данные обновлены' : 'Абитуриент добавлен');
      State.selected = null;
      document.getElementById('btnEdit').disabled   = true;
      document.getElementById('btnDelete').disabled = true;
      await loadData();
    } finally {
      this.disabled            = false;
      spinner.style.display    = 'none';
      btnText.style.visibility = 'visible';
    }
  });
}

// ═══════════════════════════════════════════════════════
// УДАЛЕНИЕ
// ═══════════════════════════════════════════════════════
const deleteModalEl = document.getElementById('deleteModal');
const deleteModal   = deleteModalEl ? new bootstrap.Modal(deleteModalEl) : null;

const btnDeleteEl = document.getElementById('btnDelete');
if (btnDeleteEl) {
  btnDeleteEl.addEventListener('click', () => {
    if (!State.selected) return;
    const row  = State.filtered[State.selected.index];
    if (!row) return;
    const name = [row.last_name, row.first_name, row.patronymic].filter(Boolean).join(' ');
    document.getElementById('deleteConfirmText').textContent =
      `Вы уверены, что хотите удалить «${name}»? Это действие необратимо.`;
    deleteModal?.show();
  });
}

const btnConfirmDeleteEl = document.getElementById('btnConfirmDelete');
if (btnConfirmDeleteEl) {
  btnConfirmDeleteEl.addEventListener('click', async () => {
    if (!State.selected) return;
    const deletedId = State.selected.id;
    const res = await api('DELETE', `/api/applicants/${deletedId}`);
    deleteModal?.hide();
    if (!res?.ok) { showToast('Ошибка удаления', 'error'); return; }
    State.rows     = State.rows.filter(r => r.id !== deletedId);
    State.filtered = State.filtered.filter(r => r.id !== deletedId);
    State.selected = null;
    document.getElementById('btnEdit').disabled   = true;
    document.getElementById('btnDelete').disabled = true;
    renderTable();
    showToast('Абитуриент удалён');
  });
}

// ═══════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════
function buildExportData() {
  const headers = [
    '№','Фамилия','Имя','Отчество','Код','Форма','Рейтинг',
    'Льгота','Оригинал','Регион','Город','Общежитие','Учреждение',
    'Дата подачи','Дата посещения','Откуда узнал','Телефон','ВКонтакте',
    'Родитель','Тел. родителя','Примечание',
  ];
  const rows = State.filtered.map((r, idx) => [
    idx + 1, r.last_name, r.first_name, r.patronymic || '',
    r.code || '', r.form_education || '', (r.rating || 0).toFixed(1),
    r.benefit || '', r.has_original ? 'Да' : 'Нет',
    r.region || '', r.city || '', r.dormitory ? 'Да' : 'Нет',
    r.institution || '', r.submission_date || '', r.visit_date || '',
    r.info_source || '', r.phone || '', r.vk || '',
    r.parent_name || '', r.parent_phone || '', r.notes || '',
  ]);
  return { headers, rows };
}

function exportAsCSV() {
  const { headers, rows } = buildExportData();
  const lines = [
    headers.map(h => `"${h}"`).join(';'),
    ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `abiturients_${today()}.csv`);
  showToast('CSV файл скачан');
}

function exportAsXLSX() {
  const { headers, rows } = buildExportData();
  const colWidths = [5,16,14,18,10,12,9,20,9,20,16,10,30,13,15,20,17,20,22,17,25];

  function xmlEsc(v) {
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }
  function makeRow(cells, isHeader) {
    const style = isHeader ? ' s="1"' : '';
    return '<row>' + cells.map(v => {
      const val = xmlEsc(String(v ?? ''));
      if (!isHeader && v !== '' && !isNaN(+v) && v !== true && v !== false)
        return `<c t="n"${style}><v>${+v}</v></c>`;
      return `<c t="inlineStr"${style}><is><t>${val}</t></is></c>`;
    }).join('') + '</row>';
  }
  const sheetRows = [makeRow(headers, true), ...rows.map(r => makeRow(r, false))].join('');
  const colsXml   = colWidths.map((w, i) =>
    `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${colsXml}</cols><sheetData>${sheetRows}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts><font><b/><sz val="10"/><name val="Calibri"/></font><font><sz val="10"/><name val="Calibri"/></font></fonts>
<fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF3F51B5"/></patternFill></fill></fills>
<borders><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment horizontal="center"/></xf>
</cellXfs></styleSheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Абитуриенты" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  buildZip({
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': rootRels,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': rels,
    'xl/worksheets/sheet1.xml': sheet,
    'xl/styles.xml': styles,
  }).then(blob => {
    triggerDownload(blob, `abiturients_${today()}.xlsx`);
    showToast('Excel файл скачан');
  });
}

async function buildZip(files) {
  const enc = new TextEncoder();
  const parts = [], centralDir = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const dataBytes = enc.encode(content);
    let compressed = dataBytes, method = 0;
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const w  = cs.writable.getWriter();
        w.write(dataBytes); w.close();
        const chunks = [], r = cs.readable.getReader();
        while (true) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
        const total = chunks.reduce((s, c) => s + c.length, 0);
        compressed = new Uint8Array(total);
        let pos = 0;
        for (const c of chunks) { compressed.set(c, pos); pos += c.length; }
        method = 8;
      } catch { /**/ }
    }
    const crc = crc32(dataBytes), now = dosDateTime();
    const lfh = new Uint8Array(30 + nameBytes.length), lv = new DataView(lfh.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0,true);
    lv.setUint16(8,method,true);lv.setUint16(10,now.time,true);lv.setUint16(12,now.date,true);
    lv.setUint32(14,crc,true);lv.setUint32(18,compressed.length,true);
    lv.setUint32(22,dataBytes.length,true);lv.setUint16(26,nameBytes.length,true);
    lv.setUint16(28,0,true);lfh.set(nameBytes,30);
    parts.push(lfh, compressed);
    const cde = new Uint8Array(46 + nameBytes.length), cv = new DataView(cde.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
    cv.setUint16(8,0,true);cv.setUint16(10,method,true);cv.setUint16(12,now.time,true);
    cv.setUint16(14,now.date,true);cv.setUint32(16,crc,true);
    cv.setUint32(20,compressed.length,true);cv.setUint32(24,dataBytes.length,true);
    cv.setUint16(28,nameBytes.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);
    cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);
    cv.setUint32(42,offset,true);cde.set(nameBytes,46);centralDir.push(cde);
    offset += lfh.length + compressed.length;
  }
  const cdSize = centralDir.reduce((s,c) => s+c.length, 0);
  const eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);
  ev.setUint16(8,centralDir.length,true);ev.setUint16(10,centralDir.length,true);
  ev.setUint32(12,cdSize,true);ev.setUint32(16,offset,true);ev.setUint16(20,0,true);
  const allParts = [...parts,...centralDir,eocd];
  const total = allParts.reduce((s,p) => s+p.length, 0);
  const out = new Uint8Array(total); let pos = 0;
  for (const p of allParts) { out.set(p,pos); pos += p.length; }
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function dosDateTime() {
  const d = new Date();
  return {
    date: ((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),
    time: (d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),
  };
}
function triggerDownload(blob, filename) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
}
function today() { return new Date().toISOString().slice(0, 10); }

document.getElementById('btnExport').addEventListener('click', () => {
  if (State.role === 'viewer') return;
  new bootstrap.Modal(document.getElementById('exportFmtModal')).show();
});
document.getElementById('btnExportCSV').addEventListener('click', () => {
  if (State.role === 'viewer') return;
  bootstrap.Modal.getInstance(document.getElementById('exportFmtModal')).hide();
  exportAsCSV();
});
document.getElementById('btnExportXLSX').addEventListener('click', () => {
  if (State.role === 'viewer') return;
  bootstrap.Modal.getInstance(document.getElementById('exportFmtModal')).hide();
  exportAsXLSX();
});

// ═══════════════════════════════════════════════════════
// ИМПОРТ
// ═══════════════════════════════════════════════════════
const importModalEl     = document.getElementById('importModal');
const importModal       = importModalEl ? new bootstrap.Modal(importModalEl) : null;
const importDropzone    = document.getElementById('importDropzone');
const importDropInput   = document.getElementById('importDropInput');
const importFileInfo    = document.getElementById('importFileInfo');
const importFileName    = document.getElementById('importFileName');
const importFileClear   = document.getElementById('importFileClear');
const importProgress    = document.getElementById('importProgress');
const importProgressBar = document.getElementById('importProgressBar');
const importResult      = document.getElementById('importResult');
const btnConfirmImport  = document.getElementById('btnConfirmImport');

let importFile = null;
let importRows = [];

const btnImportEl = document.getElementById('btnImport');
if (btnImportEl) {
  btnImportEl.addEventListener('click', () => { resetImportModal(); importModal?.show(); });
}
document.getElementById('importFileInput')?.addEventListener('change', function () {
  if (this.files[0]) handleImportFile(this.files[0]);
  this.value = '';
});
if (importDropzone) {
  importDropzone.addEventListener('click', () => importDropInput?.click());
  importDropzone.addEventListener('dragover', e => { e.preventDefault(); importDropzone.classList.add('drag-over'); });
  importDropzone.addEventListener('dragleave', () => importDropzone.classList.remove('drag-over'));
  importDropzone.addEventListener('drop', e => {
    e.preventDefault(); importDropzone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) handleImportFile(f);
  });
}
importDropInput?.addEventListener('change', function () {
  if (this.files[0]) handleImportFile(this.files[0]);
  this.value = '';
});
importFileClear?.addEventListener('click', resetImportModal);

function resetImportModal() {
  importFile = null; importRows = [];
  if (importFileInfo)    importFileInfo.style.display  = 'none';
  if (importProgress)    importProgress.style.display  = 'none';
  if (importResult)      importResult.style.display    = 'none';
  if (importProgressBar) importProgressBar.style.width = '0%';
  if (importResult)      { importResult.className = 'import-result'; importResult.innerHTML = ''; }
  if (btnConfirmImport)  btnConfirmImport.disabled = true;
}

const COL_MAP = {
  'фамилия':'last_name','имя':'first_name','отчество':'patronymic','код':'code',
  'телефон':'phone','регион':'region','город':'city','учреждение':'institution',
  'учебное заведение':'institution','форма':'form_education','форма обучения':'form_education',
  'льгота':'benefit','оригинал':'has_original','общежитие':'dormitory',
  'дата подачи':'submission_date','дата посещения':'visit_date','откуда узнал':'info_source',
  'откуда узнал/а':'info_source','вконтакте':'vk','вк':'vk','родитель':'parent_name',
  'родитель (фио)':'parent_name','тел. родителя':'parent_phone','телефон родителя':'parent_phone',
  'примечание':'notes',
};
const REQUIRED_FIELDS = ['last_name','first_name','code','phone','region','city','institution'];

async function handleImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv','xlsx','xls'].includes(ext)) { showToast('Неподдерживаемый формат файла', 'error'); return; }
  importFile = file;
  if (importFileName)   importFileName.textContent   = file.name;
  if (importFileInfo)   importFileInfo.style.display = 'flex';
  if (importResult)     importResult.style.display   = 'none';
  if (btnConfirmImport) btnConfirmImport.disabled     = true;
  importRows = [];
  try {
    let raw = ext === 'csv' ? await parseCSV(file) : await parseXLSX(file);
    if (!raw || raw.length < 2) { showImportError('Файл пустой или содержит только заголовки.'); return; }
    const headers = raw[0].map(h => String(h || '').trim().toLowerCase());
    const fieldMap = {};
    headers.forEach((h, i) => { if (COL_MAP[h]) fieldMap[i] = COL_MAP[h]; });
    const presentFields = Object.values(fieldMap);
    const missing = REQUIRED_FIELDS.filter(f => !presentFields.includes(f));
    if (missing.length) {
      const names = missing.map(f => Object.keys(COL_MAP).find(k => COL_MAP[k] === f) || f);
      showImportError(`Отсутствуют обязательные колонки: ${names.join(', ')}`); return;
    }
    const errors = []; importRows = [];
    for (let i = 1; i < raw.length; i++) {
      const rowRaw = raw[i];
      if (rowRaw.every(c => !String(c || '').trim())) continue;
      const row = { form_education:'Очная', has_original:false, dormitory:false, base_rating:0, parent_relation:'Родитель' };
      Object.entries(fieldMap).forEach(([idx, field]) => {
        let val = String(rowRaw[idx] || '').trim();
        if (!val) return;
        if (field === 'has_original' || field === 'dormitory')
          row[field] = ['да','yes','1','true'].includes(val.toLowerCase());
        else if (field === 'submission_date' || field === 'visit_date')
          row[field] = parseImportDate(val);
        else row[field] = val;
      });
      const rowMissing = REQUIRED_FIELDS.filter(f => !row[f]);
      if (rowMissing.length) { errors.push(`Строка ${i+1}: отсутствуют поля — ${rowMissing.join(', ')}`); continue; }
      importRows.push(row);
    }
    if (importRows.length === 0) {
      showImportError('Не найдено валидных строк.' + (errors.length ? '<br>' + errors.slice(0,5).map(esc).join('<br>') : '')); return;
    }
    let msg = `<strong>Готово к импорту: ${importRows.length} записей</strong>`;
    if (errors.length) {
      msg += `<br><span style="color:#e65100;">Пропущено строк с ошибками: ${errors.length}</span>`;
      if (errors.length <= 5) msg += '<br>' + errors.map(esc).join('<br>');
    }
    showImportOk(msg);
    if (btnConfirmImport) btnConfirmImport.disabled = false;
  } catch (e) { showImportError('Ошибка чтения файла: ' + esc(e.message)); }
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        const firstLine = text.split('\n')[0];
        const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
        const rows = [], lines = text.replace(/\r/g,'').split('\n');
        for (const line of lines) { if (!line.trim()) continue; rows.push(parseCSVLine(line, delim)); }
        resolve(rows);
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file, 'UTF-8');
  });
}
function parseCSVLine(line, delim) {
  const result = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1]==='"') { cur+='"'; i++; } else inQ=!inQ; }
    else if (ch === delim && !inQ) { result.push(cur); cur=''; }
    else cur += ch;
  }
  result.push(cur); return result;
}
function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') { reject(new Error('Сохраните файл в CSV и попробуйте снова.')); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type:'array', cellDates:true });
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' }));
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsArrayBuffer(file);
  });
}
function parseImportDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0,10);
  const m1 = val.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  return null;
}

btnConfirmImport?.addEventListener('click', async () => {
  if (!importRows.length) return;
  btnConfirmImport.disabled = true;
  const spinner = btnConfirmImport.querySelector('.spinner-border');
  const btnText = btnConfirmImport.querySelector('.btn-text');
  spinner.style.display    = 'inline-block';
  btnText.style.visibility = 'hidden';
  if (importProgress) importProgress.style.display = 'block';
  if (importProgressBar) importProgressBar.style.width = '0%';
  if (importResult) importResult.style.display = 'none';
  let ok = 0, fail = 0; const failDetails = [];
  for (let i = 0; i < importRows.length; i++) {
    try {
      const res = await api('POST', '/api/applicants', importRows[i]);
      if (res?.ok) ok++; else {
        const err = await res?.json().catch(() => ({}));
        fail++; failDetails.push(`Строка ${i+2}: ${err.detail || 'ошибка сервера'}`);
      }
    } catch(e) { fail++; failDetails.push(`Строка ${i+2}: ${e.message}`); }
    if (importProgressBar) importProgressBar.style.width = `${Math.round(((i+1)/importRows.length)*100)}%`;
  }
  spinner.style.display    = 'none';
  btnText.style.visibility = 'visible';
  let msg = `<strong>Импорт завершён</strong><br>Добавлено: ${ok}`;
  if (fail) {
    msg += ` &nbsp;|&nbsp; Ошибок: ${fail}`;
    if (failDetails.length <= 5) msg += '<br><span style="font-size:12px;">' + failDetails.map(esc).join('<br>') + '</span>';
    showImportError(msg);
  } else { showImportOk(msg); }
  btnConfirmImport.disabled = false;
  if (ok > 0) await loadData();
});

function showImportOk(html) {
  if (!importResult) return;
  importResult.className = 'import-result ok';
  importResult.innerHTML = html;
  importResult.style.display = 'block';
}
function showImportError(html) {
  if (!importResult) return;
  importResult.className = 'import-result error';
  importResult.innerHTML = html;
  importResult.style.display = 'block';
  if (btnConfirmImport) btnConfirmImport.disabled = true;
}

// ═══════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if ([2,3,4].includes(m10) && ![12,13,14].includes(m100)) return `${n} ${few}`;
  return `${n} ${many}`;
}

// ═══════════════════════════════════════════════════════
// СТАРТ
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// ИСТОРИЯ ИЗМЕНЕНИЙ
// ═══════════════════════════════════════════════════════

const ACTION_LABEL = { create: '➕ Создание', update: '✏️ Изменение', delete: '🗑 Удаление' };
const ACTION_CLS   = { create: 'green', update: 'yellow', delete: 'red' };

function openHistory() {
  if (!State.selected) return;
  const overlay = document.getElementById('historyOverlay');
  const content = document.getElementById('historyContent');
  const fioEl   = document.getElementById('historyFio');
  overlay.style.display = 'flex';
  content.innerHTML = '<div class="rp-loading" style="padding:30px"><div class="rp-spinner"></div>Загрузка...</div>';

  fetch(`/api/audit/applicant/${State.selected.id}`, {
    headers: { 'Authorization': `Bearer ${State.token}` }
  })
  .then(r => r.json())
  .then(rows => {
    if (!rows.length) {
      content.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-style:italic">История изменений пуста</div>';
      return;
    }
    // Имя из первой записи
    if (fioEl) fioEl.textContent = '— ' + rows[0].applicant_fio;

    // Группируем по дате-пользователю-action (сессии редактирования)
    const html = rows.map(r => {
      const isUpdate = r.action === 'update';
      return `
        <div class="audit-row audit-${r.action}">
          <div class="audit-meta">
            <span class="rp-badge ${ACTION_CLS[r.action] || 'gray'}">${ACTION_LABEL[r.action] || r.action}</span>
            <span class="audit-user">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${r.changed_by} <span class="audit-role">${r.changed_by_role}</span>
            </span>
            <span class="audit-time">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${r.changed_at}
            </span>
          </div>
          ${isUpdate && r.field_name ? `
          <div class="audit-change">
            <span class="audit-field">${r.field_name}</span>
            <span class="audit-old">${r.old_value || '—'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5c6bc0" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            <span class="audit-new">${r.new_value || '—'}</span>
          </div>` : ''}
        </div>`;
    }).join('');
    content.innerHTML = html;
  })
  .catch(() => {
    content.innerHTML = '<div style="padding:24px;text-align:center;color:#e53935">Ошибка загрузки</div>';
  });
}

document.getElementById('btnHistory')?.addEventListener('click', openHistory);
document.getElementById('historyClose')?.addEventListener('click', () => {
  document.getElementById('historyOverlay').style.display = 'none';
});
document.getElementById('historyOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget)
    e.currentTarget.style.display = 'none';
});


initHeader();
loadRefs().then(() => loadData());

// Фолбэк логотипа — заменяет onerror (запрещён CSP)
const _logoImg = document.getElementById('logoImg');
if (_logoImg) {
  _logoImg.addEventListener('error', function () {
    this.style.display = 'none';
    this.parentElement.textContent = 'А';
  });
}