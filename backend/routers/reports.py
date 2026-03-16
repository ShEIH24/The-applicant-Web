"""routers/reports.py — аналитика и отчёты (порт с десктопного приложения)"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db
from routers.auth import require_role

from fastapi import Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

logger = logging.getLogger("abiturient.reports")
router = APIRouter(tags=["reports"])
_ROLES = ("admin", "editor")
_templates = Jinja2Templates(directory="templates")


@router.get("/reports", response_class=HTMLResponse)
async def reports_page(request: Request):
    return _templates.TemplateResponse("reports.html", {"request": request})


@router.get("/api/reports/overview")
async def overview(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT
            COUNT(DISTINCT a.id_applicant)                              AS total,
            SUM(CASE WHEN app.has_original = 1 THEN 1 ELSE 0 END)      AS with_original,
            ROUND(AVG(a.rating), 2)                                     AS avg_rating,
            MAX(a.rating)                                               AS max_rating,
            MIN(a.rating)                                               AS min_rating,
            SUM(CASE WHEN ai.dormitory_needed = 1 THEN 1 ELSE 0 END)   AS need_dorm
        FROM Applicant a
        LEFT JOIN Application     app ON a.id_applicant = app.id_applicant
        LEFT JOIN Additional_info ai  ON a.id_applicant = ai.id_applicant
    """))
    return dict(r.mappings().one())


# ── Диаграммы ─────────────────────────────────────────────
@router.get("/api/reports/chart/sources")
async def chart_sources(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT COALESCE(isrc.name_source,'Не указано') AS source,
               COUNT(a.id_applicant) AS total
        FROM Applicant a
        LEFT JOIN Additional_info    ai   ON a.id_applicant = ai.id_applicant
        LEFT JOIN Information_source isrc ON ai.id_source   = isrc.id_source
        GROUP BY isrc.name_source ORDER BY total DESC
    """))
    return [dict(r) for r in r.mappings().all()]


@router.get("/api/reports/chart/cities")
async def chart_cities(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT COALESCE(c.name_city,'Не указан') AS city,
               COUNT(a.id_applicant) AS total
        FROM Applicant a LEFT JOIN City c ON a.id_city = c.id_city
        GROUP BY c.name_city ORDER BY total DESC LIMIT 10
    """))
    return [dict(r) for r in r.mappings().all()]


@router.get("/api/reports/chart/regions")
async def chart_regions(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT COALESCE(reg.name_region,'Не указан') AS region,
               COUNT(a.id_applicant) AS total
        FROM Applicant a
        LEFT JOIN City c ON a.id_city = c.id_city
        LEFT JOIN Region reg ON c.id_region = reg.id_region
        GROUP BY reg.name_region ORDER BY total DESC
    """))
    return [dict(r) for r in r.mappings().all()]


@router.get("/api/reports/chart/benefits")
async def chart_benefits(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT b.name_benefit AS benefit,
               COUNT(ab.id_applicant) AS total,
               ROUND(AVG(CAST(b.bonus_points AS DECIMAL(10,2))),1) AS avg_bonus
        FROM Applicant_benefit ab JOIN Benefit b ON ab.id_benefit = b.id_benefit
        GROUP BY b.name_benefit, b.bonus_points ORDER BY total DESC
    """))
    return [dict(r) for r in r.mappings().all()]


@router.get("/api/reports/chart/rating-distribution")
async def chart_rating(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT FLOOR(a.rating/10)*10 AS bucket,
               COUNT(*) AS total,
               SUM(CASE WHEN app.has_original=1 THEN 1 ELSE 0 END)   AS with_original,
               SUM(CASE WHEN COALESCE(app.has_original,0)=0 THEN 1 ELSE 0 END) AS without_original
        FROM Applicant a LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        WHERE a.rating IS NOT NULL
        GROUP BY FLOOR(a.rating/10)*10 ORDER BY bucket
    """))
    rows = [dict(r) for r in r.mappings().all()]
    avg_r = await db.execute(text("""
        SELECT ROUND(AVG(CASE WHEN app.has_original=1 THEN a.rating END),2)        AS avg_with,
               ROUND(AVG(CASE WHEN COALESCE(app.has_original,0)=0 THEN a.rating END),2) AS avg_without
        FROM Applicant a LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        WHERE a.rating IS NOT NULL
    """))
    avgs = dict(avg_r.mappings().one())
    return {"buckets": rows, "avg_with": avgs["avg_with"], "avg_without": avgs["avg_without"]}


# ── Статистика ────────────────────────────────────────────
@router.get("/api/reports/stats/cities")
async def stats_cities(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT COALESCE(reg.name_region,'Не указан') AS region,
               COALESCE(c.name_city,'Не указан')    AS city,
               COUNT(a.id_applicant)                 AS total,
               SUM(CASE WHEN app.has_original=1 THEN 1 ELSE 0 END) AS with_original,
               ROUND(AVG(a.rating),2) AS avg_rating,
               MAX(a.rating) AS max_rating, MIN(a.rating) AS min_rating
        FROM Applicant a
        LEFT JOIN City c ON a.id_city=c.id_city
        LEFT JOIN Region reg ON c.id_region=reg.id_region
        LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        GROUP BY reg.name_region,c.name_city ORDER BY total DESC
    """))
    return [dict(r) for r in r.mappings().all()]


@router.get("/api/reports/stats/sources")
async def stats_sources(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    total_r = await db.execute(text("SELECT COUNT(*) AS n FROM Applicant"))
    total_all = (total_r.mappings().one())["n"] or 1
    r = await db.execute(text("""
        SELECT COALESCE(isrc.name_source,'Не указано') AS source,
               COUNT(a.id_applicant) AS total,
               SUM(CASE WHEN app.has_original=1 THEN 1 ELSE 0 END) AS with_original,
               ROUND(AVG(a.rating),2) AS avg_rating
        FROM Applicant a
        LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        LEFT JOIN Additional_info ai ON a.id_applicant=ai.id_applicant
        LEFT JOIN Information_source isrc ON ai.id_source=isrc.id_source
        GROUP BY isrc.name_source ORDER BY total DESC
    """))
    rows = []
    for row in r.mappings().all():
        d = dict(row)
        d["percentage"] = round(d["total"] / total_all * 100, 2)
        rows.append(d)
    return rows


@router.get("/api/reports/stats/general")
async def stats_general(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    ov = await db.execute(text("""
        SELECT COUNT(DISTINCT a.id_applicant) AS total,
               SUM(CASE WHEN app.has_original=1 THEN 1 ELSE 0 END) AS with_original,
               ROUND(AVG(a.rating),2) AS avg_rating, MAX(a.rating) AS max_rating,
               SUM(CASE WHEN ai.dormitory_needed=1 THEN 1 ELSE 0 END) AS need_dorm
        FROM Applicant a
        LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        LEFT JOIN Additional_info ai ON a.id_applicant=ai.id_applicant
    """))
    br = await db.execute(text("""
        SELECT b.name_benefit, COUNT(ab.id_applicant) AS cnt
        FROM Applicant_benefit ab JOIN Benefit b ON ab.id_benefit=b.id_benefit
        GROUP BY b.name_benefit ORDER BY cnt DESC
    """))
    return {"overview": dict(ov.mappings().one()), "benefits": [dict(r) for r in br.mappings().all()]}


# ── Анализ проходного балла ───────────────────────────────
@router.get("/api/reports/passing-score")
async def passing_score(score: float, places: int,
    db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    if score < 0 or places < 1:
        raise HTTPException(400, "Некорректные параметры")
    r = await db.execute(text("""
        SELECT a.id_applicant AS id,
               CONCAT(a.last_name,' ',a.first_name,
                      CASE WHEN a.patronymic IS NOT NULL THEN CONCAT(' ',a.patronymic) ELSE '' END) AS fio,
               app.code, a.rating,
               COALESCE(b.name_benefit,'Без льгот') AS benefit,
               COALESCE(b.bonus_points,0) AS bonus_points,
               COALESCE(app.has_original,0) AS has_original
        FROM Applicant a
        LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        LEFT JOIN Applicant_benefit ab ON a.id_applicant=ab.id_applicant
        LEFT JOIN Benefit b ON ab.id_benefit=b.id_benefit
        ORDER BY app.has_original DESC, a.rating DESC
    """))
    rows = [dict(r) for r in r.mappings().all()]
    reserve_threshold = score * 0.95
    orig_idx = no_orig_idx = passed = reserve = failed = 0
    LABELS = {
        "passes":"🟢 Проходит","reserve":"🟡 В резерве","fails":"🔴 Не проходит",
        "no_orig_passes":"⚪ Проходит*","no_orig_reserve":"⚪ В резерве*","no_orig_fails":"⚪ Не проходит*",
    }
    TAGS = {
        "passes":"green","reserve":"yellow","fails":"red",
        "no_orig_passes":"gray_green","no_orig_reserve":"gray_yellow","no_orig_fails":"gray_red",
    }
    result = []
    for row in rows:
        has_orig = bool(row["has_original"]); rating = row["rating"] or 0
        if has_orig:
            orig_idx += 1
            key = ("passes" if rating>=score else "reserve") if orig_idx<=places else ("reserve" if rating>=reserve_threshold else "fails")
            pos = orig_idx
            if key=="passes": passed+=1
            elif key=="reserve": reserve+=1
            else: failed+=1
        else:
            no_orig_idx += 1; pot = orig_idx+no_orig_idx
            key = ("no_orig_passes" if rating>=score else "no_orig_reserve") if pot<=places else ("no_orig_reserve" if rating>=reserve_threshold else "no_orig_fails")
            pos = None; reserve+=1
        result.append({**row,"status":LABELS[key],"status_key":key,"tag":TAGS[key],"position":pos,"has_original":has_orig})
    return {"rows":result,"summary":{"passes":passed,"reserve":reserve,"fails":failed,"with_original":orig_idx,"without_original":no_orig_idx}}


# ── Прогнозирование ───────────────────────────────────────
@router.get("/api/reports/forecast/passing-score")
async def forecast_passing(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT a.rating FROM Applicant a
        JOIN Application app ON a.id_applicant=app.id_applicant
        WHERE app.has_original=1 AND a.rating IS NOT NULL ORDER BY a.rating
    """))
    ratings = [row[0] for row in r.fetchall()]
    if not ratings:
        return {"error": "Нет абитуриентов с оригиналами"}
    n = len(ratings); avg = round(sum(ratings)/n, 2)
    std = round((sum((x-avg)**2 for x in ratings)/n)**0.5, 2)
    return {
        "count": n, "avg": avg, "median": ratings[n//2], "std": std,
        "min": ratings[0], "max": ratings[-1],
        "q1": ratings[n//4], "q3": ratings[3*n//4],
        "forecast_conservative": ratings[int(n*0.75)],
        "forecast_optimistic":   ratings[n//2],
        "forecast_safe":         round(avg+std, 2),
        "forecast_critical_min": ratings[n//4],
    }


@router.get("/api/reports/forecast/dormitory")
async def forecast_dormitory(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT COUNT(DISTINCT a.id_applicant) AS total,
               SUM(CASE WHEN ai.dormitory_needed=1 THEN 1 ELSE 0 END) AS need_dorm,
               SUM(CASE WHEN ai.dormitory_needed=1 AND app.has_original=1 THEN 1 ELSE 0 END) AS need_dorm_with_orig
        FROM Applicant a
        LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        LEFT JOIN Additional_info ai ON a.id_applicant=ai.id_applicant
    """))
    ov = dict(r.mappings().one())
    cr = await db.execute(text("""
        SELECT COALESCE(c.name_city,'Не указан') AS city,
               COUNT(a.id_applicant) AS total,
               SUM(CASE WHEN ai.dormitory_needed=1 THEN 1 ELSE 0 END) AS need_dorm
        FROM Applicant a
        LEFT JOIN Additional_info ai ON a.id_applicant=ai.id_applicant
        LEFT JOIN City c ON a.id_city=c.id_city
        GROUP BY c.name_city HAVING SUM(CASE WHEN ai.dormitory_needed=1 THEN 1 ELSE 0 END)>0
        ORDER BY need_dorm DESC
    """))
    nd = int(ov["need_dorm_with_orig"] or 0)
    cities_raw = [dict(r) for r in cr.mappings().all()]
    for c in cities_raw:
        c["total"]     = int(c["total"] or 0)
        c["need_dorm"] = int(c["need_dorm"] or 0)
    return {
        "total":               int(ov["total"] or 0),
        "need_dorm":           int(ov["need_dorm"] or 0),
        "need_dorm_with_orig": nd,
        "cities":              cities_raw,
        "forecast_min":        nd,
        "forecast_reserve":    round(nd * 1.2),
        "forecast_max":        int(ov["need_dorm"] or 0),
    }


@router.get("/api/reports/forecast/sources")
async def forecast_sources(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    r = await db.execute(text("""
        SELECT COALESCE(isrc.name_source,'Не указано') AS source,
               COUNT(a.id_applicant) AS total,
               SUM(CASE WHEN app.has_original=1 THEN 1 ELSE 0 END) AS with_original,
               ROUND(AVG(a.rating),2) AS avg_rating, MAX(a.rating) AS max_rating
        FROM Applicant a
        LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        LEFT JOIN Additional_info ai ON a.id_applicant=ai.id_applicant
        LEFT JOIN Information_source isrc ON ai.id_source=isrc.id_source
        GROUP BY isrc.name_source ORDER BY total DESC
    """))
    rows = []
    for row in r.mappings().all():
        d = dict(row)
        d["total"]        = int(d["total"] or 0)
        d["with_original"]= int(d["with_original"] or 0)
        d["avg_rating"]   = float(d["avg_rating"]) if d["avg_rating"] is not None else None
        d["max_rating"]   = float(d["max_rating"]) if d["max_rating"] is not None else None
        d["conversion"] = round(d["with_original"]/d["total"]*100, 1) if d["total"] else 0
        d["effectiveness"] = "ВЫСОКАЯ" if d["conversion"]>=70 else ("СРЕДНЯЯ" if d["conversion"]>=50 else "НИЗКАЯ")
        rows.append(d)
    total_all = sum(r["total"] for r in rows)
    max_total = max((r["total"] for r in rows), default=1)

    for r in rows:
        r["market_share"] = round(r["total"] / total_all * 100, 1) if total_all else 0
        # Взвешенный скор = конверсия × (кол-во / макс_кол-во)^0.5
        # Это даёт приоритет источникам с высокой конверсией И значимым объёмом.
        # Источник с 100% конверсией и 1 человеком получит низкий скор.
        volume_weight = (r["total"] / max_total) ** 0.5
        r["score"] = round(r["conversion"] * volume_weight, 1)

        # Эффективность теперь по скору, а не только по конверсии
        if r["score"] >= 40:
            r["effectiveness"] = "ВЫСОКАЯ"
        elif r["score"] >= 15:
            r["effectiveness"] = "СРЕДНЯЯ"
        else:
            r["effectiveness"] = "НИЗКАЯ"

    return {
        "rows":  rows,
        # Лучшие — по взвешенному скору (конверсия × объём)
        "best":  sorted(rows, key=lambda x: x["score"], reverse=True)[:3],
        # Худшие — только среди источников с минимум 2 абитуриентами
        "worst": sorted(
            [r for r in rows if r["total"] >= 2],
            key=lambda x: x["score"]
        )[:3],
    }


@router.get("/api/reports/forecast/geographic")
async def forecast_geographic(db: AsyncSession = Depends(get_db), _=Depends(require_role(*_ROLES))):
    rr = await db.execute(text("""
        SELECT COALESCE(reg.name_region,'Не указан') AS region,
               COUNT(a.id_applicant) AS total,
               SUM(CASE WHEN app.has_original=1 THEN 1 ELSE 0 END) AS with_original,
               ROUND(AVG(a.rating),2) AS avg_rating,
               SUM(CASE WHEN ai.dormitory_needed=1 THEN 1 ELSE 0 END) AS need_dorm
        FROM Applicant a
        LEFT JOIN City c ON a.id_city=c.id_city
        LEFT JOIN Region reg ON c.id_region=reg.id_region
        LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        LEFT JOIN Additional_info ai ON a.id_applicant=ai.id_applicant
        GROUP BY reg.name_region ORDER BY total DESC
    """))
    regions = [dict(r) for r in rr.mappings().all()]
    cr = await db.execute(text("""
        SELECT COALESCE(c.name_city,'Не указан') AS city,
               COALESCE(reg.name_region,'Не указан') AS region,
               COUNT(a.id_applicant) AS total,
               SUM(CASE WHEN app.has_original=1 THEN 1 ELSE 0 END) AS with_original,
               ROUND(AVG(a.rating),2) AS avg_rating
        FROM Applicant a
        LEFT JOIN City c ON a.id_city=c.id_city
        LEFT JOIN Region reg ON c.id_region=reg.id_region
        LEFT JOIN Application app ON a.id_applicant=app.id_applicant
        GROUP BY c.name_city,reg.name_region ORDER BY total DESC LIMIT 10
    """))
    cities = [dict(r) for r in cr.mappings().all()]
    # Приводим все Decimal → int/float для безопасной арифметики
    for r in regions:
        r["total"]        = int(r["total"] or 0)
        r["with_original"]= int(r["with_original"] or 0)
        r["need_dorm"]    = int(r["need_dorm"] or 0)
        r["avg_rating"]   = float(r["avg_rating"]) if r["avg_rating"] is not None else None
    for c in cities:
        c["total"]        = int(c["total"] or 0)
        c["with_original"]= int(c["with_original"] or 0)
        c["avg_rating"]   = float(c["avg_rating"]) if c["avg_rating"] is not None else None
    total_all = sum(r["total"] for r in regions)
    for r in regions:
        r["share"]      = round(r["total"]/total_all*100, 1) if total_all else 0
        r["conversion"] = round(r["with_original"]/r["total"]*100, 1) if r["total"] else 0
        r["dorm_rate"]  = round(r["need_dorm"]/r["total"]*100, 1) if r["total"] else 0
    top = regions[0] if regions else {}
    return {"regions": regions, "cities": cities, "total_all": total_all,
            "top_region": top, "low_regions": [r for r in regions if r["total"] < total_all*0.1][:3],
            "forecast_next_year": round(total_all*1.12)}