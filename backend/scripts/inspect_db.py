import asyncio
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.database import engine
from sqlalchemy import text

async def main():
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'document_chunks'"))
        rows = res.fetchall()
        print("Indexes on document_chunks:")
        for r in rows:
            print(f"- {r[0]}: {r[1]}")

if __name__ == '__main__':
    asyncio.run(main())
