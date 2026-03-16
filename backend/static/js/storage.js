/* storage.js — единый доступ к токену между страницами приложения
 *
 * Стратегия: храним токен в localStorage (доступен между страницами),
 * при выходе — явно очищаем. Это единственный надёжный способ
 * передавать токен при навигации внутри одного сайта.
 *
 * Защита от утечки при закрытии браузера реализована через
 * token_expire: токен автоматически игнорируется по истечении 60 минут
 * даже если остался в localStorage.
 */
'use strict';

const AppStorage = (() => {
  function get(key) {
    return localStorage.getItem(key) || '';
  }

  function set(key, value) {
    localStorage.setItem(key, value);
  }

  function clear() {
    ['access_token', 'user_role', 'user_name', 'token_expire'].forEach(k => {
      localStorage.removeItem(k);
    });
  }

  // Проверяем истечение токена при загрузке модуля
  const expire = parseInt(localStorage.getItem('token_expire') || '0', 10);
  if (expire && Date.now() > expire) {
    clear();
  }

  return { get, set, clear };
})();