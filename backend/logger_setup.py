"""
logger_setup.py — централизованная настройка логирования
─────────────────────────────────────────────────────────
Два канала:
  1. RotatingFileHandler → backend/logs/app.log  (все уровни INFO+)
  2. StreamHandler       → stdout (консоль uvicorn)

JSON-формат в файле, читаемый текст в консоли.
Ротация: 5 МБ × 5 файлов = до 25 МБ истории.
"""
import os
import logging
import logging.handlers
import json
from datetime import datetime, timezone


# ── Папка для логов ───────────────────────────────────────────────────────────
LOG_DIR  = os.path.join(os.path.dirname(__file__), "logs")
LOG_FILE = os.path.join(LOG_DIR, "app.log")
os.makedirs(LOG_DIR, exist_ok=True)  # создаём папку если её нет


# ── JSON-форматтер для файла ──────────────────────────────────────────────────
class JsonFormatter(logging.Formatter):
    """каждая строка лога — валидный JSON для удобного парсинга"""

    LEVEL_MAP = {
        logging.DEBUG:    "DEBUG",
        logging.INFO:     "INFO",
        logging.WARNING:  "WARNING",
        logging.ERROR:    "ERROR",
        logging.CRITICAL: "CRITICAL",
    }

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts":      datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
            "level":   self.LEVEL_MAP.get(record.levelno, record.levelname),
            "logger":  record.name,
            "msg":     record.getMessage(),
        }
        # дополнительные поля если переданы через extra= (user, action, ip...)
        for key in ("user", "action", "ip", "path", "status", "applicant_id"):
            val = getattr(record, key, None)
            if val is not None:
                entry[key] = val
        # добавляем трейсбек только при ошибках — чтобы не раздувать лог
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


# ── Читаемый форматтер для консоли ───────────────────────────────────────────
class ConsoleFormatter(logging.Formatter):
    # ANSI-коды для цветного вывода по уровню
    COLOURS = {
        "DEBUG":    "\033[36m",   # cyan
        "INFO":     "\033[32m",   # green
        "WARNING":  "\033[33m",   # yellow
        "ERROR":    "\033[31m",   # red
        "CRITICAL": "\033[35m",   # magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        colour = self.COLOURS.get(record.levelname, "")
        ts     = datetime.now().strftime("%H:%M:%S")
        level  = f"{colour}{record.levelname:<8}{self.RESET}"
        return f"{ts}  {level}  {record.name}  {record.getMessage()}"


def setup_logging(level: str = "INFO") -> logging.Logger:
    """
    Настраивает логирование и возвращает корневой логгер 'abiturient'.
    Вызывается один раз при старте приложения в main.py.
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    # ── файловый обработчик — JSON с ротацией ─────────────────────────────────
    file_handler = logging.handlers.RotatingFileHandler(
        LOG_FILE,
        maxBytes=5 * 1024 * 1024,  # 5 МБ на файл
        backupCount=5,              # хранить последние 5 файлов
        encoding="utf-8",
    )
    file_handler.setFormatter(JsonFormatter())
    file_handler.setLevel(log_level)

    # ── консольный обработчик — цветной текст ─────────────────────────────────
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(ConsoleFormatter())
    console_handler.setLevel(log_level)

    # ── корневой логгер приложения ────────────────────────────────────────────
    root = logging.getLogger("abiturient")
    root.setLevel(log_level)
    root.handlers.clear()  # сбрасываем обработчики при повторном вызове
    root.addHandler(file_handler)
    root.addHandler(console_handler)
    root.propagate = False  # не передаём записи в корневой логгер Python

    # заглушаем шумные библиотеки — их DEBUG/INFO нам не нужны
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "passlib"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    # uvicorn.error оставляем — там реальные ошибки сервера
    logging.getLogger("uvicorn.error").setLevel(logging.ERROR)

    return root


def get_logger(name: str) -> logging.Logger:
    """хелпер для дочерних модулей: get_logger(__name__)"""
    return logging.getLogger(f"abiturient.{name.split('.')[-1]}")