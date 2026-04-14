"""database.py — подключение к БД через переменные окружения из .env"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

# параметры берутся из .env (load_dotenv() вызывается в main.py до этого импорта)
_HOST = os.getenv("DB_HOST",     "localhost")
_PORT = os.getenv("DB_PORT",     "3306")
_NAME = os.getenv("DB_NAME",     "applicantdb")
_USER = os.getenv("DB_USER",     "root")
_PASS = os.getenv("DB_PASSWORD", "Korol2212!")

# если DATABASE_URL задан явно — используем его, иначе собираем из частей
DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or f"mysql+aiomysql://{_USER}:{_PASS}@{_HOST}:{_PORT}/{_NAME}?charset=utf8mb4"
)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,   # проверяет живость соединения перед каждым запросом
    pool_recycle=3600,    # пересоздаёт соединения раз в час — защита от таймаута MySQL
)

# фабрика асинхронных сессий; expire_on_commit=False — объекты не сбрасываются после commit
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    # открывает сессию и автоматически закрывает её по выходу из with
    async with AsyncSessionLocal() as session:
        yield session