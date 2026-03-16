# reset_password.py — запускать только локально
import asyncio
from database import get_db
from models import User
from sqlalchemy import select
from routers.auth import hash_password

async def reset():
    async for db in get_db():
        r = await db.execute(select(User).where(User.username == 'admin'))
        user = r.scalar_one_or_none()
        if not user:
            print('Пользователь admin не найден')
            return
        new_hash = hash_password('KorolAdmin2212!')
        user.password_hash = new_hash
        await db.commit()
        print(f'Пароль обновлён для: {user.username}')

asyncio.run(reset())

