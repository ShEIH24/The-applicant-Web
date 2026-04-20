"""models.py — ORM-модели SQLAlchemy"""
from sqlalchemy import (Column, Integer, String, Float, Date, Text,
                        Boolean, DateTime, ForeignKey, UniqueConstraint, Enum)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Region(Base):
    __tablename__ = "Region"
    id_region   = Column(Integer, primary_key=True, autoincrement=True)
    name_region = Column(String(255), nullable=False)
    cities      = relationship("City", back_populates="region")


class City(Base):
    __tablename__ = "City"
    id_city   = Column(Integer, primary_key=True, autoincrement=True)
    name_city = Column(String(255), nullable=False)
    id_region = Column(Integer, ForeignKey("Region.id_region", ondelete="SET NULL", onupdate="CASCADE"))
    region    = relationship("Region", back_populates="cities")


class Institution(Base):
    __tablename__ = "Institution"
    __table_args__ = (
        # Название уникально в пределах одного города: в разных городах —
        # допустимо (школа №1 в Москве ≠ школа №1 в Ростове)
        UniqueConstraint("name_institution", "id_city", name="uq_institution_name_city"),
    )
    id_institution   = Column(Integer, primary_key=True, autoincrement=True)
    name_institution = Column(String(255), nullable=False)
    id_city          = Column(Integer, ForeignKey("City.id_city", ondelete="RESTRICT", onupdate="CASCADE"), nullable=False)


class Benefit(Base):
    __tablename__ = "Benefit"
    id_benefit   = Column(Integer, primary_key=True, autoincrement=True)
    name_benefit = Column(String(255), nullable=False)
    bonus_points = Column(Integer, nullable=False, default=0)


class InformationSource(Base):
    __tablename__ = "Information_source"
    id_source   = Column(Integer, primary_key=True, autoincrement=True)
    name_source = Column(String(255), nullable=False)


class Subject(Base):
    __tablename__ = "Subject"
    id_subject   = Column(Integer, primary_key=True, autoincrement=True)
    name_subject = Column(String(255), nullable=False)


class Parent(Base):
    __tablename__ = "Parent"
    id_parent = Column(Integer, primary_key=True, autoincrement=True)
    name      = Column(String(100))
    phone     = Column(String(20))
    relation  = Column(String(50), default="Родитель")


class Applicant(Base):
    __tablename__ = "Applicant"
    id_applicant = Column(Integer, primary_key=True, autoincrement=True)
    last_name    = Column(String(100), nullable=False)
    first_name   = Column(String(100), nullable=False)
    patronymic   = Column(String(100))
    id_city      = Column(Integer, ForeignKey("City.id_city",   ondelete="SET NULL", onupdate="CASCADE"))
    phone        = Column(String(20), nullable=False)
    vk           = Column(String(255))
    id_parent      = Column(Integer, ForeignKey("Parent.id_parent",        ondelete="SET NULL", onupdate="CASCADE"))
    # id_institution перенесён в Application — место абитуриента может быть только в заявлении,
    # при этом Institution теперь сама привязана к City → петли City→…→City не возникает
    # итоговый рейтинг = сумма экзаменов + бонус льготы
    rating         = Column(Float, nullable=False, default=0)


class Application(Base):
    __tablename__ = "Application"
    id_application = Column(Integer, primary_key=True, autoincrement=True)
    id_applicant   = Column(Integer, ForeignKey("Applicant.id_applicant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    # Учебное заведение, откуда поступает абитуриент — привязано к заявлению
    id_institution = Column(Integer, ForeignKey("Institution.id_institution", ondelete="SET NULL", onupdate="CASCADE"))
    code           = Column(String(50), nullable=False)
    base_rating    = Column(Float, nullable=False, default=0)
    has_original   = Column(Boolean, nullable=False, default=False)
    submission_date = Column(Date)
    form_education = Column(String(50), nullable=False, default="Очная")



class ApplicantBenefit(Base):
    __tablename__ = "Applicant_benefit"
    id_applicant = Column(Integer, ForeignKey("Applicant.id_applicant", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True)
    id_benefit   = Column(Integer, ForeignKey("Benefit.id_benefit",     ondelete="CASCADE", onupdate="CASCADE"), primary_key=True)


class AdditionalInfo(Base):
    __tablename__ = "Additional_info"
    id_info          = Column(Integer, primary_key=True, autoincrement=True)
    id_applicant     = Column(Integer, ForeignKey("Applicant.id_applicant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    department_visit = Column(Date)
    notes            = Column(Text)
    id_source        = Column(Integer, ForeignKey("Information_source.id_source", ondelete="SET NULL", onupdate="CASCADE"))
    dormitory_needed = Column(Boolean, nullable=False, default=False)


class Exam(Base):
    __tablename__ = "Exam"
    __table_args__ = (UniqueConstraint("id_applicant", "id_subject", name="uq_applicant_subject"),)
    id_exam      = Column(Integer, primary_key=True, autoincrement=True)
    id_applicant = Column(Integer, ForeignKey("Applicant.id_applicant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    id_subject   = Column(Integer, ForeignKey("Subject.id_subject",     ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    score        = Column(Float, nullable=False, default=0)


class User(Base):
    __tablename__ = "Users"
    id_user       = Column(Integer, primary_key=True, autoincrement=True)
    username      = Column(String(100), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    full_name     = Column(String(255))
    role          = Column(Enum("admin", "editor", "viewer"), nullable=False, default="viewer")
    is_active     = Column(Boolean, nullable=False, default=True)
    created_at    = Column(DateTime, nullable=False, server_default=func.now())
    created_by    = Column(Integer, ForeignKey("Users.id_user", ondelete="SET NULL", onupdate="CASCADE"))

class AuditLog(Base):
    __tablename__ = "Audit_log"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    # тип действия: создание, изменение или удаление
    action        = Column(Enum("create", "update", "delete"), nullable=False)
    applicant_id  = Column(Integer)               # без FK — запись живёт дольше абитуриента
    applicant_fio = Column(String(255))           # ФИО на момент действия — страховка от удаления
    field_name    = Column(String(100))           # изменённое поле (только для action=update)
    old_value     = Column(Text)
    new_value     = Column(Text)
    # FK на пользователя — связь "пользователь совершает много действий"
    id_user       = Column(Integer, ForeignKey("Users.id_user", ondelete="SET NULL", onupdate="CASCADE"))
    changed_by    = Column(String(100))           # имя пользователя — страховка от удаления учётной записи
    changed_at    = Column(DateTime, nullable=False, server_default=func.now())