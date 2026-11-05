"""SQLite persistence in the user's local application data directory."""
from __future__ import annotations
import json, os, sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

APP_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "CodeMindAI"
DB_PATH = APP_DIR / "codemind.sqlite3"

def connect(path=None):
    target = Path(path) if path else DB_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

@contextmanager
def _connection(path=None):
    conn = connect(path)
    try:
        with conn:
            yield conn
    finally:
        conn.close()

def initialize(path=None):
    with _connection(path) as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS analyses (
            id TEXT PRIMARY KEY, created_at TEXT NOT NULL, language TEXT NOT NULL,
            source_name TEXT, metrics_json TEXT NOT NULL, findings_json TEXT NOT NULL,
            recommendations_json TEXT NOT NULL, score INTEGER NOT NULL, report_json TEXT NOT NULL)""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at)")

def save_analysis(report, source_name=None, path=None):
    initialize(path)
    record_id = str(uuid4()); created_at = datetime.now(timezone.utc).isoformat()
    with _connection(path) as conn:
        conn.execute("INSERT INTO analyses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (record_id, created_at, report["language"], source_name, json.dumps(report["metrics"]),
             json.dumps(report["findings"]), json.dumps(report["recommendations"]),
             int(report["quality_score"]), json.dumps(report)))
    return record_id

def get_history(path=None, limit=None):
    initialize(path)
    sql = "SELECT * FROM analyses ORDER BY created_at DESC"; params = ()
    if limit is not None:
        sql += " LIMIT ?"; params = (max(0, int(limit)),)
    with _connection(path) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [{"id":r["id"], "created_at":r["created_at"], "language":r["language"],
             "source_name":r["source_name"], "metrics":json.loads(r["metrics_json"]),
             "findings":json.loads(r["findings_json"]), "recommendations":json.loads(r["recommendations_json"]),
             "score":r["score"], "report":json.loads(r["report_json"])} for r in rows]

def clear_history(path=None):
    initialize(path)
    with connect(path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM analyses").fetchone()[0]
        conn.execute("DELETE FROM analyses")
    return int(count)
