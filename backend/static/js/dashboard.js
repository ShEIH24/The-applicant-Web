/* dashboard.js — v2 */
'use strict';

// ═══════════════════════════════════════════════════════
// СОСТОЯНИЕ
// ═══════════════════════════════════════════════════════
const State = {
  token:    AppStorage.get('access_token'),
  role:     AppStorage.get('user_role') || 'viewer',
  userName: AppStorage.get('user_name'),
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

if (!State.token) { window.location.href = '/'; }

if (!State.token) { window.location.href = '/'; }

// ═══════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════
// универсальная обёртка над fetch: добавляет токен, обрабатывает 401 и сетевые ошибки
async function api(method, url, body) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${State.token}`,
      'Content-Type':  'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) { localStorage.clear(); window.location.href = '/'; return null; }
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

// показывает всплывающее уведомление (зелёное или красное) и скрывает его через 3.4 с
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
    ['btnAdd', 'btnEdit', 'btnDelete', 'btnImport', 'btnExport', 'btnHistory'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const table = document.getElementById('mainTable');
    if (table) table.classList.add('viewer-mode');
  }

  // ── Кнопка «История» — только для admin ──────────────────────────
  const histBtn = document.getElementById('btnHistory');
  if (histBtn) {
    if (State.role === 'admin') {
      histBtn.style.display = '';
      histBtn.disabled = true;

      histBtn.addEventListener('click', openHistory);

      const histClose = document.getElementById('historyClose');
      if (histClose) {
        histClose.addEventListener('click', () => {
          document.getElementById('historyOverlay').style.display = 'none';
        });
      }

      const histOverlay = document.getElementById('historyOverlay');
      if (histOverlay) {
        histOverlay.addEventListener('click', e => {
          if (e.target === e.currentTarget)
            e.currentTarget.style.display = 'none';
        });
      }

    } else {
      histBtn.style.display = 'none';
    }
  }

  // ── Кнопка «Журнал» — только для admin ───────────────────────────
  const logsBtn = document.getElementById('btnLogs');
  if (logsBtn) {
    logsBtn.style.display = State.role === 'admin' ? 'flex' : 'none';
  }

  // ── Кнопка «Аналитика» — для admin и editor ──────────────────────
  const reportsBtn = document.getElementById('btnReports');
  if (reportsBtn) {
    reportsBtn.style.display = ['admin', 'editor'].includes(State.role) ? 'flex' : 'none';
  }

  // ── Кнопка «Админ-панель» — только для admin ─────────────────────
  const adminBtn = document.getElementById('btnAdminPanel');
  if (adminBtn && State.role === 'admin') {
    adminBtn.style.display = 'flex';
  }
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  AppStorage.clear();
  window.location.href = '/';
});

// ═══════════════════════════════════════════════════════
// ЗАГРУЗКА ДАННЫХ С СЕРВЕРА
// ═══════════════════════════════════════════════════════
// загружает список абитуриентов с сервера (с учётом текущего поиска)
async function loadData() {
  showLoading(true);
  const q   = document.getElementById('searchInput').value.trim();
  const url = `/api/applicants${q ? `?search=${encodeURIComponent(q)}` : ''}`;
  const res = await api('GET', url);
  if (!res) return;
  if (!res.ok) { showToast('Ошибка загрузки данных', 'error'); showLoading(false); return; }
  State.rows     = await res.json();
  State.filtered = [...State.rows];
  renderTable();
  showLoading(false);
}

// переключает между спиннером загрузки и таблицей
function showLoading(yes) {
  document.getElementById('tableLoading').style.display = yes ? 'flex'  : 'none';
  document.getElementById('tableScroll').style.display  = yes ? 'none'  : '';
  if (yes) document.getElementById('tableEmpty').style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// РЕНДЕР ТАБЛИЦЫ
// ═══════════════════════════════════════════════════════
// перерисовывает таблицу из State.filtered; для viewer показывает только безопасные поля
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

  const isViewer = State.role === 'viewer';

  tbody.innerHTML = State.filtered.map((r, idx) => {
    if (isViewer) {
      return `
        <tr data-idx="${idx}" data-id="${r.id}"
            class="${State.selected?.id === r.id ? 'selected' : ''}">
          <td class="id-cell">${idx + 1}</td>
          <td>${esc(r.last_name)}</td>
          <td>${esc(r.first_name)}</td>
          <td>${esc(r.patronymic || '')}</td>
          <td class="rating-cell">${(r.rating || 0).toFixed(1)}</td>
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
    tr.addEventListener('click', () => selectRow(tr));
    if (State.role !== 'viewer') {
      tr.addEventListener('dblclick', () => { selectRow(tr); openEdit(); });
    }
  });
}

// выделяет строку таблицы и сохраняет выбранную запись в State.selected
function selectRow(tr) {
  State.selected = { id: +tr.dataset.id, index: +tr.dataset.idx };
  document.querySelectorAll('#tableBody tr').forEach(r => r.classList.remove('selected'));
  tr.classList.add('selected');
  document.getElementById('btnEdit').disabled   = false;
  document.getElementById('btnDelete').disabled = false;
  // кнопка «История» — только для admin и editor
  const hb = document.getElementById('btnHistory');
  if (hb && State.role === 'admin') hb.disabled = false;
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
    document.getElementById('btnEdit').disabled   = true;
    document.getElementById('btnDelete').disabled = true;
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
  document.getElementById('btnEdit').disabled   = true;
  document.getElementById('btnDelete').disabled = true;
  loadData();
});

// ═══════════════════════════════════════════════════════
// ТЕЛЕФОН — автоформатирование +7-XXX-XXX-XX-XX
// ═══════════════════════════════════════════════════════
// форматирует произвольный ввод в +7-XXX-XXX-XX-XX; 8 автоматически заменяется на 7
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

// вешает live-форматирование телефона на input; backspace над разделителем удаляет цифру
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
// загружает все справочники параллельно (льготы, регионы, источники, предметы)
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
    State.benefits.forEach(b =>
      sel.appendChild(new Option(`${b.name} (+${b.points} б.)`, b.name))
    );
  }

  if (regRes?.ok) {
    State.regions = await regRes.json();
    const dl = document.getElementById('regionList');
    State.regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.name;
      dl.appendChild(opt);
    });
  }

  if (srcRes?.ok) {
    const srcs = await srcRes.json();
    const sel  = document.getElementById('fInfoSource');
    srcs.forEach(s => sel.appendChild(new Option(s, s)));
  }

  if (subRes?.ok) State.subjects = await subRes.json();
}

// Обновление datalist городов при вводе региона
let cityLoadTimer;
document.getElementById('fRegion').addEventListener('input', function () {
  clearTimeout(cityLoadTimer);
  const regionName = this.value.trim();
  cityLoadTimer = setTimeout(() => refreshCityList(regionName), 350);
});

// обновляет datalist городов по выбранному региону
async function refreshCityList(regionName) {
  const dl = document.getElementById('cityList');
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
document.getElementById('fBenefit').addEventListener('change', function () {
  const found = State.benefits.find(b => b.name === this.value);
  const pts   = found ? found.points : 0;
  document.getElementById('bonusDisplay').textContent = `${pts} б.`;
  recalcTotal();
});

// пересчитывает итоговый рейтинг: бонус льготы + сумма баллов за экзамены
function recalcTotal() {
  const bonus   = parseInt(document.getElementById('bonusDisplay').textContent) || 0;
  const examSum = [...document.querySelectorAll('.exam-score')]
    .reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  document.getElementById('examSum').textContent     = `${examSum.toFixed(1)} б.`;
  document.getElementById('totalRating').textContent = (bonus + examSum).toFixed(1);
}

// ═══════════════════════════════════════════════════════
// ЭКЗАМЕНЫ
// ═══════════════════════════════════════════════════════
const MAX_EXAMS = 3;

// возвращает массив id предметов, уже добавленных в строки экзаменов
function getUsedSubjectIds() {
  return [...document.querySelectorAll('.exam-subject')]
    .map(s => +s.value).filter(Boolean);
}

// блокирует уже выбранные предметы в остальных строках экзаменов
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

// деактивирует кнопку «добавить экзамен» когда достигнут лимит
function updateAddExamBtn() {
  document.getElementById('btnAddExam').disabled =
    document.querySelectorAll('.exam-row').length >= MAX_EXAMS;
}

// создаёт DOM-строку экзамена (выбор предмета + балл + кнопка удаления)
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
  div.querySelector('.exam-score').addEventListener('input', function () {
    const val = parseFloat(this.value);
    if (this.value !== '' && (val < 0 || val > 100)) {
      this.classList.add('is-invalid');
      this.title = 'Балл должен быть от 0 до 100';
    } else {
      this.classList.remove('is-invalid');
      this.title = '';
    }
    recalcTotal();
  });
  div.querySelector('.btn-remove-exam').addEventListener('click', () => {
    div.remove(); refreshSubjectOptions(); recalcTotal(); updateAddExamBtn();
  });
  return div;
}

document.getElementById('btnAddExam').addEventListener('click', () => {
  if (document.querySelectorAll('.exam-row').length >= MAX_EXAMS) return;
  document.getElementById('examRows').appendChild(buildExamRow());
  updateAddExamBtn();
});

// очищает все строки экзаменов и сбрасывает счётчики баллов
function clearExams() {
  document.getElementById('examRows').innerHTML      = '';
  document.getElementById('examSum').textContent     = '0 б.';
  document.getElementById('totalRating').textContent = '0.0';
  updateAddExamBtn();
}

// ═══════════════════════════════════════════════════════
// МОДАЛЬНОЕ ОКНО — ФОРМА
// ═══════════════════════════════════════════════════════
const applicantModal = new bootstrap.Modal(document.getElementById('applicantModal'));

// сбрасывает все поля формы и снимает подсветку ошибок
function clearForm() {
  ['fLastName','fFirstName','fPatronymic','fCode','fPhone','fVk',
   'fInstitution','fParentName','fParentPhone','fNotes',
   'fRegion','fCity'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('fFormEdu').value        = 'Очная';
  document.getElementById('fBenefit').value        = '';
  document.getElementById('fInfoSource').value     = '';
  document.getElementById('fParentRelation').value = 'Родитель';
  document.getElementById('fSubmissionDate').value = '';
  document.getElementById('fVisitDate').value      = '';
  document.getElementById('fOriginal').checked     = false;
  document.getElementById('fDormitory').checked    = false;
  document.getElementById('bonusDisplay').textContent = '0 б.';
  document.getElementById('cityList').innerHTML    = '';
  document.querySelectorAll('.fc').forEach(el => el.classList.remove('is-invalid'));
  clearExams();
}

// открывает модалку в режиме добавления нового абитуриента
function openAdd() {
  State.editingId = null;
  clearForm();
  document.getElementById('modalTitle').textContent = 'ДОБАВЛЕНИЕ АБИТУРИЕНТА';
  applicantModal.show();
}

// открывает модалку в режиме редактирования, заполняя поля данными выбранной строки
async function openEdit() {
  if (!State.selected) return;
  const row = State.filtered[State.selected.index];
  if (!row) return;

  State.editingId = row.id;
  clearForm();
  document.getElementById('modalTitle').textContent = 'РЕДАКТИРОВАНИЕ АБИТУРИЕНТА';

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

  if (row.form_education)  document.getElementById('fFormEdu').value        = row.form_education;
  if (row.benefit)         document.getElementById('fBenefit').value         = row.benefit;
  if (row.info_source)     document.getElementById('fInfoSource').value      = row.info_source;
  if (row.parent_relation) document.getElementById('fParentRelation').value  = row.parent_relation;

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
  applicantModal.show();
}

document.getElementById('btnAdd').addEventListener('click', openAdd);
document.getElementById('btnEdit').addEventListener('click', openEdit);

// ═══════════════════════════════════════════════════════
// ВАЛИДАЦИЯ
// ═══════════════════════════════════════════════════════
const NAME_RE = /^[А-Яа-яЁёA-Za-z\-\s]+$/;

// Live: ФИО — только буквы, дефис, пробел
['fLastName','fFirstName','fPatronymic'].forEach(id => {
  document.getElementById(id).addEventListener('input', function () {
    const val     = this.value.trim();
    const invalid = val.length > 0 && !NAME_RE.test(val);
    this.classList.toggle('is-invalid', invalid);
    this.title = invalid ? 'Только буквы, дефис и пробел' : '';
  });
});

// Live: даты — не в будущем
['fSubmissionDate','fVisitDate'].forEach(id => {
  document.getElementById(id).addEventListener('change', function () {
    if (!this.value) { this.classList.remove('is-invalid'); this.title = ''; return; }
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const future = new Date(this.value) > today;
    this.classList.toggle('is-invalid', future);
    this.title = future ? 'Дата не может быть в будущем' : '';
  });
});

// проверяет обязательные поля, формат ФИО и даты; возвращает false и показывает ошибку
function validateForm() {
  let ok     = true;
  let errMsg = '';

  // Обязательные поля
  const required = {
    fLastName:    'Фамилия',
    fFirstName:   'Имя',
    fCode:        'Код специальности',
    fPhone:       'Телефон',
    fRegion:      'Регион',
    fCity:        'Город',
    fInstitution: 'Учебное заведение',
  };
  Object.entries(required).forEach(([id, label]) => {
    const el    = document.getElementById(id);
    const empty = !el.value.trim();
    el.classList.toggle('is-invalid', empty);
    if (empty && !errMsg) errMsg = `Поле «${label}» обязательно для заполнения`;
    if (empty) ok = false;
  });

  // ФИО — только буквы, дефис, пробел
  [['fLastName','Фамилия'],['fFirstName','Имя'],['fPatronymic','Отчество']].forEach(([id, label]) => {
    const el  = document.getElementById(id);
    const val = el.value.trim();
    if (val && !NAME_RE.test(val)) {
      el.classList.add('is-invalid');
      if (!errMsg) errMsg = `«${label}» — только буквы, дефис и пробел (без цифр и символов)`;
      ok = false;
    }
  });

  // Даты — не в будущем
  const today = new Date(); today.setHours(0, 0, 0, 0);
  [['fSubmissionDate','Дата подачи'],['fVisitDate','Дата посещения']].forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (el.value && new Date(el.value) > today) {
      el.classList.add('is-invalid');
      if (!errMsg) errMsg = `«${label}» не может быть в будущем`;
      ok = false;
    }
  });

  // Баллы за экзамены — от 0 до 100 включительно
  document.querySelectorAll('.exam-score').forEach((el, i) => {
    const val = parseFloat(el.value);
    if (el.value !== '' && (isNaN(val) || val < 0 || val > 100)) {
      el.classList.add('is-invalid');
      el.title = 'Балл должен быть от 0 до 100';
      if (!errMsg) errMsg = `Балл экзамена ${i + 1} должен быть от 0 до 100`;
      ok = false;
    }
  });
  if (!ok) showToast(errMsg, 'error');
  return ok;
}

// ═══════════════════════════════════════════════════════
// СОХРАНЕНИЕ
// ═══════════════════════════════════════════════════════
// собирает объект с данными формы для отправки на сервер
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

document.getElementById('btnSave').addEventListener('click', async function () {
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

    applicantModal.hide();
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

// ═══════════════════════════════════════════════════════
// УДАЛЕНИЕ — мгновенное обновление без перезагрузки
// ═══════════════════════════════════════════════════════
const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));

document.getElementById('btnDelete').addEventListener('click', () => {
  if (!State.selected) return;
  const row  = State.filtered[State.selected.index];
  if (!row) return;
  const name = [row.last_name, row.first_name, row.patronymic].filter(Boolean).join(' ');
  document.getElementById('deleteConfirmText').textContent =
    `Вы уверены, что хотите удалить «${name}»? Это действие необратимо.`;
  deleteModal.show();
});

document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
  if (!State.selected) return;

  const deletedId = State.selected.id;
  const res = await api('DELETE', `/api/applicants/${deletedId}`);
  deleteModal.hide();

  if (!res?.ok) {
    showToast('Ошибка удаления', 'error');
    return;
  }

  // Убираем запись из обоих массивов State — loadData() не нужен
  State.rows     = State.rows.filter(r => r.id !== deletedId);
  State.filtered = State.filtered.filter(r => r.id !== deletedId);
  State.selected = null;
  document.getElementById('btnEdit').disabled   = true;
  document.getElementById('btnDelete').disabled = true;

  renderTable();
  showToast('Абитуриент удалён');
});

// ═══════════════════════════════════════════════════════
// ЭКСПОРТ CSV
// ═══════════════════════════════════════════════════════
// ── Вспомогательная функция: формируем массив строк данных ──
// формирует заголовки и строки для экспорта из текущего отфильтрованного набора
function buildExportData() {
  const headers = [
    '№','Фамилия','Имя','Отчество','Код','Форма','Рейтинг',
    'Льгота','Оригинал','Регион','Город','Общежитие','Учреждение',
    'Дата подачи','Дата посещения','Откуда узнал','Телефон','ВКонтакте',
    'Родитель','Тел. родителя','Примечание',
  ];
  // idx + 1 — порядковый номер строки, как в таблице
  const rows = State.filtered.map((r, idx) => [
    idx + 1,
    r.last_name, r.first_name, r.patronymic || '',
    r.code || '', r.form_education || '', (r.rating || 0).toFixed(1),
    r.benefit || '', r.has_original ? 'Да' : 'Нет',
    r.region || '', r.city || '', r.dormitory ? 'Да' : 'Нет',
    r.institution || '', r.submission_date || '', r.visit_date || '',
    r.info_source || '', r.phone || '', r.vk || '',
    r.parent_name || '', r.parent_phone || '', r.notes || '',
  ]);
  return { headers, rows };
}

// экспортирует таблицу в CSV с BOM (для корректного открытия в Excel)
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

// экспортирует таблицу в XLSX без внешних библиотек — формирует SpreadsheetML и упаковывает в ZIP
function exportAsXLSX() {
  const { headers, rows } = buildExportData();

  // Нативная генерация SpreadsheetML (XLSX без внешних библиотек)
  const colWidths = [5,16,14,18,10,12,9,20,9,20,16,10,30,13,15,20,17,20,22,17,25];

  function xmlEsc(v) {
    return String(v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      .replace(/'/g,'&apos;');
  }

  function makeRow(cells, isHeader) {
    const style = isHeader ? ' s="1"' : '';
    return '<row>' + cells.map(v => {
      const val = xmlEsc(String(v ?? ''));
      // Числа пишем как числа, остальное как строки (inlineStr)
      if (!isHeader && v !== '' && !isNaN(+v) && v !== true && v !== false) {
        return `<c t="n"${style}><v>${+v}</v></c>`;
      }
      return `<c t="inlineStr"${style}><is><t>${val}</t></is></c>`;
    }).join('') + '</row>';
  }

  const sheetRows = [
    makeRow(headers, true),
    ...rows.map(r => makeRow(r, false)),
  ].join('');

  const colsXml = colWidths.map((w, i) =>
    `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`
  ).join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${colsXml}</cols>
<sheetData>${sheetRows}</sheetData>
</worksheet>`;

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
</cellXfs>
</styleSheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Абитуриенты" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

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

  // Упаковываем в ZIP через встроенный API
  buildZip({
    '[Content_Types].xml':         contentTypes,
    '_rels/.rels':                 rootRels,
    'xl/workbook.xml':             workbook,
    'xl/_rels/workbook.xml.rels':  rels,
    'xl/worksheets/sheet1.xml':    sheet,
    'xl/styles.xml':               styles,
  }).then(blob => {
    triggerDownload(blob, `abiturients_${today()}.xlsx`);
    showToast('Excel файл скачан');
  });
}

// Минималистичный ZIP-пакер (только Store + Deflate через CompressionStream)
// упаковывает объект {имя: содержимое} в ZIP-архив; использует deflate-raw если доступен
async function buildZip(files) {
  const enc  = new TextEncoder();
  const parts = [];
  const centralDir = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const dataBytes = enc.encode(content);

    // Сжимаем через CompressionStream если доступно, иначе Store
    let compressed = dataBytes;
    let method = 0; // Store
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const w  = cs.writable.getWriter();
        w.write(dataBytes); w.close();
        const chunks = [];
        const r = cs.readable.getReader();
        while (true) {
          const { done, value } = await r.read();
          if (done) break;
          chunks.push(value);
        }
        const total = chunks.reduce((s, c) => s + c.length, 0);
        compressed = new Uint8Array(total);
        let pos = 0;
        for (const c of chunks) { compressed.set(c, pos); pos += c.length; }
        method = 8; // Deflate
      } catch { /* fallback to store */ }
    }

    const crc   = crc32(dataBytes);
    const now   = dosDateTime();

    // Local file header
    const lfh = new Uint8Array(30 + nameBytes.length);
    const lv  = new DataView(lfh.buffer);
    lv.setUint32(0,  0x04034b50, true); // signature
    lv.setUint16(4,  20, true);          // version
    lv.setUint16(6,  0, true);           // flags
    lv.setUint16(8,  method, true);
    lv.setUint16(10, now.time, true);
    lv.setUint16(12, now.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lfh.set(nameBytes, 30);

    parts.push(lfh, compressed);

    // Central directory entry
    const cde = new Uint8Array(46 + nameBytes.length);
    const cv  = new DataView(cde.buffer);
    cv.setUint32(0,  0x02014b50, true);
    cv.setUint16(4,  20, true);
    cv.setUint16(6,  20, true);
    cv.setUint16(8,  0, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, now.time, true);
    cv.setUint16(14, now.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cde.set(nameBytes, 46);
    centralDir.push(cde);

    offset += lfh.length + compressed.length;
  }

  const cdSize   = centralDir.reduce((s, c) => s + c.length, 0);
  const eocd     = new Uint8Array(22);
  const ev       = new DataView(eocd.buffer);
  ev.setUint32(0,  0x06054b50, true);
  ev.setUint16(4,  0, true);
  ev.setUint16(6,  0, true);
  ev.setUint16(8,  centralDir.length, true);
  ev.setUint16(10, centralDir.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const allParts = [...parts, ...centralDir, eocd];
  const total = allParts.reduce((s, p) => s + p.length, 0);
  const out   = new Uint8Array(total);
  let pos = 0;
  for (const p of allParts) { out.set(p, pos); pos += p.length; }

  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

// вычисляет CRC-32 по таблице — требуется для заголовков ZIP
function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// кодирует текущее время в формат DOS (используется в заголовках ZIP)
function dosDateTime() {
  const d = new Date();
  return {
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

// инициирует скачивание файла через временный <a> с object URL
function triggerDownload(blob, filename) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename,
  });
  a.click();
}

// возвращает текущую дату в формате YYYY-MM-DD для имени файла
function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Кнопка экспорта — показывает выпадающее меню ────────
// Кнопка Экспорт — открывает модалку выбора формата
document.getElementById('btnExport').addEventListener('click', () => {
  new bootstrap.Modal(document.getElementById('exportFmtModal')).show();
});

document.getElementById('btnExportCSV').addEventListener('click', () => {
  bootstrap.Modal.getInstance(document.getElementById('exportFmtModal')).hide();
  exportAsCSV();
});

document.getElementById('btnExportXLSX').addEventListener('click', () => {
  bootstrap.Modal.getInstance(document.getElementById('exportFmtModal')).hide();
  exportAsXLSX();
});

// ═══════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════
// экранирует HTML-спецсимволы — защита от XSS при вставке данных в innerHTML
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// склоняет слово по числу согласно правилам русского языка
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

// метки и цвета для типов действий в истории
const ACTION_LABEL = { create: '➕ Создание', update: '✏️ Изменение', delete: '🗑 Удаление' };
const ACTION_CLS   = { create: 'green', update: 'yellow', delete: 'red' };

// открывает боковую панель истории изменений для выбранного абитуриента
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

    if (fioEl) fioEl.textContent = '— ' + rows[0].applicant_fio;

    // Группируем записи update по времени и пользователю в один блок
    const groups = [];
    rows.forEach(r => {
      if (r.action === 'update') {
        const key = `${r.changed_by}__${r.changed_at}`;
        const existing = groups.find(g => g._key === key);
        if (existing) {
          existing.changes.push(r);
          return;
        }
        groups.push({ _key: key, ...r, changes: [r] });
      } else {
        groups.push({ ...r, changes: [] });
      }
    });

    // Человекочитаемые названия полей
    const FIELD_LABELS = {
      last_name:       'Фамилия',
      first_name:      'Имя',
      patronymic:      'Отчество',
      phone:           'Телефон',
      vk:              'ВКонтакте',
      city:            'Город',
      region:          'Регион',
      code:            'Код специальности',
      form_education:  'Форма обучения',
      has_original:    'Оригинал документов',
      submission_date: 'Дата подачи',
      institution:     'Учебное заведение',
      benefit:         'Льгота',
      dormitory:       'Общежитие',
      visit_date:      'Дата посещения',
      info_source:     'Откуда узнал',
      notes:           'Примечание',
      parent_name:     'Родитель (ФИО)',
      parent_phone:    'Телефон родителя',
      parent_relation: 'Кем приходится',
      rating:          'Рейтинг',
    };

    const ACTION_ICON = {
      create: '✦',
      update: '✎',
      delete: '✕',
    };
    const ACTION_COLOR = {
      create: '#43a047',
      update: '#f9a825',
      delete: '#e53935',
    };
    const ACTION_TEXT = {
      create: 'Создание записи',
      update: 'Изменение',
      delete: 'Удаление записи',
    };

    const html = groups.map(g => {
      const color = ACTION_COLOR[g.action] || '#9e9e9e';
      const icon  = ACTION_ICON[g.action]  || '•';
      const label = ACTION_TEXT[g.action]  || g.action;

      // Блок изменённых полей (только для update)
      let changesHtml = '';
      if (g.action === 'update' && g.changes.length) {
        changesHtml = g.changes
          .filter(c => c.field_name)
          .map(c => {
            const fieldLabel = FIELD_LABELS[c.field_name] || c.field_name;
            const oldVal = c.old_value ?? '—';
            const newVal = c.new_value ?? '—';
            return `
              <div style="display:flex;align-items:baseline;gap:8px;
                          padding:5px 10px;background:#f8f9ff;
                          border-radius:6px;font-size:12px;flex-wrap:wrap;
                          margin-top:5px;">
                <span style="font-weight:700;color:#3949ab;min-width:140px;">
                  ${esc(fieldLabel)}
                </span>
                <span style="color:#e53935;background:#ffebee;padding:1px 7px;
                             border-radius:4px;text-decoration:line-through;">
                  ${esc(String(oldVal))}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke="#5c6bc0" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
                <span style="color:#2e7d32;background:#e8f5e9;padding:1px 7px;
                             border-radius:4px;font-weight:600;">
                  ${esc(String(newVal))}
                </span>
              </div>`;
          }).join('');

        // Если все изменения без field_name — показываем заглушку
        if (!changesHtml) {
          changesHtml = `<div style="padding:5px 10px;font-size:12px;color:#9ca3af;font-style:italic;">
            Детали изменения не записаны
          </div>`;
        }
      }

      return `
        <div style="border-left:3px solid ${color};padding:10px 14px;
                    border-radius:0 8px 8px 0;margin-bottom:10px;
                    background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:700;color:${color};">
              ${icon} ${esc(label)}
            </span>
            <span style="display:flex;align-items:center;gap:4px;
                         color:#6b7280;font-size:12px;font-weight:600;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              ${esc(g.changed_by || '—')}
              <span style="background:#e8eaf6;color:#3949ab;border-radius:4px;
                           padding:1px 5px;font-size:10px;font-weight:700;
                           text-transform:uppercase;">
                ${esc(g.changed_by_role || '')}
              </span>
            </span>
            <span style="display:flex;align-items:center;gap:4px;
                         color:#9ca3af;font-size:11px;margin-left:auto;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              ${esc(g.changed_at || '')}
            </span>
          </div>
          ${changesHtml}
        </div>`;
    }).join('');

    content.innerHTML = html || '<div style="padding:24px;text-align:center;color:#9ca3af;">Нет данных</div>';
  })
  .catch(() => {
    content.innerHTML = '<div style="padding:24px;text-align:center;color:#e53935">Ошибка загрузки</div>';
  });
}

// открывает панель полного журнала аудита (только admin)
function openLogsPanel() {
  const overlay = document.getElementById('logsOverlay');
  const content = document.getElementById('logsContent');
  overlay.style.display = 'flex';
  content.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">Загрузка...</div>';

  fetch('/api/audit/log?limit=300', {
    headers: { 'Authorization': `Bearer ${State.token}` }
  })
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(rows => {
    if (!rows.length) {
      content.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-style:italic">Журнал пуст</div>';
      return;
    }
    const html = rows.map(r => {
      const isUpdate = r.action === 'update';
      const cls   = ACTION_CLS[r.action]   || 'gray';
      const label = ACTION_LABEL[r.action] || r.action;
      return `
        <div class="audit-row audit-${r.action}" style="margin-bottom:10px;padding:10px 14px;
             border-radius:10px;background:var(--bg,#f4f6fb);">
          <div class="audit-meta">
            <span class="rp-badge ${cls}">${label}</span>
            <span class="audit-user" style="margin-left:10px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              ${esc(r.changed_by || '—')} <span class="audit-role">${esc(r.changed_by_role || '')}</span>
            </span>
            <span class="audit-time" style="margin-left:10px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              ${esc(r.changed_at || '')}
            </span>
            <span style="margin-left:10px;font-size:12px;color:var(--text-muted);">
              ${esc(r.applicant_fio || '')}
            </span>
          </div>
          ${isUpdate && r.field_name ? `
          <div class="audit-change" style="margin-top:6px;">
            <span class="audit-field">${esc(r.field_name)}</span>
            <span class="audit-old">${esc(r.old_value || '—')}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5c6bc0" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
            <span class="audit-new">${esc(r.new_value || '—')}</span>
          </div>` : ''}
        </div>`;
    }).join('');
    content.innerHTML = html;
  })
  .catch(err => {
    content.innerHTML = `<div style="padding:24px;text-align:center;color:#e53935;">Ошибка загрузки: ${esc(err.message)}</div>`;
  });
}

document.getElementById('logsClose')?.addEventListener('click', () => {
  document.getElementById('logsOverlay').style.display = 'none';
});
document.getElementById('logsOverlay')?.addEventListener('click', e => {
  // закрываем при клике на фон
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

initHeader();
loadRefs().then(() => loadData());

// ═══════════════════════════════════════════════════════
// ИМПОРТ CSV / XLSX
// ═══════════════════════════════════════════════════════

const importModal     = new bootstrap.Modal(document.getElementById('importModal'));
const importDropzone  = document.getElementById('importDropzone');
const importDropInput = document.getElementById('importDropInput');
const importFileInfo  = document.getElementById('importFileInfo');
const importFileName  = document.getElementById('importFileName');
const importFileClear = document.getElementById('importFileClear');
const importProgress  = document.getElementById('importProgress');
const importProgressBar = document.getElementById('importProgressBar');
const importResult    = document.getElementById('importResult');
const btnConfirmImport = document.getElementById('btnConfirmImport');

let importFile = null;    // выбранный файл
let importRows = [];      // распарсенные строки [{...}, ...]

// ── Открытие модалки ──────────────────────────────────
document.getElementById('btnImport').addEventListener('click', () => {
  resetImportModal();
  importModal.show();
});

document.getElementById('importFileInput').addEventListener('change', function () {
  if (this.files[0]) handleImportFile(this.files[0]);
  this.value = '';
});

// ── Drag & Drop ───────────────────────────────────────
importDropzone.addEventListener('click', () => importDropInput.click());
importDropInput.addEventListener('change', function () {
  if (this.files[0]) handleImportFile(this.files[0]);
  this.value = '';
});

importDropzone.addEventListener('dragover', e => {
  e.preventDefault(); importDropzone.classList.add('drag-over');
});
importDropzone.addEventListener('dragleave', () => importDropzone.classList.remove('drag-over'));
importDropzone.addEventListener('drop', e => {
  e.preventDefault(); importDropzone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleImportFile(f);
});

// ── Убрать файл ───────────────────────────────────────
importFileClear.addEventListener('click', resetImportModal);

// сбрасывает состояние модалки импорта к начальному виду
function resetImportModal() {
  importFile  = null;
  importRows  = [];
  importFileInfo.style.display  = 'none';
  importProgress.style.display  = 'none';
  importResult.style.display    = 'none';
  importProgressBar.style.width = '0%';
  importResult.className        = 'import-result';
  importResult.innerHTML        = '';
  btnConfirmImport.disabled     = true;
}

// ── Карта колонок: возможные заголовки → поле payload ─
const COL_MAP = {
  'фамилия':           'last_name',
  'имя':               'first_name',
  'отчество':          'patronymic',
  'код':               'code',
  'телефон':           'phone',
  'регион':            'region',
  'город':             'city',
  'учреждение':        'institution',
  'учебное заведение': 'institution',
  'форма':             'form_education',
  'форма обучения':    'form_education',
  'льгота':            'benefit',
  'оригинал':          'has_original',
  'общежитие':         'dormitory',
  'дата подачи':       'submission_date',
  'дата посещения':    'visit_date',
  'откуда узнал':      'info_source',
  'откуда узнал/а':    'info_source',
  'вконтакте':         'vk',
  'вк':                'vk',
  'родитель':          'parent_name',
  'родитель (фио)':    'parent_name',
  'тел. родителя':     'parent_phone',
  'телефон родителя':  'parent_phone',
  'примечание':        'notes',
};

const REQUIRED_FIELDS = ['last_name','first_name','code','phone','region','city','institution'];

// ── Обработка файла ───────────────────────────────────
// читает выбранный файл, парсит его и проверяет наличие обязательных колонок
async function handleImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv','xlsx','xls'].includes(ext)) {
    showToast('Неподдерживаемый формат файла', 'error');
    return;
  }

  importFile = file;
  importFileName.textContent   = file.name;
  importFileInfo.style.display = 'flex';
  importResult.style.display   = 'none';
  btnConfirmImport.disabled    = true;
  importRows = [];

  try {
    let raw;  // массив массивов (строки таблицы)

    if (ext === 'csv') {
      raw = await parseCSV(file);
    } else {
      raw = await parseXLSX(file);
    }

    if (!raw || raw.length < 2) {
      showImportError('Файл пустой или содержит только заголовки.');
      return;
    }

    // Определяем заголовки (первая строка)
    const headers = raw[0].map(h => String(h || '').trim().toLowerCase());
    const fieldMap = {};  // индекс колонки → имя поля
    headers.forEach((h, i) => {
      if (COL_MAP[h]) fieldMap[i] = COL_MAP[h];
    });

    // Проверяем обязательные поля
    const presentFields = Object.values(fieldMap);
    const missing = REQUIRED_FIELDS.filter(f => !presentFields.includes(f));
    if (missing.length) {
      const missingNames = missing.map(f =>
        Object.keys(COL_MAP).find(k => COL_MAP[k] === f) || f
      );
      showImportError(`Отсутствуют обязательные колонки: ${missingNames.join(', ')}`);
      return;
    }

    // Парсим строки данных
    const errors = [];
    importRows = [];
    for (let i = 1; i < raw.length; i++) {
      const rowRaw = raw[i];
      if (rowRaw.every(c => !String(c || '').trim())) continue; // пустая строка

      const row = {
        form_education:  'Очная',
        has_original:    false,
        dormitory:       false,
        base_rating:     0,
        parent_relation: 'Родитель',
      };

      Object.entries(fieldMap).forEach(([idx, field]) => {
        let val = String(rowRaw[idx] || '').trim();
        if (!val) return;

        if (field === 'has_original' || field === 'dormitory') {
          row[field] = ['да','yes','1','true'].includes(val.toLowerCase());
        } else if (field === 'submission_date' || field === 'visit_date') {
          row[field] = parseImportDate(val);
        } else {
          row[field] = val;
        }
      });

      // Проверяем обязательные поля строки
      const rowMissing = REQUIRED_FIELDS.filter(f => !row[f]);
      if (rowMissing.length) {
        errors.push(`Строка ${i + 1}: отсутствуют поля — ${rowMissing.join(', ')}`);
        continue;
      }

      importRows.push(row);
    }

    // Показываем превью
    if (importRows.length === 0) {
      showImportError('Не найдено валидных строк для импорта.' +
        (errors.length ? '<br>Ошибки:<br>' + errors.slice(0, 5).map(esc).join('<br>') : ''));
      return;
    }

    let msg = `<strong>Готово к импорту: ${importRows.length} записей</strong>`;
    if (errors.length) {
      msg += `<br><span style="color:#e65100;">Пропущено строк с ошибками: ${errors.length}</span>`;
      if (errors.length <= 5) msg += '<br>' + errors.map(esc).join('<br>');
    }
    showImportOk(msg);
    btnConfirmImport.disabled = false;

  } catch (e) {
    showImportError('Ошибка чтения файла: ' + esc(e.message));
  }
}

// ── Парсинг CSV ───────────────────────────────────────
// читает CSV-файл как текст; автоматически определяет разделитель (; или ,)
function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        // Определяем разделитель: ; или ,
        const firstLine = text.split('\n')[0];
        const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

        const rows = [];
        const lines = text.replace(/\r/g, '').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          rows.push(parseCSVLine(line, delim));
        }
        resolve(rows);
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file, 'UTF-8');
  });
}

// разбирает одну строку CSV с учётом кавычек и экранирования
function parseCSVLine(line, delim) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ── Парсинг XLSX / XLS ────────────────────────────────
// читает XLSX через библиотеку XLSX; если библиотека не загружена — сообщает об ошибке
function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    // Если библиотека XLSX не загружена — сообщаем пользователю
    if (typeof XLSX === 'undefined') {
      reject(new Error('Для импорта XLSX/XLS сохраните файл в формате CSV (UTF-8) и попробуйте снова.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        resolve(data);
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Парсинг даты ──────────────────────────────────────
// приводит дату из DD.MM.YYYY или YYYY-MM-DD к формату YYYY-MM-DD для API
function parseImportDate(val) {
  if (!val) return null;
  // XLSX может вернуть Date-объект как строку
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  // ДД.ММ.ГГГГ
  const m1 = val.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  // ГГГГ-ММ-ДД
  const m2 = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return val;
  return null;
}

// ── Запуск импорта ────────────────────────────────────
btnConfirmImport.addEventListener('click', async () => {
  if (!importRows.length) return;

  btnConfirmImport.disabled = true;
  const spinner = btnConfirmImport.querySelector('.spinner-border');
  const btnText = btnConfirmImport.querySelector('.btn-text');
  spinner.style.display    = 'inline-block';
  btnText.style.visibility = 'hidden';

  importProgress.style.display  = 'block';
  importProgressBar.style.width = '0%';
  importResult.style.display    = 'none';

  let ok = 0, fail = 0;
  const failDetails = [];

  for (let i = 0; i < importRows.length; i++) {
    const row = importRows[i];
    try {
      const res = await api('POST', '/api/applicants', row);
      if (res?.ok) {
        ok++;
      } else {
        const err = await res?.json().catch(() => ({}));
        fail++;
        failDetails.push(`Строка ${i + 2}: ${err.detail || 'ошибка сервера'}`);
      }
    } catch (e) {
      fail++;
      failDetails.push(`Строка ${i + 2}: ${e.message}`);
    }
    // обновляем прогресс-бар
    importProgressBar.style.width = `${Math.round(((i + 1) / importRows.length) * 100)}%`;
  }

  spinner.style.display    = 'none';
  btnText.style.visibility = 'visible';

  let msg = `<strong>Импорт завершён</strong><br>Добавлено: ${ok}`;
  if (fail) {
    msg += ` &nbsp;|&nbsp; Ошибок: ${fail}`;
    if (failDetails.length <= 5)
      msg += '<br><span style="font-size:12px;">' + failDetails.map(esc).join('<br>') + '</span>';
    showImportError(msg);
  } else {
    showImportOk(msg);
  }

  btnConfirmImport.disabled = false;
  if (ok > 0) await loadData();
});

// показывает зелёный блок с результатом импорта
function showImportOk(html) {
  importResult.className = 'import-result ok';
  importResult.innerHTML = html;
  importResult.style.display = 'block';
}
// показывает красный блок с ошибкой и блокирует кнопку импорта
function showImportError(html) {
  importResult.className = 'import-result error';
  importResult.innerHTML = html;
  importResult.style.display = 'block';
  btnConfirmImport.disabled  = true;
}