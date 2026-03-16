"""routers/admin.py — управление пользователями (только для admin)"""
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator, Field

from database import get_db
from models import User
from routers.auth import get_current_user, hash_password, require_role, validate_password_strength

logger = logging.getLogger("abiturient.admin")
router = APIRouter(prefix="/api/admin", tags=["admin"])

_VALID_ROLES = {"admin", "editor", "viewer"}


# ── Pydantic схемы ─────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id:        int
    username:  str
    full_name: Optional[str]
    role:      str
    is_active: bool

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    # Уязвимость #9: добавлены ограничения длины и валидация
    username:  str = Field(min_length=3, max_length=64, pattern=r'^[a-zA-Z0-9_\-\.]+$')
    password:  str
    full_name: Optional[str] = Field(default=None, max_length=128)
    role:      str

    @field_validator("password")
    @classmethod
    def pwd_strength(cls, v: str) -> str:
        return validate_password_strength(v)

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in _VALID_ROLES:
            raise ValueError("Роль должна быть: admin, editor или viewer")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=128)
    role:      Optional[str] = None
    is_active: Optional[bool] = None
    password:  Optional[str] = None

    @field_validator("password")
    @classmethod
    def pwd_strength(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_password_strength(v)
        return v

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_ROLES:
            raise ValueError("Роль должна быть: admin, editor или viewer")
        return v


# ── Маршруты ───────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).order_by(User.id_user))
    users = result.scalars().all()
    return [UserOut(
        id=u.id_user, username=u.username, full_name=u.full_name,
        role=u.role, is_active=u.is_active,
    ) for u in users]


@router.post("/users", status_code=201, response_model=UserOut)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    r = await db.execute(select(User).where(User.username == payload.username))
    if r.scalar_one_or_none():
        raise HTTPException(400, "Пользователь с таким логином уже существует")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("Создан пользователь: %s role=%s by=%s", user.username, user.role, current_user.username)
    return UserOut(id=user.id_user, username=user.username, full_name=user.full_name,
                   role=user.role, is_active=user.is_active)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    r = await db.execute(select(User).where(User.id_user == user_id))
    user = r.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    if user_id == current_user.id_user:
        if payload.is_active is False:
            raise HTTPException(400, "Нельзя деактивировать собственную учётную запись")
        if payload.role and payload.role != "admin":
            raise HTTPException(400, "Нельзя снять с себя роль администратора")

    if payload.role      is not None: user.role      = payload.role
    if payload.full_name is not None: user.full_name = payload.full_name
    if payload.is_active is not None: user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)

    await db.commit()
    await db.refresh(user)
    logger.info("Обновлён пользователь id=%d by=%s", user_id, current_user.username)
    return UserOut(id=user.id_user, username=user.username, full_name=user.full_name,
                   role=user.role, is_active=user.is_active)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if user_id == current_user.id_user:
        raise HTTPException(400, "Нельзя удалить собственную учётную запись")

    r = await db.execute(select(User).where(User.id_user == user_id))
    user = r.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    await db.delete(user)
    await db.commit()
    logger.info("Удалён пользователь id=%d by=%s", user_id, current_user.username)
    return None