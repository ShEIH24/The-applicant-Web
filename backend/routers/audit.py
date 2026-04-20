"""routers/audit.py — чтение и запись лога аудита"""
import os
import json
import logging
from datetime import datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db
from models import User
from routers.auth import get_current_user, require_role

logger = logging.getLogger("abiturient.audit")
router = APIRouter(prefix="/api/audit", tags=["audit"])

# путь к файлу лога — рядом с папкой routers лежит logs/app.log
_LOG_FILE = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "logs", "app.log")
)


# ── Запись действия в лог ─────────────────────────────────────────────────────
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
    """вызывается из applicants.py при каждом изменении"""
    await db.execute(text("""
        INSERT INTO Audit_log
            (action, applicant_id, applicant_fio, field_name,
             old_value, new_value, id_user, changed_by, changed_at)
        VALUES
            (:action, :applicant_id, :applicant_fio, :field_name,
             :old_value, :new_value, :id_user, :changed_by, :changed_at)
    """), {
        "action":        action,
        "applicant_id":  applicant_id,
        "applicant_fio": applicant_fio,
        "field_name":    field_name,
        "old_value":     str(old_value) if old_value is not None else None,
        "new_value":     str(new_value) if new_value is not None else None,
        "id_user":       user.id_user,
        "changed_by":    user.username,
        "changed_at":    datetime.now(tz=MSK).replace(tzinfo=None),
    })


# ── История конкретного абитуриента ───────────────────────────────────────────
@router.get("/applicant/{applicant_id}")
async def get_applicant_history(
    applicant_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    """история изменений одного абитуриента"""
    rows = await db.execute(text("""
        SELECT
            al.id, al.action,
            al.applicant_id, al.applicant_fio,
            al.field_name, al.old_value, al.new_value,
            al.changed_by,
            u.role AS changed_by_role,
            DATE_FORMAT(al.changed_at, '%d.%m.%Y %H:%i') AS changed_at
        FROM Audit_log al
        LEFT JOIN Users u ON al.id_user = u.id_user
        WHERE al.applicant_id = :applicant_id
        ORDER BY al.changed_at DESC
    """), {"applicant_id": applicant_id})
    return [dict(r) for r in rows.mappings().all()]


# ── Полный лог действий ───────────────────────────────────────────────────────
@router.get("/log")
async def get_full_log(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """последние N записей аудита по всем абитуриентам"""
    rows = await db.execute(text("""
        SELECT
            al.id, al.action,
            al.applicant_id, al.applicant_fio,
            al.field_name, al.old_value, al.new_value,
            al.changed_by,
            u.role AS changed_by_role,
            DATE_FORMAT(al.changed_at, '%d.%m.%Y %H:%i') AS changed_at
        FROM Audit_log al
        LEFT JOIN Users u ON al.id_user = u.id_user
        ORDER BY al.changed_at DESC
        LIMIT :limit
    """), {"limit": limit})
    return [dict(r) for r in rows.mappings().all()]


# ── Системные логи из файла ───────────────────────────────────────────────────
@router.get("/file-logs")
async def get_file_logs(
    level:  str = Query(""),
    search: str = Query(""),
    lines:  int = Query(200),
    _: User = Depends(require_role("admin")),
):
    """читает JSON-строки из logs/app.log, фильтрует и возвращает"""
    if not os.path.exists(_LOG_FILE):
        return {"entries": [], "total": 0}

    entries = []
    try:
        with open(_LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            raw_lines = f.readlines()

        for raw in raw_lines:
            raw = raw.strip()
            if not raw:
                continue
            try:
                entry = json.loads(raw)
            except Exception:
                # не JSON — заворачиваем как plain
                entry = {"ts": "", "level": "INFO", "logger": "system", "msg": raw}

            # фильтр по уровню
            if level and entry.get("level", "").upper() != level.upper():
                continue
            # фильтр по тексту
            if search and search.lower() not in entry.get("msg", "").lower():
                continue

            entries.append(entry)

    except Exception as e:
        return {"entries": [{"ts": "", "level": "ERROR", "logger": "system", "msg": str(e)}], "total": 1}

    # возвращаем последние N строк в обратном порядке (новые сверху)
    result = list(reversed(entries[-lines:]))
    return {"entries": result, "total": len(entries)}


# ── Статистика аудита ─────────────────────────────────────────────────────────
@router.get("/stats")
async def get_audit_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """сводные цифры для карточек на странице журнала"""
    week_ago = (datetime.now(tz=MSK).replace(tzinfo=None) - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")

    row = await db.execute(text("""
        SELECT
            COUNT(*)                                                        AS total,
            SUM(CASE WHEN action = 'create' THEN 1 ELSE 0 END)             AS creates,
            SUM(CASE WHEN action = 'update' THEN 1 ELSE 0 END)             AS updates,
            SUM(CASE WHEN action = 'delete' THEN 1 ELSE 0 END)             AS deletes,
            SUM(CASE WHEN changed_at >= :week_ago THEN 1 ELSE 0 END)       AS last_7_days
        FROM Audit_log
    """), {"week_ago": week_ago})

    data = dict(row.mappings().one())
    # преобразуем Decimal/None в int
    return {
        "stats": {k: int(v or 0) for k, v in data.items()}
    }


# ── Лента последних действий с фильтрами ─────────────────────────────────────
@router.get("/recent")
async def get_recent_audit(
    action: str = Query(""),
    user:   str = Query(""),
    limit:  int = Query(300),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """последние записи аудита с фильтрацией по действию и пользователю"""
    conditions = ["1=1"]
    params: dict = {"limit": limit}

    if action:
        conditions.append("al.action = :action")
        params["action"] = action
    if user:
        conditions.append("al.changed_by LIKE :user")
        params["user"] = f"%{user}%"

    where = " AND ".join(conditions)

    rows = await db.execute(text(f"""
        SELECT
            al.id, al.action,
            al.applicant_id, al.applicant_fio,
            al.field_name, al.old_value, al.new_value,
            al.changed_by,
            COALESCE(u.role, '—') AS changed_by_role,
            DATE_FORMAT(al.changed_at, '%d.%m.%Y %H:%i') AS changed_at
        FROM Audit_log al
        LEFT JOIN Users u ON al.id_user = u.id_user
        WHERE {where}
        ORDER BY al.changed_at DESC
        LIMIT :limit
    """), params)
    return [dict(r) for r in rows.mappings().all()]