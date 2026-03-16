-- schema.sql — полная схема БД «Реестр абитуриентов»

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── Создаём БД если не существует ───────────────────────────────
CREATE DATABASE IF NOT EXISTS applicantdb
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE applicantdb;

-- ================================================================
-- СПРАВОЧНИКИ
-- ================================================================

-- Регионы
CREATE TABLE IF NOT EXISTS Region (
    id_region   INT          NOT NULL AUTO_INCREMENT,
    name_region VARCHAR(255) NOT NULL,
    PRIMARY KEY (id_region),
    CONSTRAINT uq_region_name UNIQUE (name_region)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Города
CREATE TABLE IF NOT EXISTS City (
    id_city    INT          NOT NULL AUTO_INCREMENT,
    name_city  VARCHAR(255) NOT NULL,
    id_region  INT          NULL,
    PRIMARY KEY (id_city),
    CONSTRAINT fk_city_region
        FOREIGN KEY (id_region) REFERENCES Region (id_region)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Льготы
CREATE TABLE IF NOT EXISTS Benefit (
    id_benefit   INT          NOT NULL AUTO_INCREMENT,
    name_benefit VARCHAR(255) NOT NULL,
    bonus_points INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id_benefit),
    CONSTRAINT uq_benefit_name UNIQUE (name_benefit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Источники информации
CREATE TABLE IF NOT EXISTS Information_source (
    id_source   INT          NOT NULL AUTO_INCREMENT,
    name_source VARCHAR(255) NOT NULL,
    PRIMARY KEY (id_source),
    CONSTRAINT uq_source_name UNIQUE (name_source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Учреждения (школы/колледжи откуда пришёл абитуриент)
CREATE TABLE IF NOT EXISTS Institution (
    id_institution   INT          NOT NULL AUTO_INCREMENT,
    name_institution VARCHAR(500) NOT NULL,
    id_city          INT          NULL,
    PRIMARY KEY (id_institution),
    CONSTRAINT fk_institution_city
        FOREIGN KEY (id_city) REFERENCES City (id_city)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Предметы ЕГЭ
CREATE TABLE IF NOT EXISTS Subject (
    id_subject   INT          NOT NULL AUTO_INCREMENT,
    name_subject VARCHAR(255) NOT NULL,
    PRIMARY KEY (id_subject),
    CONSTRAINT uq_subject_name UNIQUE (name_subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- ПОЛЬЗОВАТЕЛИ СИСТЕМЫ
-- ================================================================

CREATE TABLE IF NOT EXISTS User (
    id_user       INT          NOT NULL AUTO_INCREMENT,
    username      VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL DEFAULT '',
    role          ENUM('admin','editor','viewer') NOT NULL DEFAULT 'viewer',
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_user),
    CONSTRAINT uq_username UNIQUE (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- АБИТУРИЕНТЫ
-- ================================================================

-- Родители / законные представители
CREATE TABLE IF NOT EXISTS Parent (
    id_parent INT          NOT NULL AUTO_INCREMENT,
    name      VARCHAR(255) NOT NULL,
    phone     VARCHAR(30)  NULL,
    relation  VARCHAR(100) NOT NULL DEFAULT 'Родитель',
    PRIMARY KEY (id_parent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Основная таблица абитуриентов
CREATE TABLE IF NOT EXISTS Applicant (
    id_applicant INT          NOT NULL AUTO_INCREMENT,
    last_name    VARCHAR(100) NOT NULL,
    first_name   VARCHAR(100) NOT NULL,
    patronymic   VARCHAR(100) NULL,
    phone        VARCHAR(30)  NULL,
    vk           VARCHAR(255) NULL,
    rating       DECIMAL(8,2) NOT NULL DEFAULT 0,
    id_city      INT          NULL,
    id_parent    INT          NULL,
    PRIMARY KEY (id_applicant),
    CONSTRAINT fk_applicant_city
        FOREIGN KEY (id_city) REFERENCES City (id_city)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_applicant_parent
        FOREIGN KEY (id_parent) REFERENCES Parent (id_parent)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Заявление (код специальности, форма обучения, оригинал)
CREATE TABLE IF NOT EXISTS Application (
    id_application  INT          NOT NULL AUTO_INCREMENT,
    id_applicant    INT          NOT NULL,
    code            VARCHAR(20)  NULL      COMMENT 'Код специальности, напр. 09.03.01',
    base_rating     DECIMAL(8,2) NOT NULL DEFAULT 0,
    has_original    TINYINT(1)   NOT NULL DEFAULT 0,
    submission_date DATE         NULL,
    form_education  VARCHAR(50)  NOT NULL DEFAULT 'Очная',
    id_institution  INT          NULL,
    PRIMARY KEY (id_application),
    CONSTRAINT fk_app_applicant
        FOREIGN KEY (id_applicant) REFERENCES Applicant (id_applicant)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_app_institution
        FOREIGN KEY (id_institution) REFERENCES Institution (id_institution)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Льготы абитуриента (связь многие-ко-многим)
CREATE TABLE IF NOT EXISTS Applicant_benefit (
    id_applicant INT NOT NULL,
    id_benefit   INT NOT NULL,
    PRIMARY KEY (id_applicant, id_benefit),
    CONSTRAINT fk_ab_applicant
        FOREIGN KEY (id_applicant) REFERENCES Applicant (id_applicant)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ab_benefit
        FOREIGN KEY (id_benefit) REFERENCES Benefit (id_benefit)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Дополнительная информация
CREATE TABLE IF NOT EXISTS Additional_info (
    id_info          INT      NOT NULL AUTO_INCREMENT,
    id_applicant     INT      NOT NULL,
    department_visit DATE     NULL      COMMENT 'Дата посещения приёмной комиссии',
    notes            TEXT     NULL,
    id_source        INT      NULL,
    dormitory_needed TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_info),
    CONSTRAINT fk_ai_applicant
        FOREIGN KEY (id_applicant) REFERENCES Applicant (id_applicant)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ai_source
        FOREIGN KEY (id_source) REFERENCES Information_source (id_source)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Результаты ЕГЭ
CREATE TABLE IF NOT EXISTS Exam (
    id_exam      INT          NOT NULL AUTO_INCREMENT,
    id_applicant INT          NOT NULL,
    id_subject   INT          NOT NULL,
    score        DECIMAL(5,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_exam),
    CONSTRAINT fk_exam_applicant
        FOREIGN KEY (id_applicant) REFERENCES Applicant (id_applicant)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_exam_subject
        FOREIGN KEY (id_subject) REFERENCES Subject (id_subject)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- АУДИТ
-- ================================================================

CREATE TABLE IF NOT EXISTS Audit_log (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    action          ENUM('create','update','delete') NOT NULL,
    applicant_id    INT          NOT NULL,
    applicant_fio   VARCHAR(255) NOT NULL,
    field_name      VARCHAR(100) NULL,
    old_value       TEXT         NULL,
    new_value       TEXT         NULL,
    changed_by      VARCHAR(100) NOT NULL,
    changed_by_role VARCHAR(20)  NOT NULL,
    changed_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_applicant  (applicant_id),
    INDEX idx_audit_changed_at (changed_at),
    INDEX idx_audit_changed_by (changed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- ТРИГГЕРЫ — автоматический пересчёт рейтинга
-- ================================================================

-- Рейтинг = сумма баллов ЕГЭ + бонусные баллы льгот

DELIMITER $$

-- После добавления/изменения оценки ЕГЭ
CREATE TRIGGER IF NOT EXISTS trg_exam_after_insert
AFTER INSERT ON Exam
FOR EACH ROW
BEGIN
    UPDATE Applicant SET rating = (
        COALESCE((SELECT SUM(score) FROM Exam WHERE id_applicant = NEW.id_applicant), 0) +
        COALESCE((SELECT SUM(b.bonus_points)
                  FROM Applicant_benefit ab
                  JOIN Benefit b ON ab.id_benefit = b.id_benefit
                  WHERE ab.id_applicant = NEW.id_applicant), 0)
    ) WHERE id_applicant = NEW.id_applicant;
END$$

CREATE TRIGGER IF NOT EXISTS trg_exam_after_update
AFTER UPDATE ON Exam
FOR EACH ROW
BEGIN
    UPDATE Applicant SET rating = (
        COALESCE((SELECT SUM(score) FROM Exam WHERE id_applicant = NEW.id_applicant), 0) +
        COALESCE((SELECT SUM(b.bonus_points)
                  FROM Applicant_benefit ab
                  JOIN Benefit b ON ab.id_benefit = b.id_benefit
                  WHERE ab.id_applicant = NEW.id_applicant), 0)
    ) WHERE id_applicant = NEW.id_applicant;
END$$

CREATE TRIGGER IF NOT EXISTS trg_exam_after_delete
AFTER DELETE ON Exam
FOR EACH ROW
BEGIN
    UPDATE Applicant SET rating = (
        COALESCE((SELECT SUM(score) FROM Exam WHERE id_applicant = OLD.id_applicant), 0) +
        COALESCE((SELECT SUM(b.bonus_points)
                  FROM Applicant_benefit ab
                  JOIN Benefit b ON ab.id_benefit = b.id_benefit
                  WHERE ab.id_applicant = OLD.id_applicant), 0)
    ) WHERE id_applicant = OLD.id_applicant;
END$$

-- После добавления/удаления льготы
CREATE TRIGGER IF NOT EXISTS trg_benefit_after_insert
AFTER INSERT ON Applicant_benefit
FOR EACH ROW
BEGIN
    UPDATE Applicant SET rating = (
        COALESCE((SELECT SUM(score) FROM Exam WHERE id_applicant = NEW.id_applicant), 0) +
        COALESCE((SELECT SUM(b.bonus_points)
                  FROM Applicant_benefit ab
                  JOIN Benefit b ON ab.id_benefit = b.id_benefit
                  WHERE ab.id_applicant = NEW.id_applicant), 0)
    ) WHERE id_applicant = NEW.id_applicant;
END$$

CREATE TRIGGER IF NOT EXISTS trg_benefit_after_delete
AFTER DELETE ON Applicant_benefit
FOR EACH ROW
BEGIN
    UPDATE Applicant SET rating = (
        COALESCE((SELECT SUM(score) FROM Exam WHERE id_applicant = OLD.id_applicant), 0) +
        COALESCE((SELECT SUM(b.bonus_points)
                  FROM Applicant_benefit ab
                  JOIN Benefit b ON ab.id_benefit = b.id_benefit
                  WHERE ab.id_applicant = OLD.id_applicant), 0)
    ) WHERE id_applicant = OLD.id_applicant;
END$$

DELIMITER ;

-- ================================================================
-- НАЧАЛЬНЫЕ ДАННЫЕ СПРАВОЧНИКОВ
-- ================================================================

-- Льготы
INSERT IGNORE INTO Benefit (name_benefit, bonus_points) VALUES
    ('Отличник (аттестат с отличием)',    10),
    ('Золотая медаль',                     10),
    ('Серебряная медаль',                   5),
    ('Сирота',                             10),
    ('Инвалид I группы',                   10),
    ('Инвалид II группы',                  10),
    ('Инвалид III группы',                  5),
    ('Ребёнок-инвалид',                    10),
    ('Ребёнок участника СВО',              10),
    ('Участник СВО',                       10),
    ('Ребёнок военнослужащего',             5),
    ('Волонтёр (более 100 часов)',          5),
    ('ГТО (золотой знак)',                  5),
    ('ГТО (серебряный знак)',               3),
    ('ГТО (бронзовый знак)',                2),
    ('Творческие достижения (лауреат)',     5),
    ('Победитель олимпиады',               10),
    ('Призёр олимпиады',                    5);

-- Источники информации
INSERT IGNORE INTO Information_source (name_source) VALUES
    ('Сайт учебного заведения'),
    ('Социальные сети'),
    ('Рекомендация друзей/знакомых'),
    ('Рекомендация учителей/родителей'),
    ('День открытых дверей'),
    ('Поисковые системы (Google, Яндекс)'),
    ('Рекламные материалы'),
    ('СМИ (газеты, телевидение)'),
    ('Ярмарка образования'),
    ('Другое');

-- Предметы ЕГЭ
INSERT IGNORE INTO Subject (name_subject) VALUES
    ('Русский язык'),
    ('Математика'),
    ('Физика'),
    ('Химия'),
    ('Биология'),
    ('Информатика'),
    ('Информатика и ИКТ'),
    ('История'),
    ('Обществознание'),
    ('География'),
    ('Литература'),
    ('Иностранный язык'),
    ('Иностранный язык (английский)'),
    ('Иностранный язык (немецкий)'),
    ('Иностранный язык (французский)');

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Schema created successfully' AS status;