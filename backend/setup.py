#!/usr/bin/env python3
"""
setup.py — первоначальная настройка проекта
────────────────────────────────────────────
Запустите ОДИН РАЗ перед первым стартом сервера:

    python setup.py

Скрипт выполнит:
  1. Установку зависимостей (pip install -r requirements.txt)
  2. Создание файла .env если его нет
  3. Проверку подключения к MySQL
  4. Создание базы данных applicantdb если её нет
  5. Применение схемы из db/schema.sql
  6. Запрос данных для первого администратора
  7. Запуск сервера

После этого сервер будет доступен на http://localhost:8000
"""
import os
import sys
import subprocess
import getpass
import asyncio

# коды цветов ANSI для красивого вывода в терминале
G  = "\033[92m"   # зелёный
Y  = "\033[93m"   # жёлтый
R  = "\033[91m"   # красный
B  = "\033[94m"   # синий
W  = "\033[97m"   # белый жирный
RS = "\033[0m"    # сброс цвета

def ok(msg):   print(f"  {G}✓{RS}  {msg}")
def warn(msg): print(f"  {Y}⚠{RS}  {msg}")
def err(msg):  print(f"  {R}✗{RS}  {msg}")
def info(msg): print(f"  {B}→{RS}  {msg}")
def header(msg): print(f"\n{W}{msg}{RS}")


# Шаг 1: Установка зависимостей
def step_install():
    header("Шаг 1/5 — Установка зависимостей")
    if not os.path.exists("requirements.txt"):
        err("requirements.txt не найден. Запустите setup.py из папки backend/")
        sys.exit(1)

    info("Запуск: pip install -r requirements.txt ...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-q"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        err("Ошибка установки:")
        # показываем последние 1000 символов ошибки — обычно достаточно
        print(result.stderr[-1000:])
        sys.exit(1)
    ok("Все зависимости установлены")


# Шаг 2: Настройка .env
def step_env():
    header("Шаг 2/5 — Настройка подключения к базе данных")

    env_path = ".env"
    env_data = {}

    if os.path.exists(env_path):
        # читаем существующий .env в словарь
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    env_data[k.strip()] = v.strip()
        ok(f".env найден")
    else:
        warn(".env не найден — создаём новый")

    def ask(key, prompt, default="", secret=False):
        """спрашивает значение у пользователя, оставляя текущее при пустом вводе"""
        current = env_data.get(key, default)
        display = f" [{current if not secret else '****'}]" if current else ""
        if secret:
            val = getpass.getpass(f"    {prompt}{display}: ") or current
        else:
            val = input(f"    {prompt}{display}: ").strip() or current
        env_data[key] = val
        return val

    print()
    print("  Введите параметры подключения к MySQL")
    print("  (нажмите Enter чтобы оставить текущее значение)\n")

    ask("DB_HOST",     "Хост MySQL",       "localhost")
    ask("DB_PORT",     "Порт MySQL",       "3306")
    ask("DB_NAME",     "Имя базы данных",  "applicantdb")
    ask("DB_USER",     "Пользователь",     "root")
    ask("DB_PASSWORD", "Пароль",           "Korol2212!",  secret=True)

    print()
    print("  Данные первого администратора:")
    ask("ADMIN_USERNAME", "Логин администратора",  "admin")
    ask("ADMIN_FULLNAME", "ФИО администратора",    "Главный администратор")

    # проверяем сложность пароля: минимум 8 символов, буква и цифра
    while True:
        pwd = getpass.getpass("    Пароль администратора (мин. 8 символов, буква + цифра): ")
        if len(pwd) >= 8 and any(c.isalpha() for c in pwd) and any(c.isdigit() for c in pwd):
            env_data["ADMIN_PASSWORD"] = pwd
            break
        warn("Пароль слишком простой, попробуйте ещё раз")

    import secrets
    # генерируем SECRET_KEY если его нет или он дефолтный
    if not env_data.get("SECRET_KEY") or env_data.get("SECRET_KEY","").startswith("dev-"):
        env_data["SECRET_KEY"] = secrets.token_hex(32)
        ok("SECRET_KEY сгенерирован автоматически")
    env_data.setdefault("APP_ENV",              "development")
    env_data.setdefault("TOKEN_EXPIRE_MINUTES", "60")

    # записываем итоговый .env на диск
    lines = [
        "# Реестр абитуриентов — настройки (не коммитить в git!)\n",
        f"APP_ENV={env_data['APP_ENV']}\n",
        f"SECRET_KEY={env_data['SECRET_KEY']}\n",
        f"TOKEN_EXPIRE_MINUTES={env_data['TOKEN_EXPIRE_MINUTES']}\n",
        "\n# База данных\n",
        f"DB_HOST={env_data['DB_HOST']}\n",
        f"DB_PORT={env_data['DB_PORT']}\n",
        f"DB_NAME={env_data['DB_NAME']}\n",
        f"DB_USER={env_data['DB_USER']}\n",
        f"DB_PASSWORD={env_data['DB_PASSWORD']}\n",
        "\n# Первый администратор\n",
        f"ADMIN_USERNAME={env_data['ADMIN_USERNAME']}\n",
        f"ADMIN_PASSWORD={env_data['ADMIN_PASSWORD']}\n",
        f"ADMIN_FULLNAME={env_data['ADMIN_FULLNAME']}\n",
    ]
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    ok(f".env сохранён")
    return env_data


# Шаг 3+4: Проверка БД и применение схемы
async def step_database(env_data: dict):
    header("Шаг 3/5 — Подключение к MySQL и создание базы данных")

    host = env_data.get("DB_HOST", "localhost")
    port = int(env_data.get("DB_PORT", 3306))
    user = env_data.get("DB_USER", "root")
    pwd  = env_data.get("DB_PASSWORD", "Korol2212!")
    db   = env_data.get("DB_NAME", "applicantdb")

    try:
        import aiomysql
    except ImportError:
        err("aiomysql не установлен — запустите: pip install aiomysql")
        sys.exit(1)

    # подключаемся без указания базы — она может ещё не существовать
    info(f"Подключение к MySQL {user}@{host}:{port} ...")
    try:
        conn = await aiomysql.connect(
            host=host, port=port, user=user, password=pwd,
            charset="utf8mb4", autocommit=True,
        )
    except Exception as e:
        err(f"Не удалось подключиться к MySQL: {e}")
        err("Проверьте что MySQL запущен и параметры в .env верны")
        sys.exit(1)

    ok(f"Подключение к MySQL установлено")

    async with conn.cursor() as cur:
        # создаём базу если её нет, сразу с нужной кодировкой
        await cur.execute(
            f"CREATE DATABASE IF NOT EXISTS `{db}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        ok(f"База данных '{db}' готова")

        # ищем schema.sql сначала в ../db/, потом рядом со скриптом
        schema_path = os.path.join("..", "db", "schema.sql")
        if not os.path.exists(schema_path):
            schema_path = "schema.sql"

        if os.path.exists(schema_path):
            info(f"Применяем схему из {schema_path} ...")
            await cur.execute(f"USE `{db}`")
            with open(schema_path, "r", encoding="utf-8") as f:
                sql = f.read()

            # делим файл на отдельные SQL-выражения и выполняем по одному
            statements = [s.strip() for s in sql.split(";") if s.strip()]
            errors = 0
            for stmt in statements:
                try:
                    await cur.execute(stmt)
                except Exception as e:
                    # "already exists" — не ошибка, просто таблица уже есть
                    if "already exists" not in str(e).lower():
                        warn(f"SQL: {str(e)[:80]}")
                        errors += 1
            if errors == 0:
                ok(f"Схема применена ({len(statements)} statements)")
            else:
                warn(f"Схема применена с {errors} предупреждениями (вероятно таблицы уже существуют)")
        else:
            warn("schema.sql не найден — таблицы создадутся автоматически через SQLAlchemy")

    conn.close()


# Шаг 5: Запуск сервера
def step_run():
    header("Шаг 5/5 — Запуск сервера")
    print()
    ok("Настройка завершена!")
    print()
    info("Сервер запускается на http://localhost:8000")
    info("Для остановки нажмите Ctrl+C")
    print()

    # os.execv заменяет текущий процесс uvicorn-ом — PID не меняется
    os.execv(
        sys.executable,
        [sys.executable, "-m", "uvicorn", "main:app",
         "--reload", "--host", "0.0.0.0", "--port", "8000"]
    )


# Главная функция
async def main_async(env_data):
    await step_database(env_data)


def main():
    print()
    print(f"{W}{'═'*54}{RS}")
    print(f"{W}   Реестр абитуриентов — первоначальная настройка{RS}")
    print(f"{W}{'═'*54}{RS}")

    # скрипт должен запускаться из папки backend/ рядом с main.py
    if not os.path.exists("main.py"):
        err("Запустите setup.py из папки backend/")
        err(f"Текущая папка: {os.getcwd()}")
        sys.exit(1)

    step_install()
    env_data = step_env()

    header("Шаг 4/5 — Проверка и инициализация БД")
    asyncio.run(main_async(env_data))

    step_run()


if __name__ == "__main__":
    main()