"""routers/applicants.py — CRUD API для абитуриентов"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, delete, func
from pydantic import BaseModel
from datetime import date

from database import get_db
from models import (Applicant, Application, AdditionalInfo, Parent,
                    City, Region, Institution, Benefit, ApplicantBenefit,
                    InformationSource, User)
from routers.auth import get_current_user
from routers.audit import log_action

router = APIRouter(prefix="/api/applicants", tags=["applicants"])


# ── Pydantic схемы ────────────────────────────────────────────────────────────

class ApplicantRow(BaseModel):
    id: int
    last_name: str
    first_name: str
    patronymic: Optional[str]
    code: Optional[str]
    form_education: Optional[str]
    rating: float
    base_rating: Optional[float]
    benefit: Optional[str]
    bonus_points: Optional[int]
    has_original: bool
    region: Optional[str]
    city: Optional[str]
    dormitory: bool
    institution: Optional[str]
    submission_date: Optional[str]
    visit_date: Optional[str]
    info_source: Optional[str]
    phone: str
    vk: Optional[str]
    parent_name: Optional[str]
    parent_relation: Optional[str]
    parent_phone: Optional[str]
    notes: Optional[str]

    class Config:
        from_attributes = True


class ApplicantCreate(BaseModel):
    last_name: str
    first_name: str
    patronymic: Optional[str] = None
    phone: str
    vk: Optional[str] = None
    city: str
    region: str
    code: str
    form_education: str = "Очная"
    base_rating: float
    has_original: bool = False
    submission_date: Optional[date] = None
    institution: str
    benefit: Optional[str] = None
    dormitory: bool = False
    visit_date: Optional[date] = None
    info_source: Optional[str] = None
    notes: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_relation: Optional[str] = "Родитель"


class ApplicantUpdate(ApplicantCreate):
    pass


# ── Вспомогательные функции ───────────────────────────────────────────────────

async def _get_or_create_region(db: AsyncSession, name: str) -> int:
    r = await db.execute(select(Region).where(Region.name_region == name))
    obj = r.scalar_one_or_none()
    if obj:
        return obj.id_region
    obj = Region(name_region=name)
    db.add(obj)
    await db.flush()
    return obj.id_region


async def _get_or_create_city(db: AsyncSession, city: str, region: str) -> int:
    id_region = await _get_or_create_region(db, region)
    r = await db.execute(
        select(City).where(City.name_city == city, City.id_region == id_region)
    )
    obj = r.scalar_one_or_none()
    if obj:
        return obj.id_city
    obj = City(name_city=city, id_region=id_region)
    db.add(obj)
    await db.flush()
    return obj.id_city



async def _get_or_create_institution(db: AsyncSession, name: Optional[str]) -> Optional[int]:
    # ищет или создаёт учреждение по названию; возвращает None если не указано
    if not name or not name.strip():
        return None
    r = await db.execute(
        select(Institution).where(Institution.name_institution == name)
    )
    obj = r.scalar_one_or_none()
    if obj:
        return obj.id_institution
    obj = Institution(name_institution=name)
    db.add(obj)
    await db.flush()
    return obj.id_institution


async def _get_or_create_source(db: AsyncSession, name: Optional[str]) -> Optional[int]:
    if not name:
        return None
    r = await db.execute(
        select(InformationSource).where(InformationSource.name_source == name)
    )
    obj = r.scalar_one_or_none()
    if obj:
        return obj.id_source
    obj = InformationSource(name_source=name)
    db.add(obj)
    await db.flush()
    return obj.id_source


async def _get_benefit(db: AsyncSession, name: Optional[str]):
    if not name:
        return None, 0
    r = await db.execute(select(Benefit).where(Benefit.name_benefit == name))
    obj = r.scalar_one_or_none()
    if obj:
        return obj.id_benefit, obj.bonus_points
    return None, 0


# ── Список абитуриентов ───────────────────────────────────────────────────────

@router.get("", response_model=List[ApplicantRow])
async def list_applicants(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sql = text("""
        SELECT
            a.id_applicant      AS id,
            a.last_name, a.first_name, a.patronymic,
            a.phone, a.vk,
            a.rating,
            c.name_city         AS city,
            r.name_region       AS region,
            app.code,
            app.form_education,
            app.base_rating,
            app.has_original,
            app.submission_date,
            inst.name_institution AS institution,
            b.name_benefit      AS benefit,
            b.bonus_points,
            ai.department_visit AS visit_date,
            ai.notes,
            ai.dormitory_needed AS dormitory,
            isrc.name_source    AS info_source,
            p.name              AS parent_name,
            p.phone             AS parent_phone,
            p.relation          AS parent_relation
        FROM Applicant a
        LEFT JOIN City c              ON a.id_city       = c.id_city
        LEFT JOIN Region r            ON c.id_region     = r.id_region
        LEFT JOIN Application app     ON a.id_applicant  = app.id_applicant
        LEFT JOIN Institution inst    ON a.id_institution = inst.id_institution
        LEFT JOIN Applicant_benefit ab ON a.id_applicant = ab.id_applicant
        LEFT JOIN Benefit b           ON ab.id_benefit   = b.id_benefit
        LEFT JOIN Additional_info ai  ON a.id_applicant  = ai.id_applicant
        LEFT JOIN Information_source isrc ON ai.id_source = isrc.id_source
        LEFT JOIN Parent p            ON a.id_parent     = p.id_parent
        ORDER BY a.id_applicant
    """)
    rows = (await db.execute(sql)).mappings().all()

    result = []
    for row in rows:
        sub_date = row["submission_date"]
        vis_date = row["visit_date"]
        result.append(ApplicantRow(
            id=row["id"],
            last_name=row["last_name"],
            first_name=row["first_name"],
            patronymic=row["patronymic"],
            code=row["code"],
            form_education=row["form_education"],
            rating=row["rating"] or 0,
            base_rating=row["base_rating"],
            benefit=row["benefit"],
            bonus_points=row["bonus_points"],
            has_original=bool(row["has_original"]),
            region=row["region"],
            city=row["city"],
            dormitory=bool(row["dormitory"]),
            institution=row["institution"],
            submission_date=sub_date.strftime("%d.%m.%Y") if sub_date else None,
            visit_date=vis_date.strftime("%d.%m.%Y") if vis_date else None,
            info_source=row["info_source"],
            phone=row["phone"],
            vk=row["vk"],
            parent_name=row["parent_name"],
            parent_relation=row["parent_relation"],
            parent_phone=row["parent_phone"],
            notes=row["notes"],
        ))

    if search:
        s = search.lower()
        result = [
            r for r in result if any(
                s in str(v or "").lower() for v in [
                    r.last_name, r.first_name, r.patronymic,
                    r.city, r.region, r.phone, r.code, r.institution
                ]
            )
        ]
    return result


# ── Создание абитуриента ──────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_applicant(
    data: ApplicantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "editor"):
        raise HTTPException(403, "Недостаточно прав")

    # Используем чистый SQL чтобы полностью контролировать порядок INSERT
    # и избежать проблем с autoflush / NULL rating
    id_city        = await _get_or_create_city(db, data.city, data.region)
    id_institution = await _get_or_create_institution(db, data.institution)
    id_benefit, bonus_points = await _get_benefit(db, data.benefit)
    id_source      = await _get_or_create_source(db, data.info_source)

    # Родитель
    id_parent = None
    if data.parent_name and data.parent_phone:
        res = await db.execute(text(
            "INSERT INTO Parent (name, phone, relation) VALUES (:name, :phone, :rel)"
        ), {"name": data.parent_name, "phone": data.parent_phone,
            "rel": data.parent_relation or "Родитель"})
        id_parent = res.lastrowid

    # Абитуриент — rating сразу задаём как бонус льготы (не NULL)
    rating = float(bonus_points or 0)
    res = await db.execute(text("""
        INSERT INTO Applicant
            (last_name, first_name, patronymic, phone, vk,
             id_city, id_parent, id_institution, rating)
        VALUES
            (:last_name, :first_name, :patronymic, :phone, :vk,
             :id_city, :id_parent, :id_institution, :rating)
    """), {
        "last_name":      data.last_name,
        "first_name":     data.first_name,
        "patronymic":     data.patronymic,
        "phone":          data.phone,
        "vk":             data.vk,
        "id_city":        id_city,
        "id_parent":      id_parent,
        "id_institution": id_institution,
        "rating":         rating,
    })
    applicant_id = res.lastrowid

    # Заявление
    await db.execute(text("""
        INSERT INTO Application
            (id_applicant, code, base_rating, has_original,
             submission_date, form_education)
        VALUES
            (:id_applicant, :code, 0, :has_original,
             :submission_date, :form_education)
    """), {
        "id_applicant":    applicant_id,
        "code":            data.code,
        "has_original":    int(data.has_original),
        "submission_date": data.submission_date,
        "form_education":  data.form_education,
    })

    # Льгота
    if id_benefit:
        await db.execute(text(
            "INSERT INTO Applicant_benefit (id_applicant, id_benefit) VALUES (:a, :b)"
        ), {"a": applicant_id, "b": id_benefit})

    # Дополнительная информация
    await db.execute(text("""
        INSERT INTO Additional_info
            (id_applicant, department_visit, notes, id_source, dormitory_needed)
        VALUES
            (:id_applicant, :visit, :notes, :id_source, :dormitory)
    """), {
        "id_applicant": applicant_id,
        "visit":        data.visit_date,
        "notes":        data.notes,
        "id_source":    id_source,
        "dormitory":    int(data.dormitory),
    })

    await db.commit()

    # записываем в аудит — создание абитуриента
    fio = " ".join(filter(None, [data.last_name, data.first_name, data.patronymic]))
    await log_action(db, current_user, "create", applicant_id, fio)
    await db.commit()

    return {"id": applicant_id}


# ── Обновление абитуриента ────────────────────────────────────────────────────

@router.put("/{applicant_id}")
async def update_applicant(
    applicant_id: int,
    data: ApplicantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "editor"):
        raise HTTPException(403, "Недостаточно прав")

    # Проверяем существование
    r = await db.execute(text(
        "SELECT id_applicant FROM Applicant WHERE id_applicant = :id"
    ), {"id": applicant_id})
    if not r.first():
        raise HTTPException(404, "Абитуриент не найден")

    id_city        = await _get_or_create_city(db, data.city, data.region)
    id_institution = await _get_or_create_institution(db, data.institution)
    id_benefit, bonus_points = await _get_benefit(db, data.benefit)
    id_source      = await _get_or_create_source(db, data.info_source)
    rating         = float(bonus_points or 0)

    # Родитель — получаем текущий id_parent
    r = await db.execute(text(
        "SELECT id_parent FROM Applicant WHERE id_applicant = :id"
    ), {"id": applicant_id})
    row = r.first()
    id_parent = row[0] if row else None

    if data.parent_name and data.parent_phone:
        if id_parent:
            await db.execute(text(
                "UPDATE Parent SET name=:name, phone=:phone, relation=:rel WHERE id_parent=:id"
            ), {"name": data.parent_name, "phone": data.parent_phone,
                "rel": data.parent_relation or "Родитель", "id": id_parent})
        else:
            res = await db.execute(text(
                "INSERT INTO Parent (name, phone, relation) VALUES (:name, :phone, :rel)"
            ), {"name": data.parent_name, "phone": data.parent_phone,
                "rel": data.parent_relation or "Родитель"})
            id_parent = res.lastrowid
    else:
        id_parent = None

    # Абитуриент
    await db.execute(text("""
        UPDATE Applicant SET
            last_name=:last_name, first_name=:first_name, patronymic=:patronymic,
            phone=:phone, vk=:vk, id_city=:id_city,
            id_parent=:id_parent, id_institution=:id_institution, rating=:rating
        WHERE id_applicant=:id
    """), {
        "last_name":      data.last_name,
        "first_name":     data.first_name,
        "patronymic":     data.patronymic,
        "phone":          data.phone,
        "vk":             data.vk,
        "id_city":        id_city,
        "id_parent":      id_parent,
        "id_institution": id_institution,
        "rating":         rating,
        "id":             applicant_id,
    })

    # Заявление — upsert
    r = await db.execute(text(
        "SELECT id_application FROM Application WHERE id_applicant=:id"
    ), {"id": applicant_id})
    if r.first():
        await db.execute(text("""
            UPDATE Application SET
                code=:code, base_rating=0, has_original=:has_original,
                submission_date=:submission_date, form_education=:form_education
            WHERE id_applicant=:id
        """), {
            "code": data.code, "has_original": int(data.has_original),
            "submission_date": data.submission_date,
            "form_education": data.form_education,
            "id": applicant_id,
        })
    else:
        await db.execute(text("""
            INSERT INTO Application
                (id_applicant, code, base_rating, has_original,
                 submission_date, form_education)
            VALUES (:id, :code, 0, :has_original,
                    :submission_date, :form_education)
        """), {
            "id": applicant_id, "code": data.code,
            "has_original": int(data.has_original),
            "submission_date": data.submission_date,
            "form_education": data.form_education,
        })

    # Льгота — пересоздаём
    await db.execute(text(
        "DELETE FROM Applicant_benefit WHERE id_applicant=:id"
    ), {"id": applicant_id})
    if id_benefit:
        await db.execute(text(
            "INSERT INTO Applicant_benefit (id_applicant, id_benefit) VALUES (:a, :b)"
        ), {"a": applicant_id, "b": id_benefit})

    # Доп. информация — upsert
    r = await db.execute(text(
        "SELECT id_info FROM Additional_info WHERE id_applicant=:id"
    ), {"id": applicant_id})
    if r.first():
        await db.execute(text("""
            UPDATE Additional_info SET
                department_visit=:visit, notes=:notes,
                id_source=:id_source, dormitory_needed=:dormitory
            WHERE id_applicant=:id
        """), {
            "visit": data.visit_date, "notes": data.notes,
            "id_source": id_source, "dormitory": int(data.dormitory),
            "id": applicant_id,
        })
    else:
        await db.execute(text("""
            INSERT INTO Additional_info
                (id_applicant, department_visit, notes, id_source, dormitory_needed)
            VALUES (:id, :visit, :notes, :id_source, :dormitory)
        """), {
            "id": applicant_id, "visit": data.visit_date, "notes": data.notes,
            "id_source": id_source, "dormitory": int(data.dormitory),
        })

    # записываем в аудит — обновление абитуриента
    fio = " ".join(filter(None, [data.last_name, data.first_name, data.patronymic]))
    await log_action(db, current_user, "update", applicant_id, fio)
    await db.commit()

    return {"ok": True}


# ── Удаление абитуриента ──────────────────────────────────────────────────────

@router.delete("/{applicant_id}")
async def delete_applicant(
    applicant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "editor"):
        raise HTTPException(403, "Недостаточно прав")

    r = await db.execute(text(
        "SELECT id_applicant FROM Applicant WHERE id_applicant = :id"
    ), {"id": applicant_id})
    if not r.first():
        raise HTTPException(404, "Абитуриент не найден")

    # получаем ФИО до удаления для аудита
    fio_row = await db.execute(text(
        "SELECT CONCAT_WS(' ', last_name, first_name, patronymic) AS fio FROM Applicant WHERE id_applicant = :id"
    ), {"id": applicant_id})
    fio_data = fio_row.mappings().first()
    fio = fio_data["fio"] if fio_data else str(applicant_id)

    await db.execute(text(
        "DELETE FROM Applicant WHERE id_applicant = :id"
    ), {"id": applicant_id})

    # записываем в аудит — удаление абитуриента
    await log_action(db, current_user, "delete", applicant_id, fio)
    await db.commit()

    # Сбрасываем AUTO_INCREMENT до MAX(id)+1 чтобы новые записи
    # не получали «дырявые» номера после удалений
    r = await db.execute(text(
        "SELECT COALESCE(MAX(id_applicant), 0) + 1 AS next_id FROM Applicant"
    ))
    next_id = r.scalar() or 1
    await db.execute(text(f"ALTER TABLE Applicant AUTO_INCREMENT = {int(next_id)}"))
    await db.commit()

    return {"ok": True}


# ── Справочники ───────────────────────────────────────────────────────────────

@router.get("/ref/benefits")
async def get_benefits(db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    r = await db.execute(select(Benefit).order_by(Benefit.name_benefit))
    return [{"name": b.name_benefit, "points": b.bonus_points} for b in r.scalars()]


@router.get("/ref/regions")
async def get_regions(db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    r = await db.execute(select(Region).order_by(Region.name_region))
    return [{"id": reg.id_region, "name": reg.name_region} for reg in r.scalars()]


@router.get("/ref/cities")
async def get_cities(region: Optional[str] = None,
                     db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    q = select(City).join(Region, City.id_region == Region.id_region)
    if region:
        q = q.where(Region.name_region == region)
    r = await db.execute(q.order_by(City.name_city))
    return [c.name_city for c in r.scalars()]


@router.get("/ref/sources")
async def get_sources(db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    r = await db.execute(select(InformationSource).order_by(InformationSource.name_source))
    return [s.name_source for s in r.scalars()]




# ── Сброс AUTO_INCREMENT (admin only) ────────────────────────────────────────

@router.post("/admin/reset-autoincrement")
async def reset_autoincrement(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Сбрасывает AUTO_INCREMENT до MAX(id)+1. Вызывать после ручной чистки БД."""
    if current_user.role != "admin":
        raise HTTPException(403, "Только для администраторов")
    tables = [
        ("Applicant", "id_applicant"), ("Application", "id_application"),
        ("Additional_info", "id_info"), ("Parent", "id_parent"), ("Exam", "id_exam"),
    ]
    for table, col in tables:
        r = await db.execute(text(f"SELECT COALESCE(MAX({col}), 0) + 1 AS nxt FROM `{table}`"))
        nxt = r.scalar() or 1
        await db.execute(text(f"ALTER TABLE `{table}` AUTO_INCREMENT = {int(nxt)}"))


# ── Экзамены ──────────────────────────────────────────────────────────────────

class ExamItem(BaseModel):
    id_subject: int
    subject_name: Optional[str] = None
    score: float


class ExamsPayload(BaseModel):
    exams: List[ExamItem]


@router.get("/{applicant_id}/exams", response_model=List[ExamItem])
async def get_exams(
    applicant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sql = text("""
        SELECT e.id_subject, s.name_subject AS subject_name, e.score
        FROM Exam e
        JOIN Subject s ON e.id_subject = s.id_subject
        WHERE e.id_applicant = :aid
        ORDER BY s.name_subject
    """)
    rows = (await db.execute(sql, {"aid": applicant_id})).mappings().all()
    return [ExamItem(id_subject=r["id_subject"],
                     subject_name=r["subject_name"],
                     score=r["score"]) for r in rows]


@router.put("/{applicant_id}/exams")
async def save_exams(
    applicant_id: int,
    payload: ExamsPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "editor"):
        raise HTTPException(403, "Недостаточно прав")

    from models import Exam
    # Удаляем старые и вставляем новые (upsert через delete+insert)
    await db.execute(delete(Exam).where(Exam.id_applicant == applicant_id))

    for item in payload.exams:
        if item.id_subject and item.score is not None:
            db.add(Exam(
                id_applicant=applicant_id,
                id_subject=item.id_subject,
                score=item.score,
            ))

    # Пересчитываем рейтинг: сумма экзаменов + бонус льготы (base_rating не используется)
    sql = text("""
        SELECT
            COALESCE((SELECT SUM(b.bonus_points)
                      FROM Applicant_benefit ab
                      JOIN Benefit b ON ab.id_benefit = b.id_benefit
                      WHERE ab.id_applicant = :aid), 0) +
            COALESCE((SELECT SUM(score)
                      FROM Exam WHERE id_applicant = :aid), 0) AS total
        FROM dual
    """)
    await db.flush()
    row = (await db.execute(sql, {"aid": applicant_id})).mappings().first()
    if row:
        r = await db.execute(select(Applicant).where(Applicant.id_applicant == applicant_id))
        applicant = r.scalar_one_or_none()
        if applicant:
            applicant.rating = row["total"] or 0

    await db.commit()
    return {"ok": True}


@router.get("/ref/subjects")
async def get_subjects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models import Subject
    r = await db.execute(select(Subject).order_by(Subject.name_subject))
    return [{"id": s.id_subject, "name": s.name_subject} for s in r.scalars()]