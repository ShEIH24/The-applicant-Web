<div align="center">

# 🎓 Реестр абитуриентов

**Веб-приложение для ведения реестра абитуриентов учебного заведения**

[![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?logo=bootstrap&logoColor=white)](https://getbootstrap.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## 📋 О проекте

Полноценная веб-система для приёмной комиссии. Позволяет вести реестр абитуриентов, строить аналитику по набору, прогнозировать проходной балл и отслеживать историю изменений с полным аудитом действий пользователей.

---

## 🛠️ Стек технологий

| Слой | Технологии |
|------|-----------|
| **Backend** | Python 3.11, FastAPI 0.115, SQLAlchemy 2.0 (async), aiomysql |
| **Frontend** | Vanilla JS, Bootstrap 5.3, Chart.js 4.4 |
| **База данных** | MySQL 8.0 |
| **Аутентификация** | JWT (python-jose), bcrypt (passlib) |
| **Логирование** | Python logging, JSON-формат, ротация файлов |
| **Развёртывание** | Docker, Docker Compose |

---

## ✨ Возможности

### 📂 Реестр абитуриентов
- Полный CRUD — добавление, редактирование, удаление записей
- Поиск по ФИО, коду специальности, городу
- Импорт из CSV/Excel, экспорт в CSV/Excel
- Результаты ЕГЭ с автоматическим пересчётом рейтинга (триггеры MySQL)
- Льготы с бонусными баллами

### 👥 Роли пользователей

| Роль | Возможности |
|------|-------------|
| 🔴 `admin` | Полный доступ, управление пользователями, просмотр логов |
| 🟡 `editor` | Создание, редактирование, удаление записей, аналитика |
| 🟢 `viewer` | Только просмотр (контактные данные скрыты) |

### 📊 Аналитика и отчёты (`/reports`)
- **Анализ проходного балла** — расстановка статусов по введённому порогу и числу мест
- **Диаграммы** — по источникам информации, городам, регионам, льготам, распределению баллов
- **Статистика** — таблицы по городам, источникам информации, общая сводка
- **Прогнозирование** — прогноз проходного балла, потребность в общежитии, эффективность источников (взвешенный скор), географический анализ

### 📋 Журнал системы (`/logs`)
- Системные логи из файла `backend/logs/app.log` с фильтрами по уровню и тексту
- История действий пользователей из БД — кто, когда, что изменил (поле, старое → новое значение)

### 🔒 Безопасность
- Rate limiting — 300 запросов/мин, защита от брутфорса на `/api/auth/token`
- JWT токены с настраиваемым временем жизни
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options)
- Ролевая модель доступа на уровне API

---

## 📁 Структура проекта

```
The-applicant-Web/
├── 📂 backend/
│   ├── 📂 routers/
│   │   ├── auth.py          # JWT аутентификация, страницы
│   │   ├── applicants.py    # CRUD абитуриентов
│   │   ├── admin.py         # Управление пользователями
│   │   ├── reports.py       # API аналитики
│   │   └── audit.py         # История изменений, логи
│   ├── 📂 templates/        # HTML страницы (Jinja2)
│   ├── 📂 static/
│   │   ├── css/             # Стили (dashboard, reports, logs, mobile)
│   │   └── js/              # Логика фронтенда
│   ├── main.py              # Точка входа FastAPI
│   ├── database.py          # Подключение к БД
│   ├── models.py            # SQLAlchemy модели
│   ├── logger_setup.py      # Настройка логирования
│   ├── Dockerfile
│   └── requirements.txt
├── 📂 db/
│   └── schema.sql           # Схема БД (таблицы + триггеры + справочники)
├── docker-compose.yml
├── .env.example             # Шаблон переменных окружения
└── README.md
```

---

## 🚀 Быстрый старт

### Вариант 1 — Docker (рекомендуется)

**Требования:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/ShEIH24/The-applicant-Web.git
cd The-applicant-Web

# 2. Создать файл переменных окружения
copy .env.example .env.docker    # Windows
# cp .env.example .env.docker    # Linux / Mac

# 3. Заполнить .env.docker (SECRET_KEY, DB_PASSWORD, ADMIN_PASSWORD)

# 4. Запустить
docker compose up --build
```

✅ Приложение будет доступно по адресу **http://localhost:8000**

> При первом запуске автоматически создаётся администратор с данными из `.env.docker`

```bash
docker compose down        # остановить (данные сохраняются)
docker compose down -v     # остановить и удалить данные БД
```

---

### Вариант 2 — локальный запуск

**Требования:** Python 3.11+, MySQL 8.0

```bash
cd backend

# Установить зависимости
pip install -r requirements.txt

# Создать и заполнить .env (скопировать из .env.example)

# Применить схему БД
mysql -u root -p applicantdb < ../db/schema.sql

# Запустить сервер
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## ⚙️ Переменные окружения

| Переменная | Описание | Пример |
|-----------|---------|--------|
| `SECRET_KEY` | Ключ подписи JWT, мин. 32 символа | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DB_NAME` | Имя базы данных | `applicantdb` |
| `DB_USER` | Пользователь БД | `abiturient` |
| `DB_PASSWORD` | Пароль БД | — |
| `ADMIN_USERNAME` | Логин первого администратора | `admin` |
| `ADMIN_PASSWORD` | Пароль администратора | — |
| `ADMIN_FULLNAME` | Полное имя администратора | `Администратор` |
| `TOKEN_EXPIRE_MINUTES` | Время жизни JWT токена | `60` |
| `LOG_LEVEL` | Уровень логирования | `INFO` |

> ⚠️ Никогда не коммить `.env` и `.env.docker` в репозиторий — они содержат пароли

---

## 📝 Логирование

Логи пишутся в двух местах одновременно:

- **`backend/logs/app.log`** — системные логи в формате JSON, ротация 5 МБ × 5 файлов
- **Таблица `Audit_log`** в MySQL — история бизнес-операций (создание / изменение / удаление записей с указанием поля, старого и нового значения)

Просмотр в интерфейсе доступен администратору на странице `/logs`

---

## 🗄️ База данных

Схема включает **13 таблиц**, **5 триггеров** и начальные данные справочников:

```
Region → City → Applicant → Application
                          → Applicant_benefit → Benefit
                          → Additional_info   → Information_source
                          → Exam              → Subject
                          → Parent
User
Audit_log
```

Триггеры автоматически пересчитывают рейтинг абитуриента при изменении баллов ЕГЭ или льгот.

---

<div align="center">

Сделано с ❤️. 2026

</div>
