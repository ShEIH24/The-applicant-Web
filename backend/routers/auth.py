"""routers/auth.py — авторизация: логин, токен, инициализация администратора"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from pydantic import BaseModel
import bcrypt
import os
import re

from database import get_db
from models import User

router = APIRouter()
templates = Jinja2Templates(directory="templates")

# ---------- Конфигурация JWT ----------
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_32chars!!")
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 часов

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


# ---------- Хэширование паролей (bcrypt напрямую) ----------


# ── Политика паролей ──────────────────────────────────────────────────────────
_PWD_MIN_LEN = 8
_PWD_RE = re.compile(r'^(?=.*[a-zA-Zа-яА-ЯёЁ])(?=.*\d).{8,}$')

def validate_password_strength(password: str) -> str:
    """минимум 8 символов, хотя бы одна буква и одна цифра"""
    if len(password) < _PWD_MIN_LEN:
        raise ValueError(f"Пароль должен содержать не менее {_PWD_MIN_LEN} символов")
    if not _PWD_RE.match(password):
        raise ValueError("Пароль должен содержать хотя бы одну букву и одну цифру")
    return password


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ---------- JWT ----------

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


# ---------- Pydantic-схемы ----------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    full_name: Optional[str]


class InitAdminRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = "Главный администратор"


# ---------- Маршруты ----------

@router.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@router.post("/api/auth/token", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Учётная запись отключена")

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
async def init_admin(payload: InitAdminRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Администратор уже существует")

    admin = User(
        username      = payload.username,
        password_hash = hash_password(payload.password),
        full_name     = payload.full_name,
        role          = "admin",
        is_active     = True,
    )
    db.add(admin)
    await db.commit()
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
    """Главная страница с таблицей (защищена на стороне JS)"""
    return templates.TemplateResponse("dashboard.html", {"request": request})


@router.get("/logs", response_class=HTMLResponse)
async def logs_page(request: Request):
    """страница журнала системы — только для admin (защита на стороне JS)"""
    return templates.TemplateResponse("logs.html", {"request": request})


@router.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    """страница управления пользователями — только для admin (защита на стороне JS)"""
    return templates.TemplateResponse("admin.html", {"request": request})