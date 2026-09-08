"""Durable single-workspace admission. SQLite transactions own dispatch eligibility."""
from __future__ import annotations

from contextlib import contextmanager
from hashlib import sha256
import json
from pathlib import Path
import secrets
import sqlite3
import time
from uuid import uuid4


class StudioConflict(ValueError):
    pass


class StudioStore:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / "studio.sqlite3"
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY, admission_key TEXT UNIQUE NOT NULL,
                    request TEXT NOT NULL, status TEXT NOT NULL, created REAL NOT NULL,
                    updated REAL NOT NULL, message TEXT NOT NULL DEFAULT '',
                    recorded INTEGER NOT NULL DEFAULT 0);
                CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs((1))
                    WHERE status IN ('queued', 'running', 'awaiting_image');
                CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS decisions (
                    job_id TEXT NOT NULL, candidate TEXT NOT NULL, decision TEXT NOT NULL,
                    PRIMARY KEY(job_id, candidate));
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=15000")
        db.execute("PRAGMA synchronous=FULL")
        try:
            with db:
                yield db
        finally:
            db.close()

    def submit(self, key: str, request: dict) -> dict:
        payload = json.dumps(request, sort_keys=True, ensure_ascii=False)
        now = time.time()
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM jobs WHERE admission_key=?", (key,)).fetchone()
            if old:
                if old["request"] != payload:
                    raise StudioConflict("This submission key already belongs to a different brief.")
                return self.decode(old)
            # Pending requests cannot purchase work, but still bound storage admission.
            if db.execute("SELECT COUNT(*) FROM jobs WHERE status='awaiting_authorization'").fetchone()[0] >= 20:
                raise StudioConflict("Review the existing pending briefs before adding more.")
            job_id = str(uuid4())
            db.execute("INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
                       (job_id, key, payload, "awaiting_authorization", now, now,
                        "The brief is saved. An operator must authorize its production budget."))
            return self.decode(db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())

    @staticmethod
    def decode(row):
        result = dict(row)
        result["request"] = json.loads(result["request"])
        result["recorded"] = bool(result["recorded"])
        result.pop("admission_key", None)
        return result

    def get(self, job_id):
        with self.connection() as db:
            row = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if row is None:
                raise KeyError(job_id)
            return self.decode(row)

    def list(self):
        with self.connection() as db:
            return [self.decode(row) for row in db.execute("SELECT * FROM jobs ORDER BY created DESC LIMIT 100")]

    def transition(self, job_id, expected, status, message=""):
        with self.connection() as db:
            try:
                changed = db.execute("UPDATE jobs SET status=?, message=?, updated=? WHERE id=? AND status=?",
                                     (status, message, time.time(), job_id, expected)).rowcount
            except sqlite3.IntegrityError as error:
                raise StudioConflict("Another production is already active.") from error
            if changed != 1:
                raise StudioConflict("The work changed. Refresh to see its current state.")

    def claim(self):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
            if row is None:
                return None
            db.execute("UPDATE jobs SET status='running', message=?, updated=? WHERE id=?",
                       ("Production is underway. Follow the crew's progress below.", time.time(), row["id"]))
            return self.decode(row)

    def interrupted(self):
        # Call only while holding the OS worker lock: an absent heartbeat is not proof of death.
        with self.connection() as db:
            db.execute("UPDATE jobs SET status='interrupted', message=?, updated=? WHERE status IN ('running','awaiting_image')",
                       ("Execution stopped. The same work must be reconciled before continuing.", time.time()))

    def decide(self, job_id, candidate, decision):
        encoded = json.dumps(decision, sort_keys=True)
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT decision FROM decisions WHERE job_id=? AND candidate=?", (job_id, candidate)).fetchone()
            if old:
                if old[0] != encoded:
                    raise StudioConflict("A different decision was already recorded for this image.")
                return
            db.execute("INSERT INTO decisions VALUES (?, ?, ?)", (job_id, candidate, encoded))

    def decision(self, job_id, candidate):
        with self.connection() as db:
            row = db.execute("SELECT decision FROM decisions WHERE job_id=? AND candidate=?", (job_id, candidate)).fetchone()
            return json.loads(row[0]) if row else None

    def session(self):
        token = secrets.token_urlsafe(32)
        with self.connection() as db:
            db.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
            db.execute("INSERT INTO sessions VALUES (?, ?)", (sha256(token.encode()).hexdigest(), time.time() + 43200))
        return token

    def authenticated(self, token):
        if not token:
            return False
        with self.connection() as db:
            return db.execute("SELECT 1 FROM sessions WHERE digest=? AND expires>?",
                              (sha256(token.encode()).hexdigest(), time.time())).fetchone() is not None

    def logout(self, token):
        with self.connection() as db:
            db.execute("DELETE FROM sessions WHERE digest=?", (sha256((token or '').encode()).hexdigest(),))

    def work(self, job_id):
        self.get(job_id)
        return self.root / "work" / job_id
