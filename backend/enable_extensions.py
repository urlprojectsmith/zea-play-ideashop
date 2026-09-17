"""Enable required PostgreSQL extensions."""
from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Enable pg_trgm extension for trigram text search
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    conn.commit()
    print("✅ PostgreSQL extensions enabled successfully!")
