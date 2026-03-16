"""routers/auth.py — авторизация: логин, токен, инициализация администратора"""
import os
import re
import logging
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from pydantic import BaseModel, field_validator, Field

from database import get_db
from models import User

logger = logging.getLogger("abiturient.auth")
router = APIRouter()
templates = Jinja2Templates(directory="templates")

# ── Конфигурация JWT ──────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_32chars!!")
ALGORITHM  = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "60"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

# ── Простой in-memory счётчик неудачных попыток ───────────────────────────────
_failed_attempts: dict[str, list[float]] = {}
_MAX_ATTEMPTS  = 10   # попыток
_WINDOW_SEC    = 300  # за 5 минут
_LOCKOUT_SEC   = 300  # блокировка 5 минут


def _check_brute_force(ip: str) -> None:
    """Бросает 429, если IP превысил лимит неудачных попыток входа."""
    import time
    now = time.time()
    attempts = _failed_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < _WINDOW_SEC]
    if len(attempts) >= _MAX_ATTEMPTS:
        logger.warning("Брутфорс заблокирован: IP=%s попыток=%d", ip, len(attempts))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много неудачных попыток входа. Повторите через 5 минут.",
        )
    _failed_attempts[ip] = attempts


def _record_failed(ip: str) -> None:
    import time
    _failed_attempts.setdefault(ip, []).append(time.time())


def _clear_failed(ip: str) -> None:
    _failed_attempts.pop(ip, None)


# ── Политика паролей ──────────────────────────────────────────────────────────
_PWD_MIN_LEN = 8
_PWD_RE = re.compile(r'^(?=.*[a-zA-Zа-яА-ЯёЁ])(?=.*\d).{8,}$')

def validate_password_strength(password: str) -> str:
    """Минимум 8 символов, хотя бы одна буква и одна цифра."""
    if len(password) < _PWD_MIN_LEN:
        raise ValueError(f"Пароль должен содержать не менее {_PWD_MIN_LEN} символов")
    if not _PWD_RE.match(password):
        raise ValueError("Пароль должен содержать хотя бы одну букву и одну цифру")
    return password


# ── Хеширование паролей (bcrypt напрямую, без passlib) ────────────────────────

def hash_password(plain: str) -> str:
    # bcrypt ограничен 72 байтами — обрезаем заранее во избежание ошибки
    secret = plain.encode("utf-8")[:72]
    return bcrypt.hashpw(secret, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    secret = plain.encode("utf-8")[:72]
    return bcrypt.checkpw(secret, hashed.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверные учётные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exc
    return user


def require_role(*roles: str):
    async def _checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return current_user
    return _checker


# ── Pydantic-схемы ────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str
    role:         str
    full_name:    Optional[str]


class InitAdminRequest(BaseModel):
    username:   str = Field(min_length=3, max_length=64)
    password:   str
    full_name:  Optional[str] = Field(default="Главный администратор", max_length=128)

    @field_validator("password")
    @classmethod
    def pwd_strength(cls, v: str) -> str:
        return validate_password_strength(v)


# ── Маршруты ──────────────────────────────────────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@router.post("/api/auth/token", response_model=TokenResponse)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    _check_brute_force(client_ip)

    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password_hash):
        _record_failed(client_ip)
        logger.warning("Неудачный вход: user=%s ip=%s", form_data.username, client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Учётная запись отключена")

    _clear_failed(client_ip)
    logger.info("Успешный вход: user=%s role=%s ip=%s", user.username, user.role, client_ip)

    token = create_access_token(
        {"sub": user.username, "role": user.role},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user.role,
        full_name=user.full_name,
    )


@router.post("/api/auth/init-admin", status_code=201)
async def init_admin(
    payload: InitAdminRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Требует секретный токен INIT_ADMIN_SECRET из env.
    Работает только если в базе нет ни одного пользователя.
    В production можно полностью отключить через DISABLE_INIT_ADMIN=1.
    """
    if os.getenv("DISABLE_INIT_ADMIN", "0") == "1":
        raise HTTPException(status_code=404, detail="Not Found")

    init_secret = os.getenv("INIT_ADMIN_SECRET", "")
    if not init_secret:
        raise HTTPException(
            status_code=503,
            detail="Инициализация не настроена. Задайте INIT_ADMIN_SECRET в переменных окружения.",
        )

    provided = request.headers.get("X-Init-Secret", "")
    if provided != init_secret:
        client_ip = request.client.host if request.client else "unknown"
        logger.warning("Попытка init-admin с неверным секретом: ip=%s", client_ip)
        raise HTTPException(status_code=403, detail="Неверный секретный токен")

    result = await db.execute(select(User))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Администратор уже существует")

    admin_user = User(
        username      = payload.username,
        password_hash = hash_password(payload.password),
        full_name     = payload.full_name,
        role          = "admin",
        is_active     = True,
    )
    db.add(admin_user)
    await db.commit()
    logger.info("Создан первый администратор: %s", payload.username)
    return {"detail": "Администратор создан"}


@router.get("/api/auth/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id":        current_user.id_user,
        "username":  current_user.username,
        "full_name": current_user.full_name,
        "role":      current_user.role,
    }


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@router.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    return templates.TemplateResponse("admin.html", {"request": request})


@router.get("/reports", response_class=HTMLResponse)
async def reports_page(request: Request):
    return templates.TemplateResponse("reports.html", {"request": request})


@router.get("/logs", response_class=HTMLResponse)
async def logs_page(request: Request):
    return templates.TemplateResponse("logs.html", {"request": request})