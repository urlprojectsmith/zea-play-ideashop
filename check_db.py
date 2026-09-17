
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv(dotenv_path='backend/.env')
db_url = os.getenv('VEE_DATABASE_URL')
if not db_url:
    print("VEE_DATABASE_URL not found")
    exit(1)

engine = create_engine(db_url)
with engine.connect() as conn:
    res = conn.execute(text('SELECT id, email, role, status FROM users'))
    rows = res.fetchall()
    for row in rows:
        print(f"ID: {row[0]}, Email: {row[1]}, Role: {row[2]}, Status: {row[3]}")
