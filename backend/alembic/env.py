# ---------------------------- External Imports ----------------------------
from logging.config import fileConfig
import sys
import os
from dotenv import load_dotenv
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from alembic import context

# ---------------------------- Path Setup ----------------------------
# Make sure 'app' is importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# ---------------------------- Internal Imports ----------------------------
from app.database.base import Base  # Base metadata for all models
from app.user_table.user_model import User

# ---------------------------- Load Environment ----------------------------
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# ---------------------------- Alembic Config ----------------------------
config = context.config
config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata for autogenerate support
target_metadata = Base.metadata

# ---------------------------- Offline Migrations ----------------------------
def run_migrations_offline():
    """Run migrations in offline mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

# ---------------------------- Online Migrations ----------------------------
async def run_migrations_online():
    """Run migrations in online mode with async engine."""
    connectable = create_async_engine(DATABASE_URL, poolclass=pool.NullPool)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def do_run_migrations(connection: Connection):
    """Run Alembic migrations using a synchronous connection."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

# ---------------------------- Execute Migrations ----------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    import asyncio
    asyncio.run(run_migrations_online())
