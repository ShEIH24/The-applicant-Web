/* login.js */
'use strict';

const form      = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const errorBanner = document.getElementById('errorBanner');
const errorText   = document.getElementById('errorText');

// Показ/скрытие пароля
document.getElementById('eyeToggle').addEventListener('click', function () {
  const input = document.getElementById('password');
  const icon  = document.getElementById('eyeIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8
               a18.45 18.45 0 0 1 5.06-5.94
               M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8
               a18.5 18.5 0 0 1-2.16 3.19
               m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>`;
  } else {
    input.type = 'password';
    icon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>`;
  }
});

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.style.display = 'flex';
}
function hideError() {
  errorBanner.style.display = 'none';
}

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  hideError();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showError('Введите логин и пароль');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  try {
    const body = new URLSearchParams({ username, password });
    const res  = await fetch('/api/auth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showError(data.detail || 'Неверный логин или пароль');
      return;
    }

    // Пишем напрямую в localStorage — storage.js не подключён на странице логина.
    // AppStorage на dashboard/admin читает именно из localStorage как fallback.
    const expireAt = Date.now() + (60 * 60 * 1000); // 60 минут
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('user_role',    data.role);
    localStorage.setItem('user_name',    data.full_name || username);
    localStorage.setItem('token_expire', String(expireAt));

    // ── Редирект ──────────────────────────────────────────
    window.location.href = '/dashboard';

  } catch (err) {
    showError('Ошибка соединения с сервером');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
});

// Enter в поле логина — переход в поле пароля
document.getElementById('username').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('password').focus();
  }
});