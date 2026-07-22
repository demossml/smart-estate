#!/usr/bin/env python3
"""
Migrate smart-estate from DuckDB to SQLite.
Reads from DuckDB, writes to SQLite with optimised schema for IoT.
"""

import duckdb
import sqlite3
import os
import sys
from decimal import Decimal
from pathlib import Path

DUCKDB_PATH = os.path.expanduser('~/smart-estate/data/smart-estate.duckdb')
SQLITE_PATH = os.path.expanduser('~/smart-estate/data/smart-estate.db')

# ── DuckDB → SQLite type mapping ──
TYPE_MAP = {
    'VARCHAR': 'TEXT',
    'INTEGER': 'INTEGER',
    'BIGINT': 'INTEGER',
    'BOOLEAN': 'INTEGER',
    'TIMESTAMP': 'TEXT',       # ISO-8601 strings
    'TIMESTAMP WITH TIME ZONE': 'TEXT',
    'TIMESTAMP_S': 'TEXT',
    'DOUBLE': 'REAL',
    'FLOAT': 'REAL',
    'BLOB': 'BLOB',
}

def duck_type_to_sqlite(dtype: str) -> str:
    """Convert DuckDB type to SQLite affinity."""
    upper = dtype.upper()
    for duck, sqlite in TYPE_MAP.items():
        if duck in upper:
            return sqlite
    return 'TEXT'  # fallback


def migrate():
    print(f"🔄 DuckDB: {DUCKDB_PATH}")
    print(f"🎯 SQLite:  {SQLITE_PATH}")

    if not os.path.exists(DUCKDB_PATH):
        print(f"❌ DuckDB file not found: {DUCKDB_PATH}")
        sys.exit(1)

    if os.path.exists(SQLITE_PATH):
        print(f"⚠️  SQLite file exists, removing...")
        os.remove(SQLITE_PATH)

    # Connect
    ddb = duckdb.connect(DUCKDB_PATH)
    slt = sqlite3.connect(SQLITE_PATH)
    slt.execute("PRAGMA journal_mode=WAL;")
    slt.execute("PRAGMA synchronous=NORMAL;")
    slt.execute("PRAGMA cache_size=-8000;")  # 8 MB cache

    # Get all tables
    tables = ddb.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
    ).fetchall()

    for (table_name,) in tables:
        print(f"\n📦 {table_name}...")

        # Get columns
        cols = ddb.execute(f"""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = '{table_name}'
            ORDER BY ordinal_position
        """).fetchall()

        if not cols:
            print(f"   ⏭  no columns, skip")
            continue

        # Build CREATE TABLE
        col_defs = []
        for col_name, data_type, nullable, default in cols:
            sql_type = duck_type_to_sqlite(data_type)
            parts = [f'"{col_name}" {sql_type}']
            if nullable == 'NO' and default is None:
                parts.append('NOT NULL')
            if default is not None:
                # Clean DuckDB default values
                d = str(default).replace("'", "").replace('"', '').strip()
                if d and d not in ('NULL',):
                    parts.append(f"DEFAULT '{d}'")
            col_defs.append(' '.join(parts))

        create_sql = f'CREATE TABLE IF NOT EXISTS "{table_name}" (\n  {", ".join(col_defs)}\n)'
        slt.execute(create_sql)
        print(f"   ✅ Created table")

        # Read all data from DuckDB
        rows = ddb.execute(f'SELECT * FROM "{table_name}"').fetchall()
        if not rows:
            print(f"   (empty)")
            continue

        # Convert DuckDB types to Python-native
        converted = []
        for row in rows:
            fixed = []
            for val in row:
                if isinstance(val, bytes):
                    fixed.append(val)
                elif isinstance(val, (int, float, str, type(None), bool)):
                    fixed.append(val)
                elif isinstance(val, Decimal):
                    fixed.append(float(val))
                else:
                    fixed.append(str(val) if val is not None else None)
            converted.append(tuple(fixed))

        # INSERT
        placeholders = ", ".join(["?" for _ in cols])
        col_names = ", ".join([f'"{c[0]}"' for c in cols])
        insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES ({placeholders})'

        batch_size = 500
        for i in range(0, len(converted), batch_size):
            batch = converted[i:i+batch_size]
            slt.executemany(insert_sql, batch)

        print(f"   ✅ {len(converted)} rows migrated")

    # Create indexes for performance
    print("\n🔧 Creating indexes...")
    
    # Telemetry: most frequent queries
    slt.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry(device_ieee, ts DESC)")
    slt.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_property ON telemetry(device_ieee, property, ts DESC)")
    slt.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry(ts DESC)")
    
    # Devices
    slt.execute("CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(type)")
    slt.execute("CREATE INDEX IF NOT EXISTS idx_devices_room ON devices(room_id)")
    
    # Commands
    slt.execute("CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_ieee, sent_at DESC)")
    
    # Scenario executions
    slt.execute("CREATE INDEX IF NOT EXISTS idx_scenario_exec_ts ON scenario_executions(ts DESC)")

    # Force WAL checkpoint (skip if locked — data is safe)
    try:
        slt.execute("PRAGMA wal_checkpoint(PASSIVE);")
    except:
        pass

    # Stats
    slt.execute("ANALYZE;")
    
    # Verify
    print("\n📊 Verification:")
    for (table_name,) in tables:
        cnt = slt.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
        print(f"   {table_name}: {cnt} rows")

    # File size
    db_size = os.path.getsize(SQLITE_PATH)
    wal_size = 0
    wal_path = SQLITE_PATH + "-wal"
    if os.path.exists(wal_path):
        wal_size = os.path.getsize(wal_path)
    print(f"\n💾 SQLite size: {db_size/1024:.1f} KB (WAL: {wal_size/1024:.1f} KB)")
    
    ddb.close()
    slt.close()
    print("\n✅ Migration complete!")


if __name__ == '__main__':
    migrate()
