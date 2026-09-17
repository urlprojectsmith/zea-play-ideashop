from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))
url = os.environ.get('VEE_DATABASE_URL')
if not url:
    raise SystemExit('VEE_DATABASE_URL not found in .env')

engine = create_engine(url)
with engine.connect() as conn:
    conn.execute(text('CREATE EXTENSION IF NOT EXISTS pg_trgm'))
    conn.commit()
print('✅ pg_trgm extension enabled')
