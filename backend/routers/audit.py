"""routers/audit.py — чтение и запись лога аудита"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db
from models import User
from routers.auth import get_current_user, require_role

logger = logging.getLogger("abiturient.audit")
router = APIRouter(prefix="/api/audit", tags=["audit"])


# записывает одно действие в лог; вызывается из applicants.py
async def log_action(
    db: AsyncSession,
    user: User,
    action: str,
    applicant_id: int,
    applicant_fio: str,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
) -> None:
    await db.execute(text("""
        INSERT INTO Audit_log
            (action, applicant_id, applicant_fio, field_name,
             old_value, new_value,
             id_user, changed_by, changed_at)
        VALUES
            (:action, :applicant_id, :applicant_fio, :field_name,
             :old_value, :new_value,
             :id_user, :changed_by, :changed_at)
    """), {
        "action":        action,
        "applicant_id":  applicant_id,
        "applicant_fio": applicant_fio,
        "field_name":    field_name,
        "old_value":     str(old_value) if old_value is not None else None,
        "new_value":     str(new_value) if new_value is not None else None,
        # id_user — FK на Users; changed_by — страховка если пользователя удалят
        "id_user":       user.id_user,
        "changed_by":    user.username,
        "changed_at":    datetime.utcnow(),
    })


# история изменений конкретного абитуриента (admin и editor)
@router.get("/applicant/{applicant_id}")
async def get_applicant_history(
    applicant_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    rows = await db.execute(text("""
        SELECT
            al.id, al.action,
            al.applicant_id, al.applicant_fio,
            al.field_name, al.old_value, al.new_value,
            al.changed_by,
            -- роль берём из таблицы Users через JOIN; если пользователь удалён — NULL
            u.role          AS changed_by_role,
            DATE_FORMAT(al.changed_at, '%d.%m.%Y %H:%i') AS changed_at
        FROM Audit_log al
        LEFT JOIN Users u ON al.id_user = u.id_user
        WHERE al.applicant_id = :applicant_id
        ORDER BY al.changed_at DESC
    """), {"applicant_id": applicant_id})
    return [dict(r) for r in rows.mappings().all()]


# полный лог всех действий (только admin)
@router.get("/log")
async def get_full_log(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    rows = await db.execute(text("""
        SELECT
            al.id, al.action,
            al.applicant_id, al.applicant_fio,
            al.field_name, al.old_value, al.new_value,
            al.changed_by,
            u.role          AS changed_by_role,
            DATE_FORMAT(al.changed_at, '%d.%m.%Y %H:%i') AS changed_at
        FROM Audit_log al
        LEFT JOIN Users u ON al.id_user = u.id_user
        ORDER BY al.changed_at DESC
        LIMIT :limit
    """), {"limit": limit})
    return [dict(r) for r in rows.mappings().all()]