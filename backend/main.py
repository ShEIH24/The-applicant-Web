"""
main.py — точка входа FastAPI-приложения
─────────────────────────────────────────
Запуск:
    python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

Настройки берутся из файла .env (положить рядом с main.py).
При первом запуске автоматически создаётся администратор
из переменных ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_FULLNAME.
"""
import os
import sys
import asyncio
import logging
from contextlib import asynccontextmanager
from logger_setup import setup_logging, get_logger

# load_dotenv должен быть вызван ДО любых импортов модулей, читающих os.getenv
from dotenv import load_dotenv
load_dotenv(encoding="utf-8")

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError

from database import engine, Base, AsyncSessionLocal
from models import User
from routers import auth, applicants, admin, reports, audit

# ── Логирование ───────────────────────────────────────────────────────────────
_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
logger = setup_logging(_LOG_LEVEL)

# ── Проверка SECRET_KEY ───────────────────────────────────────────────────────
_IS_PRODUCTION = os.getenv("APP_ENV", "development") == "production"
_SECRET = os.getenv("SECRET_KEY", "")

# в production дефолтный ключ недопустим — завершаем сразу
if not _SECRET or _SECRET == "CHANGE_ME_IN_PRODUCTION_32chars!!":
    if _IS_PRODUCTION:
        logger.critical("SECRET_KEY не задан. Установите его в .env и перезапустите сервер.")
        sys.exit(1)
    else:
        logger.warning("⚠️  Используется дефолтный SECRET_KEY — только для разработки!")

# ── Rate Limiter ──────────────────────────────────────────────────────────────
# глобально 300 запросов в минуту с одного IP
limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])

# ── Параметры ожидания БД ─────────────────────────────────────────────────────
_DB_RETRY_ATTEMPTS = int(os.getenv("DB_RETRY_ATTEMPTS", "20"))
_DB_RETRY_DELAY    = float(os.getenv("DB_RETRY_DELAY",  "3"))   # секунд между попытками


async def _wait_for_db() -> None:
    """
    Ждёт готовности MySQL перед стартом приложения.
    Нужно при запуске через Docker Compose — MySQL при первом старте
    перезапускается дважды (инициализация схемы), поэтому healthcheck
    может дать false-positive раньше времени.
    """
    for attempt in range(1, _DB_RETRY_ATTEMPTS + 1):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            logger.info("✓ БД готова (попытка %d/%d)", attempt, _DB_RETRY_ATTEMPTS)
            return
        except OperationalError as exc:
            logger.warning(
                "БД недоступна (попытка %d/%d): %s — повтор через %.0f с...",
                attempt, _DB_RETRY_ATTEMPTS, exc.orig, _DB_RETRY_DELAY,
            )
            await asyncio.sleep(_DB_RETRY_DELAY)

    # если за все попытки БД не поднялась — нет смысла стартовать
    logger.critical("БД так и не стала доступной после %d попыток. Завершение.", _DB_RETRY_ATTEMPTS)
    sys.exit(1)


async def _ensure_admin_exists() -> None:
    """
    Создаёт первого администратора из переменных окружения при первом запуске.
    Если пользователи уже есть — ничего не делает (идемпотентна).
    """
    username  = os.getenv("ADMIN_USERNAME", "admin")
    password  = os.getenv("ADMIN_PASSWORD", "")
    full_name = os.getenv("ADMIN_FULLNAME", "Главный администратор")

    if not password:
        logger.warning("ADMIN_PASSWORD не задан — пропускаем авто-создание администратора.")
        return

    async with AsyncSessionLocal() as db:
        from sqlalchemy import func
        result = await db.execute(select(func.count()).select_from(User))
        if result.scalar():
            return  # пользователи уже есть — пропускаем

        from routers.auth import hash_password
        admin_user = User(
            username      = username,
            password_hash = hash_password(password),
            full_name     = full_name,
            role          = "admin",
            is_active     = True,
        )
        db.add(admin_user)
        await db.commit()
        logger.info("✓ Администратор '%s' создан автоматически.", username)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # порядок важен: сначала ждём БД, потом создаём таблицы, потом пользователя
    await _wait_for_db()

    # checkfirst=True — не падаем если таблицы уже существуют
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
    logger.info("База данных '%s' подключена.", os.getenv("DB_NAME", "applicantdb"))

    await _ensure_admin_exists()

    yield  # приложение работает — выход из yield = завершение


# ── Приложение ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Реестр абитуриентов",
    version="1.0.0",
    lifespan=lifespan,
    # swagger доступен только в разработке
    docs_url="/docs" if not _IS_PRODUCTION else None,
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
# если ALLOWED_ORIGINS не задан — разрешаем только localhost (разработка)
_allowed_origins = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    if _raw_origins
    else ["http://localhost:8000", "http://127.0.0.1:8000"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── HTTP Request Logger ───────────────────────────────────────────────────────
_req_logger = get_logger("http")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    start    = time.monotonic()
    response = await call_next(request)
    duration = round((time.monotonic() - start) * 1000)
    # логируем только API-запросы; 4xx/5xx — уровень WARNING
    if request.url.path.startswith("/api"):
        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        _req_logger.log(
            level,
            "%s %s → %s (%dms)",
            request.method, request.url.path,
            response.status_code, duration,
        )
    return response


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # базовые заголовки безопасности для всех ответов
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"]         = "DENY"
    response.headers["X-XSS-Protection"]        = "1; mode=block"
    response.headers["Referrer-Policy"]          = "strict-origin-when-cross-origin"
    # CSP: разрешаем скрипты и стили только с собственного домена и jsdelivr
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self';"
    )
    return response


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/health")
async def health_check():
    """простая проверка работоспособности для Docker healthcheck и мониторинга"""
    return {"status": "ok"}

# подключаем роутеры в порядке от общего к специализированному
app.include_router(auth.router)
app.include_router(applicants.router)
app.include_router(admin.router)
app.include_router(reports.router)
app.include_router(audit.router)