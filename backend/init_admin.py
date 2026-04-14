"""
init_admin.py — скрипт для создания первого администратора.

Запуск:
    python init_admin.py --username admin --password MySecret123 --name "Иван Иванов"
"""
import asyncio
import argparse
import bcrypt
import os
import sys

# добавляем директорию скрипта в путь поиска модулей
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from models import Base, User

# подключение берётся из переменной окружения, иначе — дефолтная строка
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+aiomysql://root:Korol2212!@localhost:3306/applicantdb?charset=utf8mb4"
)


def hash_password(plain: str) -> str:
    # солим и хешируем пароль через bcrypt
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def create_admin(username: str, password: str, full_name: str):
    engine = create_async_engine(DATABASE_URL, echo=False)

    # создаём таблицы если их ещё нет
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # проверяем — вдруг такой пользователь уже есть
        result = await session.execute(select(User).where(User.username == username))
        if result.scalar_one_or_none():
            print(f"[!] Пользователь '{username}' уже существует.")
            await engine.dispose()
            return

        # создаём запись администратора
        admin = User(
            username      = username,
            password_hash = hash_password(password),
            full_name     = full_name,
            role          = "admin",
            is_active     = True,
        )
        session.add(admin)
        await session.commit()
        print(f"[✓] Администратор '{username}' успешно создан.")

    # закрываем пул соединений
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Создание первого администратора")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Главный администратор")
    args = parser.parse_args()

    asyncio.run(create_admin(args.username, args.password, args.name))