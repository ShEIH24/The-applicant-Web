# reset_password.py — запускать только локально
import asyncio
from database import get_db
from models import User
from sqlalchemy import select
from routers.auth import hash_password

async def reset():
    # получаем сессию через генератор get_db
    async for db in get_db():
        # ищем пользователя admin в базе
        r = await db.execute(select(User).where(User.username == 'admin'))
        user = r.scalar_one_or_none()
        if not user:
            print('Пользователь admin не найден')
            return
        # хешируем новый пароль и сохраняем
        new_hash = hash_password('')
        user.password_hash = new_hash
        await db.commit()
        print(f'Пароль обновлён для: {user.username}')

asyncio.run(reset())