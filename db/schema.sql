-- ============================================================
-- Реестр абитуриентов — схема MySQL
-- ============================================================
CREATE DATABASE IF NOT EXISTS applicantdb;

USE applicantdb;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- Справочники
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Region (
    id_region   INT AUTO_INCREMENT PRIMARY KEY,
    name_region VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS City (
    id_city   INT AUTO_INCREMENT PRIMARY KEY,
    name_city VARCHAR(255) NOT NULL,
    id_region INT,
    FOREIGN KEY (id_region) REFERENCES Region(id_region)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Institution привязана к городу: одна и та же школа в разных городах
-- считается разными записями. Уникальность — (name_institution, id_city).
CREATE TABLE IF NOT EXISTS Institution (
    id_institution   INT AUTO_INCREMENT PRIMARY KEY,
    name_institution VARCHAR(255) NOT NULL,
    id_city          INT,
    UNIQUE KEY uq_institution_city (name_institution, id_city),
    FOREIGN KEY (id_city) REFERENCES City(id_city)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Benefit (
    id_benefit   INT AUTO_INCREMENT PRIMARY KEY,
    name_benefit VARCHAR(255) NOT NULL,
    bonus_points INT          NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Information_source (
    id_source   INT AUTO_INCREMENT PRIMARY KEY,
    name_source VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Subject (
    id_subject   INT AUTO_INCREMENT PRIMARY KEY,
    name_subject VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Родитель / опекун
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Parent (
    id_parent INT AUTO_INCREMENT PRIMARY KEY,
    name      VARCHAR(100),
    phone     VARCHAR(20),
    relation  VARCHAR(50) DEFAULT 'Родитель'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Абитуриент
-- id_institution убран: школа теперь хранится в Application,
-- чтобы отразить, что заявление подаётся из конкретного учреждения.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Applicant (
    id_applicant INT AUTO_INCREMENT PRIMARY KEY,
    last_name    VARCHAR(100) NOT NULL,
    first_name   VARCHAR(100) NOT NULL,
    patronymic   VARCHAR(100),
    id_city      INT,
    phone        VARCHAR(20)  NOT NULL,
    vk           VARCHAR(255),
    id_parent    INT,
    rating       FLOAT        NOT NULL DEFAULT 0,
    FOREIGN KEY (id_city)   REFERENCES City(id_city)     ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (id_parent) REFERENCES Parent(id_parent) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Заявление
-- id_institution здесь: школа привязана к заявлению, а не к абитуриенту.
-- Это позволяет корректно разделять учреждения по городу через
-- Institution.id_city → City.id_city.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Application (
    id_application  INT AUTO_INCREMENT PRIMARY KEY,
    id_applicant    INT          NOT NULL,
    id_institution  INT,
    code            VARCHAR(50)  NOT NULL,
    base_rating     FLOAT        NOT NULL DEFAULT 0,
    has_original    TINYINT(1)   NOT NULL DEFAULT 0,
    submission_date DATE,
    form_education  VARCHAR(50)  NOT NULL DEFAULT 'Очная',
    FOREIGN KEY (id_applicant)   REFERENCES Applicant(id_applicant)
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_institution) REFERENCES Institution(id_institution)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Связь: Абитуриент ↔ Льгота  (M:N)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Applicant_benefit (
    id_applicant INT NOT NULL,
    id_benefit   INT NOT NULL,
    PRIMARY KEY (id_applicant, id_benefit),
    FOREIGN KEY (id_applicant) REFERENCES Applicant(id_applicant) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_benefit)   REFERENCES Benefit(id_benefit)     ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Дополнительная информация
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Additional_info (
    id_info          INT AUTO_INCREMENT PRIMARY KEY,
    id_applicant     INT NOT NULL,
    department_visit DATE,
    notes            TEXT,
    id_source        INT,
    dormitory_needed TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (id_applicant) REFERENCES Applicant(id_applicant)
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_source)    REFERENCES Information_source(id_source)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Экзамен (результаты сдачи предметов)
-- UNIQUE: один абитуриент — один раз сдаёт предмет
-- CHECK: балл от 0 до 100
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Exam (
    id_exam      INT AUTO_INCREMENT PRIMARY KEY,
    id_applicant INT   NOT NULL,
    id_subject   INT   NOT NULL,
    score        FLOAT NOT NULL DEFAULT 0,
    CONSTRAINT chk_score CHECK (score >= 0 AND score <= 100),
    UNIQUE KEY uq_applicant_subject (id_applicant, id_subject),
    FOREIGN KEY (id_applicant) REFERENCES Applicant(id_applicant) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_subject)   REFERENCES Subject(id_subject)     ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Пользователи системы
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Users (
    id_user       INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255),
    role          ENUM('admin','editor','viewer') NOT NULL DEFAULT 'viewer',
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by    INT,
    FOREIGN KEY (created_by) REFERENCES Users(id_user)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Лог аудита
-- applicant_id без FK: запись живёт дольше абитуриента
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS Audit_log (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    action        ENUM('create','update','delete') NOT NULL,
    applicant_id  INT,
    applicant_fio VARCHAR(255),
    field_name    VARCHAR(100),
    old_value     TEXT,
    new_value     TEXT,
    id_user       INT,
    changed_by    VARCHAR(100),
    changed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_user) REFERENCES Users(id_user)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- ТРИГГЕРЫ — пересчёт рейтинга
-- Рейтинг = base_rating из Application + SUM(bonus_points) льгот
-- ============================================================

DELIMITER $$

CREATE TRIGGER trg_recalc_rating_after_app_insert
AFTER INSERT ON Application FOR EACH ROW
BEGIN
    UPDATE Applicant a
    SET a.rating = (
        SELECT COALESCE(app.base_rating, 0)
               + COALESCE((
                   SELECT SUM(b.bonus_points)
                   FROM Applicant_benefit ab
                   JOIN Benefit b ON ab.id_benefit = b.id_benefit
                   WHERE ab.id_applicant = NEW.id_applicant
               ), 0)
        FROM Application app
        WHERE app.id_applicant = NEW.id_applicant
        LIMIT 1
    )
    WHERE a.id_applicant = NEW.id_applicant;
END$$

CREATE TRIGGER trg_recalc_rating_after_app_update
AFTER UPDATE ON Application FOR EACH ROW
BEGIN
    UPDATE Applicant a
    SET a.rating = (
        SELECT COALESCE(app.base_rating, 0)
               + COALESCE((
                   SELECT SUM(b.bonus_points)
                   FROM Applicant_benefit ab
                   JOIN Benefit b ON ab.id_benefit = b.id_benefit
                   WHERE ab.id_applicant = NEW.id_applicant
               ), 0)
        FROM Application app
        WHERE app.id_applicant = NEW.id_applicant
        LIMIT 1
    )
    WHERE a.id_applicant = NEW.id_applicant;
END$$

CREATE TRIGGER trg_recalc_rating_after_benefit_insert
AFTER INSERT ON Applicant_benefit FOR EACH ROW
BEGIN
    UPDATE Applicant a
    SET a.rating = (
        SELECT COALESCE(app.base_rating, 0)
               + COALESCE((
                   SELECT SUM(b.bonus_points)
                   FROM Applicant_benefit ab
                   JOIN Benefit b ON ab.id_benefit = b.id_benefit
                   WHERE ab.id_applicant = NEW.id_applicant
               ), 0)
        FROM Application app
        WHERE app.id_applicant = NEW.id_applicant
        LIMIT 1
    )
    WHERE a.id_applicant = NEW.id_applicant;
END$$

CREATE TRIGGER trg_recalc_rating_after_benefit_delete
AFTER DELETE ON Applicant_benefit FOR EACH ROW
BEGIN
    UPDATE Applicant a
    SET a.rating = (
        SELECT COALESCE(app.base_rating, 0)
               + COALESCE((
                   SELECT SUM(b.bonus_points)
                   FROM Applicant_benefit ab
                   JOIN Benefit b ON ab.id_benefit = b.id_benefit
                   WHERE ab.id_applicant = OLD.id_applicant
               ), 0)
        FROM Application app
        WHERE app.id_applicant = OLD.id_applicant
        LIMIT 1
    )
    WHERE a.id_applicant = OLD.id_applicant;
END$$

DELIMITER ;

-- ============================================================
-- VIEW
-- ============================================================

CREATE OR REPLACE VIEW v_applicants AS
SELECT
    a.id_applicant,
    a.last_name,
    a.first_name,
    a.patronymic,
    CONCAT_WS(' ', a.last_name, a.first_name, a.patronymic) AS full_name,
    c.name_city                   AS city,
    r.name_region                 AS region,
    a.phone,
    a.vk,
    a.rating,
    app.id_application,
    app.code,
    app.base_rating,
    app.has_original,
    app.submission_date,
    app.form_education,
    inst.name_institution         AS institution,
    ic.name_city                  AS institution_city,
    b.name_benefit                AS benefit,
    b.bonus_points,
    ai.department_visit,
    ai.notes,
    ai.dormitory_needed,
    isrc.name_source              AS information_source,
    p.name                        AS parent_name,
    p.phone                       AS parent_phone,
    p.relation                    AS parent_relation
FROM Applicant a
LEFT JOIN City c                  ON a.id_city          = c.id_city
LEFT JOIN Region r                ON c.id_region        = r.id_region
LEFT JOIN Application app         ON a.id_applicant     = app.id_applicant
LEFT JOIN Institution inst        ON app.id_institution = inst.id_institution
LEFT JOIN City ic                 ON inst.id_city       = ic.id_city
LEFT JOIN Applicant_benefit ab    ON a.id_applicant     = ab.id_applicant
LEFT JOIN Benefit b               ON ab.id_benefit      = b.id_benefit
LEFT JOIN Additional_info ai      ON a.id_applicant     = ai.id_applicant
LEFT JOIN Information_source isrc ON ai.id_source       = isrc.id_source
LEFT JOIN Parent p                ON a.id_parent        = p.id_parent;

-- ============================================================
-- Начальные данные
-- ============================================================

INSERT IGNORE INTO Benefit (name_benefit, bonus_points) VALUES
('Без льгот', 0), ('Сирота', 10), ('Инвалид I группы', 10),
('Инвалид II группы', 8), ('Инвалид III группы', 5),
('Участник СВО', 10), ('Ребенок участника СВО', 8),
('Ребенок погибшего участника СВО', 10), ('Многодетная семья', 3),
('Целевое обучение', 5), ('Отличник (аттестат с отличием)', 5),
('Золотая медаль', 10), ('Серебряная медаль', 7),
('Победитель олимпиады (всероссийская)', 10),
('Призер олимпиады (всероссийская)', 8),
('Победитель олимпиады (региональная)', 5),
('Призер олимпиады (региональная)', 3),
('ГТО (золотой знак)', 5), ('ГТО (серебряный знак)', 3),
('ГТО (бронзовый знак)', 2), ('Волонтер (более 100 часов)', 3),
('Спортивные достижения (КМС и выше)', 5),
('Творческие достижения (лауреат)', 3);

INSERT IGNORE INTO Information_source (name_source) VALUES
('Сайт учебного заведения'), ('Социальные сети'),
('Рекомендация друзей/знакомых'), ('Рекламные материалы'),
('День открытых дверей'), ('Ярмарка образования'),
('Поисковые системы (Google, Яндекс)'),
('Рекомендация учителей/родителей'),
('СМИ (газеты, телевидение)'), ('Другое');

INSERT INTO Subject (name_subject) VALUES
('Русский язык'), ('Математика (базовая)'), ('Математика (профильная)'),
('Физика'), ('Химия'), ('Биология'), ('Информатика и ИКТ'),
('История'), ('Обществознание'), ('Литература'),
('Иностранный язык (английский)'), ('Иностранный язык (немецкий)'),
('Иностранный язык (французский)'), ('География'),
('Черчение'), ('Физическая культура')
ON DUPLICATE KEY UPDATE name_subject = VALUES(name_subject);

INSERT INTO Region (name_region) VALUES
('Донецкая народная республика'), ('Луганская народная республика'),
('Херсонская область'), ('Запорожская область'), ('Ростовская область')
ON DUPLICATE KEY UPDATE name_region = VALUES(name_region);

INSERT INTO City (name_city, id_region)
SELECT c.name_city, r.id_region
FROM (VALUES
  ROW('Донецк','Донецкая народная республика'),
  ROW('Макеевка','Донецкая народная республика'),
  ROW('Горловка','Донецкая народная республика'),
  ROW('Мариуполь','Донецкая народная республика'),
  ROW('Енакиево','Донецкая народная республика'),
  ROW('Торез','Донецкая народная республика'),
  ROW('Снежное','Донецкая народная республика'),
  ROW('Шахтёрск','Донецкая народная республика'),
  ROW('Ясиноватая','Донецкая народная республика'),
  ROW('Харцызск','Донецкая народная республика'),
  ROW('Луганск','Луганская народная республика'),
  ROW('Алчевск','Луганская народная республика'),
  ROW('Стаханов','Луганская народная республика'),
  ROW('Брянка','Луганская народная республика'),
  ROW('Красный Луч','Луганская народная республика'),
  ROW('Свердловск','Луганская народная республика'),
  ROW('Ровеньки','Луганская народная республика'),
  ROW('Антрацит','Луганская народная республика'),
  ROW('Херсон','Херсонская область'),
  ROW('Каховка','Херсонская область'),
  ROW('Новая Каховка','Херсонская область'),
  ROW('Геническ','Херсонская область'),
  ROW('Скадовск','Херсонская область'),
  ROW('Запорожье','Запорожская область'),
  ROW('Мелитополь','Запорожская область'),
  ROW('Бердянск','Запорожская область'),
  ROW('Энергодар','Запорожская область'),
  ROW('Токмак','Запорожская область'),
  ROW('Пологи','Запорожская область'),
  ROW('Ростов-на-Дону','Ростовская область'),
  ROW('Таганрог','Ростовская область'),
  ROW('Шахты','Ростовская область'),
  ROW('Новочеркасск','Ростовская область'),
  ROW('Волгодонск','Ростовская область'),
  ROW('Батайск','Ростовская область'),
  ROW('Новошахтинск','Ростовская область'),
  ROW('Каменск-Шахтинский','Ростовская область'),
  ROW('Донецк (РО)','Ростовская область')
) AS c(name_city, region_name)
JOIN Region r ON r.name_region = c.region_name
WHERE NOT EXISTS (
  SELECT 1 FROM City ex
  WHERE ex.name_city = c.name_city AND ex.id_region = r.id_region
);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Сброс AUTO_INCREMENT (только на пустой базе)
-- ============================================================
ALTER TABLE Applicant          AUTO_INCREMENT = 1;
ALTER TABLE Application        AUTO_INCREMENT = 1;
ALTER TABLE Additional_info    AUTO_INCREMENT = 1;
ALTER TABLE Parent             AUTO_INCREMENT = 1;
ALTER TABLE Exam               AUTO_INCREMENT = 1;
ALTER TABLE City               AUTO_INCREMENT = 1;
ALTER TABLE Region             AUTO_INCREMENT = 1;
ALTER TABLE Institution        AUTO_INCREMENT = 1;
ALTER TABLE Benefit            AUTO_INCREMENT = 1;
ALTER TABLE Information_source AUTO_INCREMENT = 1;
ALTER TABLE Subject            AUTO_INCREMENT = 1;
ALTER TABLE Users              AUTO_INCREMENT = 1;