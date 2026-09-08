"""Durable operator-side dispatch evidence and a ceiling shared by hosted model roles.

Only selected public metadata is written. Never serialize a provider request, exception,
credential or model reasoning. An unfinished dispatch blocks a new attempt until reconciled.
"""
from __future__ import annotations

import json
import os
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

CURRENT: ContextVar[ProviderJournal | None] = ContextVar("provider_journal", default=None)


class ProviderLimit(RuntimeError):
    pass


class ProviderJournal:
    def __init__(self, path: Path, *, max_calls: int = 40, max_grounded_calls: int = 2):
        self.path = path
        self.max_calls = max_calls
        self.max_grounded_calls = max_grounded_calls
        self.records = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
        opened = {row["id"] for row in self.records if row["status"] == "dispatched"}
        closed = {row["id"] for row in self.records if row["status"] == "responded"}
        if opened - closed:
            raise ProviderLimit("An earlier provider dispatch is uncertain; reconcile it before another attempt.")

    def __enter__(self):
        self.token = CURRENT.set(self)
        return self

    def __exit__(self, *args):
        CURRENT.reset(self.token)

    def append(self, row: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        row = {**row, "observedAt": datetime.now(timezone.utc).isoformat()}
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        self.records.append(row)

    def begin(self, role: str, model: str, *, grounded: bool = False) -> str:
        dispatches = [r for r in self.records if r["status"] == "dispatched"]
        completed = {r["id"] for r in self.records if r["status"] == "responded"}
        if any(r["id"] not in completed for r in dispatches):
            raise ProviderLimit("A provider dispatch is uncertain; reconcile before another call.")
        if len(dispatches) >= self.max_calls:
            raise ProviderLimit("The operator model-call ceiling has been reached.")
        if grounded and sum(r["grounded"] for r in dispatches) >= self.max_grounded_calls:
            raise ProviderLimit("The operator grounded-research ceiling has been reached.")
        call_id = str(uuid4())
        self.append({"id": call_id, "status": "dispatched", "provider": "google-cloud",
                     "role": role, "model": model, "grounded": grounded})
        return call_id


def begin_call(role: str, model: str, *, grounded: bool = False) -> str | None:
    journal = CURRENT.get()
    return journal.begin(role, model, grounded=grounded) if journal else None


def finish_call(call_id: str | None, usage: Any = None, **evidence: Any) -> None:
    journal = CURRENT.get()
    if journal is None or call_id is None:
        return
    # A field allowlist deliberately excludes full SDK responses and error messages.
    counts = {}
    for field in ("prompt_token_count", "candidates_token_count", "thoughts_token_count",
                  "total_token_count", "tool_use_prompt_token_count"):
        value = getattr(usage, field, None)
        if isinstance(value, int) and not isinstance(value, bool):
            counts[field] = value
    allowed = {key: value for key, value in evidence.items()
               if key in {"searchQueries", "sources", "supports", "responseSha256", "modelVersion"}}
    journal.append({"id": call_id, "status": "responded", "usage": counts, **allowed})
