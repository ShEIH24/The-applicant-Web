"""
routers/audit.py — история изменений + просмотр логов для админа
─────────────────────────────────────────────────────────────────
Два слоя:
  1. Audit_log (MySQL) — бизнес-события: create/update/delete абитуриентов
  2. app.log  (файл)   — технические логи: ошибки, предупреждения, запросы
"""
import os
import json
import logging
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db
from routers.auth import get_current_user, require_role
from models import User

logger  = logging.getLogger("abiturient.audit")
router  = APIRouter(prefix="/api/audit", tags=["audit"])
_ROLES  = ("admin", "editor")

LOG_DIR  = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
LOG_FILE = os.path.join(LOG_DIR, "app.log")


# ══════════════════════════════════════════════════════════════════
# write_log — вызывается из applicants.py при каждом изменении
# ══════════════════════════════════════════════════════════════════

async def write_log(
    db: AsyncSession,
    action: str,            # 'create' | 'update' | 'delete'
    applicant_id: int,
    applicant_fio: str,
    changed_by: str,
    changed_by_role: str,
    changes: list[dict] | None = None,
):
    """
    Записывает событие в Audit_log (MySQL) И в app.log (файл).
    Для create/delete — одна строка.
    Для update — по строке на каждое изменённое поле.
    """
    # ── 1. Пишем в файл-лог (всегда, даже если БД недоступна) ────────────────
    _write_to_file(action, applicant_id, applicant_fio, changed_by, changed_by_role, changes)

    # ── 2. Пишем в Audit_log (MySQL) ─────────────────────────────────────────
    try:
        if action in ("create", "delete") or not changes:
            await db.execute(text("""
                INSERT INTO Audit_log
                  (action, applicant_id, applicant_fio,
                   field_name, old_value, new_value,
                   changed_by, changed_by_role)
                VALUES
                  (:action, :aid, :fio, NULL, NULL, NULL, :by, :role)
            """), {
                "action": action, "aid": applicant_id, "fio": applicant_fio,
                "by": changed_by, "role": changed_by_role,
            })
        else:
            for ch in changes:
                old_str = str(ch.get("old") or "")
                new_str = str(ch.get("new") or "")
                if old_str == new_str:
                    continue
                await db.execute(text("""
                    INSERT INTO Audit_log
                      (action, applicant_id, applicant_fio,
                       field_name, old_value, new_value,
                       changed_by, changed_by_role)
                    VALUES
                      ('update', :aid, :fio, :field, :old, :new, :by, :role)
                """), {
                    "aid":   applicant_id,
                    "fio":   applicant_fio,
                    "field": ch["field"],
                    "old":   old_str[:2000],
                    "new":   new_str[:2000],
                    "by":    changed_by,
                    "role":  changed_by_role,
                })
        # !! Важно: commit здесь не вызываем — это делает вызывающий код
    except Exception as e:
        # Если Audit_log недоступна — не ломаем основной запрос
        logger.error("Audit_log DB write failed: %s", e)


def _write_to_file(action, applicant_id, applicant_fio, changed_by, changed_by_role, changes):
    """Дублирует аудит-событие в app.log как структурированная INFO-запись."""
    if changes:
        for ch in changes:
            old_str = str(ch.get("old") or "")
            new_str = str(ch.get("new") or "")
            if old_str == new_str:
                continue
            logger.info(
                "AUDIT %s id=%s fio=%r field=%r %r→%r by=%s(%s)",
                action.upper(), applicant_id, applicant_fio,
                ch["field"], old_str[:80], new_str[:80],
                changed_by, changed_by_role,
            )
    else:
        logger.info(
            "AUDIT %s id=%s fio=%r by=%s(%s)",
            action.upper(), applicant_id, applicant_fio,
            changed_by, changed_by_role,
        )


# ══════════════════════════════════════════════════════════════════
# API: история конкретного абитуриента
# ══════════════════════════════════════════════════════════════════

@router.get("/applicant/{applicant_id}")
async def get_applicant_log(
    applicant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = await db.execute(text("""
        SELECT id, action, applicant_id, applicant_fio,
               field_name, old_value, new_value,
               changed_by, changed_by_role, changed_at
        FROM Audit_log
        WHERE applicant_id = :id
        ORDER BY changed_at DESC
        LIMIT 200
    """), {"id": applicant_id})
    return [_fmt(row) for row in r.mappings().all()]


# ══════════════════════════════════════════════════════════════════
# API: лента последних бизнес-событий
# ══════════════════════════════════════════════════════════════════

@router.get("/recent")
async def get_recent_log(
    limit:  int            = Query(100, ge=1, le=500),
    action: Optional[str]  = Query(None),
    user:   Optional[str]  = Query(None),
    db: AsyncSession       = Depends(get_db),
    current_user: User     = Depends(require_role("admin", "editor")),
):
    where  = ["1=1"]
    params: dict = {"limit": limit}
    if action in ("create", "update", "delete"):
        where.append("action = :action")
        params["action"] = action
    if user:
        where.append("changed_by LIKE :user")
        params["user"] = f"%{user}%"

    r = await db.execute(text(f"""
        SELECT id, action, applicant_id, applicant_fio,
               field_name, old_value, new_value,
               changed_by, changed_by_role, changed_at
        FROM Audit_log
        WHERE {' AND '.join(where)}
        ORDER BY changed_at DESC
        LIMIT :limit
    """), params)
    return [_fmt(row) for row in r.mappings().all()]


# ══════════════════════════════════════════════════════════════════
# API: сводная статистика аудита
# ══════════════════════════════════════════════════════════════════

@router.get("/stats")
async def get_audit_stats(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role("admin", "editor")),
):
    r = await db.execute(text("""
        SELECT
            COUNT(*)                                                         AS total,
            SUM(CASE WHEN action='create' THEN 1 ELSE 0 END)               AS creates,
            SUM(CASE WHEN action='update' THEN 1 ELSE 0 END)               AS updates,
            SUM(CASE WHEN action='delete' THEN 1 ELSE 0 END)               AS deletes,
            SUM(CASE WHEN changed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                     THEN 1 ELSE 0 END)                                    AS last_7_days,
            COUNT(DISTINCT changed_by)                                      AS active_users
        FROM Audit_log
    """))
    stats = {k: int(v or 0) for k, v in dict(r.mappings().one()).items()}

    r2 = await db.execute(text("""
        SELECT changed_by, changed_by_role, COUNT(*) AS cnt
        FROM Audit_log
        GROUP BY changed_by, changed_by_role
        ORDER BY cnt DESC LIMIT 5
    """))
    top_users = [dict(row) for row in r2.mappings().all()]

    r3 = await db.execute(text("""
        SELECT field_name, COUNT(*) AS cnt
        FROM Audit_log WHERE field_name IS NOT NULL
        GROUP BY field_name ORDER BY cnt DESC LIMIT 5
    """))
    top_fields = [dict(row) for row in r3.mappings().all()]

    return {"stats": stats, "top_users": top_users, "top_fields": top_fields}


# ══════════════════════════════════════════════════════════════════
# API: просмотр файла логов (только admin)
# ══════════════════════════════════════════════════════════════════

@router.get("/file-logs")
async def get_file_logs(
    lines:  int           = Query(200, ge=10, le=2000),
    level:  Optional[str] = Query(None),   # INFO | WARNING | ERROR | CRITICAL
    search: Optional[str] = Query(None),
    current_user: User    = Depends(require_role("admin")),
):
    """
    Читает последние N строк из app.log и возвращает как JSON.
    Доступно только администратору.
    """
    if not os.path.exists(LOG_FILE):
        return {"entries": [], "total": 0, "file": LOG_FILE}

    entries = []
    try:
        with open(LOG_FILE, encoding="utf-8") as f:
            raw_lines = f.readlines()

        for line in raw_lines:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                # Нежданная нежурнальная строка — оборачиваем
                entry = {"ts": "", "level": "RAW", "msg": line}

            # Фильтр по уровню
            if level and entry.get("level", "").upper() != level.upper():
                continue
            # Фильтр по тексту
            if search and search.lower() not in json.dumps(entry, ensure_ascii=False).lower():
                continue

            entries.append(entry)

        # Последние N строк после фильтрации
        entries = entries[-lines:]
        entries.reverse()   # новые сверху

    except Exception as e:
        logger.error("Failed to read log file: %s", e)
        raise HTTPException(500, f"Не удалось прочитать файл логов: {e}")

    return {
        "entries": entries,
        "total":   len(entries),
        "file":    os.path.basename(LOG_FILE),
    }


# ══════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════

def _fmt(row) -> dict:
    d = dict(row)
    if isinstance(d.get("changed_at"), datetime):
        d["changed_at"] = d["changed_at"].strftime("%d.%m.%Y %H:%M:%S")
    return d