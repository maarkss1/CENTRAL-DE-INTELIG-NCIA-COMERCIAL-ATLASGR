import sqlite3
import os

db_path = r".cache\market-intelligence\cnpj\work\companies-d0413a13df4be958.sqlite"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
    print("Tables:", tables)
    for (t,) in tables:
        count = cur.execute(f"SELECT COUNT(*) FROM {t};").fetchone()[0]
        print(f"Table {t}: {count:,} rows")
    conn.close()
else:
    print("DB not found yet at", db_path)
