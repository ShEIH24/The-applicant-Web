/* admin.js — панель управления пользователями */
'use strict';

// ── Состояние ────────────────────────────────────────────
const State = {
  token:    AppStorage.get('access_token') || '',
  role:     AppStorage.get('user_role')    || '',
  userName: AppStorage.get('user_name')    || '',
  userId:   null,
  users:    [],
  editingId: null,
  deletingId: null,
  pwdTargetId: null,
};

if (!State.token) { window.location.href = '/'; }
if (State.role !== 'admin') { window.location.href = '/dashboard'; }

// ── API ──────────────────────────────────────────────────
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
  if (res.status === 401) { AppStorage.clear(); window.location.href = '/'; return null; }
  if (res.status === 403) { window.location.href = '/dashboard'; return null; }
  return res;
}

// ── Toast ────────────────────────────────────────────────
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

// ── Шапка ────────────────────────────────────────────────
function initHeader() {
  document.getElementById('userName').textContent = State.userName;
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  AppStorage.clear();
  window.location.href = '/';
});

// ── Загрузка пользователей ────────────────────────────────
async function loadUsers() {
  document.getElementById('usersLoading').style.display = 'flex';
  document.getElementById('usersGrid').style.display    = 'none';
  document.getElementById('usersEmpty').style.display   = 'none';

  // Получаем свой id из /api/auth/me напрямую (без редиректа при 401)
  try {
    const meRes = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${State.token}` }
    });
    if (meRes.ok) {
      const me = await meRes.json();
      State.userId = me.id;
    }
  } catch (_) { /* игнорируем — userId останется null */ }

  const res = await api('GET', '/api/admin/users');
  if (!res) return;
  if (!res.ok) {
    showToast('Ошибка загрузки пользователей', 'error');
    document.getElementById('usersLoading').style.display = 'none';
    return;
  }

  State.users = await res.json();
  document.getElementById('usersLoading').style.display = 'none';
  renderUsers();
}

// ── Рендер карточек ───────────────────────────────────────
function renderUsers() {
  const grid  = document.getElementById('usersGrid');
  const empty = document.getElementById('usersEmpty');

  // Статистика
  const counts = { admin: 0, editor: 0, viewer: 0 };
  State.users.forEach(u => { if (counts[u.role] !== undefined) counts[u.role]++; });
  document.getElementById('statTotal').textContent  = `Всего: ${State.users.length}`;
  document.getElementById('statAdmin').textContent  = `Админы: ${counts.admin}`;
  document.getElementById('statEditor').textContent = `Редакторы: ${counts.editor}`;
  document.getElementById('statViewer').textContent = `Читатели: ${counts.viewer}`;

  if (!State.users.length) {
    grid.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }

  grid.style.display  = 'grid';
  empty.style.display = 'none';

  const roleLabel = { admin: 'Администратор', editor: 'Редактор', viewer: 'Читатель' };
  const roleIcon  = {
    admin:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    editor: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    viewer: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  };

  grid.innerHTML = State.users.map(u => {
    const isSelf    = u.id === State.userId;
    const initial   = (u.full_name || u.username).charAt(0).toUpperCase();
    const statusCls = u.is_active ? 'active' : 'inactive';
    const statusLabel = u.is_active ? 'Активен' : 'Неактивен';
    const toggleCls   = u.is_active ? 'active' : 'inactive';
    const toggleLabel = u.is_active ? 'Деактивировать' : 'Активировать';
    const toggleIcon  = u.is_active
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`
      : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;

    return `
    <div class="user-card ${u.is_active ? '' : 'inactive'}" data-role="${u.role}" data-id="${u.id}">
      <div class="user-card-top">
        <div class="user-avatar" data-role="${u.role}">${initial}</div>
        <div class="user-info">
          <div class="user-fullname">
            ${esc(u.full_name || '—')}
            ${isSelf ? '<span class="badge-self">Вы</span>' : ''}
            ${!u.is_active ? '<span class="badge-inactive">Неактивен</span>' : ''}
          </div>
          <div class="user-login">@${esc(u.username)}</div>
        </div>
        <span class="user-role-badge ${u.role}">${roleIcon[u.role] || ''} ${roleLabel[u.role] || u.role}</span>
      </div>
      <div class="user-card-actions">
        <button class="uca-btn" data-action="edit" data-id="${u.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Изменить
        </button>
        <button class="uca-btn" data-action="pwd" data-id="${u.id}" data-name="${esc(u.full_name || u.username)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Пароль
        </button>
        ${!isSelf ? `
        <button class="uca-btn uca-btn-toggle ${toggleCls}" data-action="toggle" data-id="${u.id}" data-activate="${!u.is_active}">
          ${toggleIcon}
          ${toggleLabel}
        </button>
        ` : ''}
        <span class="uca-spacer"></span>
        ${!isSelf ? `
        <button class="uca-btn uca-btn-danger" data-action="delete" data-id="${u.id}" data-name="${esc(u.full_name || u.username)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Удалить
        </button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Делегирование событий для карточек пользователей ─────
// Заменяет inline onclick (запрещены CSP)
document.getElementById('usersGrid').addEventListener('click', function (e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action   = btn.dataset.action;
  const id       = parseInt(btn.dataset.id, 10);
  const name     = btn.dataset.name || '';
  const activate = btn.dataset.activate === 'true';

  if (action === 'edit')   openEditUser(id);
  if (action === 'pwd')    openChangePwd(id, name);
  if (action === 'toggle') toggleActive(id, activate);
  if (action === 'delete') openDeleteUser(id, name);
});

// ── Модальное окно: добавление / редактирование ──────────
const userModal = new bootstrap.Modal(document.getElementById('userModal'));

function clearUserForm() {
  document.getElementById('fUsername').value  = '';
  document.getElementById('fFullName').value  = '';
  document.getElementById('fPassword').value  = '';
  document.getElementById('fRole').value      = '';
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.fc').forEach(el => el.classList.remove('is-invalid'));
}

document.getElementById('btnAddUser').addEventListener('click', () => {
  State.editingId = null;
  clearUserForm();
  document.getElementById('userModalTitle').textContent = 'НОВЫЙ ПОЛЬЗОВАТЕЛЬ';
  document.getElementById('fUsername').disabled = false;
  document.getElementById('passwordLabel').innerHTML = 'Пароль <span class="req">*</span>';
  document.getElementById('passwordHint').textContent = 'Для нового пользователя обязательно';
  document.getElementById('fPassword').placeholder = 'Мин. 8 символов: буква + цифра';
  userModal.show();
});

function openEditUser(id) {
  const u = State.users.find(u => u.id === id);
  if (!u) return;
  State.editingId = id;
  clearUserForm();

  document.getElementById('userModalTitle').textContent = 'РЕДАКТИРОВАНИЕ';
  document.getElementById('fUsername').value  = u.username;
  document.getElementById('fUsername').disabled = true;  // логин не меняем
  document.getElementById('fFullName').value  = u.full_name || '';
  document.getElementById('fRole').value      = u.role;
  document.querySelector(`.role-btn[data-role="${u.role}"]`)?.classList.add('selected');
  document.getElementById('passwordLabel').innerHTML = 'Новый пароль';
  document.getElementById('passwordHint').textContent = 'Оставьте пустым, чтобы не менять';
  document.getElementById('fPassword').placeholder = 'Оставьте пустым — без изменений';
  userModal.show();
}

// Выбор роли
document.querySelectorAll('.role-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
    this.classList.add('selected');
    document.getElementById('fRole').value = this.dataset.role;
  });
});

// Сохранение
document.getElementById('btnSaveUser').addEventListener('click', async function () {
  const username = document.getElementById('fUsername').value.trim();
  const fullName = document.getElementById('fFullName').value.trim();
  const role     = document.getElementById('fRole').value;
  const password = document.getElementById('fPassword').value;

  // Валидация
  let ok = true;

  const usernameEl = document.getElementById('fUsername');
  if (!State.editingId && !username) {
    usernameEl.classList.add('is-invalid');
    ok = false;
  } else {
    usernameEl.classList.remove('is-invalid');
  }

  if (!role) {
    showToast('Выберите роль пользователя', 'error');
    ok = false;
  }

  if (!State.editingId && !password) {
    document.getElementById('fPassword').classList.add('is-invalid');
    showToast('Введите пароль для нового пользователя', 'error');
    ok = false;
  } else if (password && (password.length < 8 || !/[a-zA-Zа-яА-ЯёЁ]/.test(password) || !/\d/.test(password))) {
    document.getElementById('fPassword').classList.add('is-invalid');
    showToast('Пароль: минимум 8 символов, хотя бы одна буква и одна цифра', 'error');
    ok = false;
  } else {
    document.getElementById('fPassword').classList.remove('is-invalid');
  }

  if (!ok) return;

  this.disabled = true;
  const spinner = this.querySelector('.spinner-border');
  const btnText = this.querySelector('.btn-text');
  spinner.style.display    = 'inline-block';
  btnText.style.visibility = 'hidden';

  try {
    let res;
    if (State.editingId) {
      const body = { role, full_name: fullName || null };
      if (password) body.password = password;
      res = await api('PATCH', `/api/admin/users/${State.editingId}`, body);
    } else {
      res = await api('POST', '/api/admin/users', {
        username, full_name: fullName || null, role, password,
      });
    }

    if (!res?.ok) {
      const err = await res?.json().catch(() => ({}));
      const msg = Array.isArray(err.detail)
        ? err.detail.map(e => e.msg).join('; ')
        : (err.detail || 'Ошибка сохранения');
      showToast(msg, 'error');
      return;
    }

    userModal.hide();
    showToast(State.editingId ? 'Данные пользователя обновлены' : 'Пользователь создан');
    await loadUsers();

  } finally {
    this.disabled            = false;
    spinner.style.display    = 'none';
    btnText.style.visibility = 'visible';
  }
});

// ── Смена пароля ─────────────────────────────────────────
const pwdModal = new bootstrap.Modal(document.getElementById('pwdModal'));

function openChangePwd(id, name) {
  State.pwdTargetId = id;
  document.getElementById('pwdTargetName').textContent = name;
  document.getElementById('fNewPwd').value = '';
  document.getElementById('fNewPwd').classList.remove('is-invalid');
  pwdModal.show();
}

document.getElementById('btnSavePwd').addEventListener('click', async function () {
  const pwd = document.getElementById('fNewPwd').value;
  if (!pwd || pwd.length < 8 || !/[a-zA-Zа-яА-ЯёЁ]/.test(pwd) || !/\d/.test(pwd)) {
    document.getElementById('fNewPwd').classList.add('is-invalid');
    showToast('Пароль: минимум 8 символов, хотя бы одна буква и одна цифра', 'error');
    return;
  }
  document.getElementById('fNewPwd').classList.remove('is-invalid');

  this.disabled = true;
  const spinner = this.querySelector('.spinner-border');
  const btnText = this.querySelector('.btn-text');
  spinner.style.display    = 'inline-block';
  btnText.style.visibility = 'hidden';

  try {
    const res = await api('PATCH', `/api/admin/users/${State.pwdTargetId}`, { password: pwd });
    if (!res?.ok) {
      const err = await res?.json().catch(() => ({}));
      showToast(err.detail || 'Ошибка', 'error');
      return;
    }
    pwdModal.hide();
    showToast('Пароль изменён');
  } finally {
    this.disabled            = false;
    spinner.style.display    = 'none';
    btnText.style.visibility = 'visible';
  }
});

// ── Активация / деактивация ───────────────────────────────
async function toggleActive(id, activate) {
  const res = await api('PATCH', `/api/admin/users/${id}`, { is_active: activate });
  if (!res?.ok) {
    const err = await res?.json().catch(() => ({}));
    const errMsg = Array.isArray(err.detail)
      ? err.detail.map(e => e.msg).join('; ')
      : (err.detail || 'Ошибка');
    showToast(errMsg, 'error');
    return;
  }
  showToast(activate ? 'Пользователь активирован' : 'Пользователь деактивирован');
  await loadUsers();
}

// ── Удаление ──────────────────────────────────────────────
const delModal = new bootstrap.Modal(document.getElementById('delUserModal'));

function openDeleteUser(id, name) {
  State.deletingId = id;
  document.getElementById('delUserText').textContent =
    `Удалить пользователя «${name}»? Это действие необратимо.`;
  delModal.show();
}

document.getElementById('btnConfirmDelUser').addEventListener('click', async () => {
  if (!State.deletingId) return;
  const res = await api('DELETE', `/api/admin/users/${State.deletingId}`);
  delModal.hide();
  if (!res?.ok) {
    const err = await res?.json().catch(() => ({}));
    showToast(err.detail || 'Ошибка удаления', 'error');
    return;
  }
  showToast('Пользователь удалён');
  State.deletingId = null;
  await loadUsers();
});

// ── Показ/скрытие пароля ──────────────────────────────────
function setupEyeToggle(btnId, inputId, iconId) {
  document.getElementById(btnId).addEventListener('click', function () {
    const input = document.getElementById(inputId);
    const icon  = document.getElementById(iconId);
    if (input.type === 'password') {
      input.type = 'text';
      icon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
    } else {
      input.type = 'password';
      icon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    }
  });
}

setupEyeToggle('passEye', 'fPassword', 'passEyeIcon');
setupEyeToggle('pwdEye',  'fNewPwd',   'pwdEyeIcon');

// ── Обновление ────────────────────────────────────────────
document.getElementById('btnRefreshUsers').addEventListener('click', loadUsers);

// ── Утилиты ───────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Старт ─────────────────────────────────────────────────
initHeader();
loadUsers();

// Фолбэк логотипа — заменяет onerror (запрещён CSP)
const _logoImg = document.getElementById('logoImg');
if (_logoImg) {
  _logoImg.addEventListener('error', function () {
    this.style.display = 'none';
    this.parentElement.textContent = 'А';
  });
}