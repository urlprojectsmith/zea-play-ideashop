from sqlalchemy.exc import SQLAlchemyError

from app.database import Base, engine
from app.models import *
from app.tickets.models import *
from app.seed import seed_database


def ensure_pg_trgm_extension() -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")


def disable_trgm_indexes() -> None:
    for table in Base.metadata.tables.values():
        for index in list(table.indexes):
            if index.name == "ix_media_items_filename_trgm":
                table.indexes.discard(index)


try:
    ensure_pg_trgm_extension()
except SQLAlchemyError:
    disable_trgm_indexes()

try:
    Base.metadata.create_all(bind=engine)
except SQLAlchemyError as exc:
    message = str(exc).lower()
    if "gin_trgm_ops" not in message and "pg_trgm" not in message:
        raise
    disable_trgm_indexes()
    Base.metadata.create_all(bind=engine)

seed_database()

