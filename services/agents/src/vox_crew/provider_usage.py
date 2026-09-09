"""Durable operator-side dispatch evidence and a ceiling shared by hosted model roles.

Only selected public metadata is written. Never serialize a provider request, exception,
credential or model reasoning. An unfinished dispatch blocks a new attempt until reconciled.
"""
from __future__ import annotations

import asyncio
import json
import os
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4
from .consumption import consumption_records, merge_consumption, price_at_dispatch

CURRENT: ContextVar[ProviderJournal | None] = ContextVar("provider_journal", default=None)


class ProviderLimit(RuntimeError):
    pass


class ProviderStopped(ProviderLimit):
    """User requested a stop at the next completed operation boundary."""


def summarize_records(records):
    dispatches = [r for r in records if r["status"] == "dispatched"]
    completed = {r["id"] for r in records if r["status"] == "responded"}
    return {"calls": len(dispatches), "searches": sum(bool(r.get("grounded")) for r in dispatches),
            "images": sum(r.get("role") == "ImageGeneration" for r in dispatches),
            "takes": sum(r.get("role") == "Recording" for r in dispatches),
            "uncertain": any(r["id"] not in completed for r in dispatches),
            "consumption": consumption_records(records)}


def merge_usage(summaries):
    summaries = list(summaries)
    return {**{key: sum(summary.get(key, 0) for summary in summaries)
               for key in ("calls", "searches", "images", "takes")},
            "uncertain": any(summary.get("uncertain", False) for summary in summaries),
            "consumption": merge_consumption(summary.get("consumption") for summary in summaries)}


class ProviderJournal:
    def __init__(self, path: Path, *, max_calls: int | None = 40, max_grounded_calls: int | None = 2,
                 reconcile_pending: bool = False):
        self.path = path
        self.max_calls = max_calls
        self.max_grounded_calls = max_grounded_calls
        self.expires_at = None
        self.stop_requested = None
        self.operation_identity = None
        # Concurrent creative roles share this journal's one outstanding dispatch.
        self.model_turn_lock = asyncio.Lock()
        self.records = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
        opened = {row["id"] for row in self.records if row["status"] == "dispatched"}
        closed = {row["id"] for row in self.records if row["status"] == "responded"}
        if opened - closed and not reconcile_pending:
            raise ProviderLimit("An earlier provider dispatch is uncertain; reconcile it before another attempt.")

    def __enter__(self):
        self.token = CURRENT.set(self)
        return self

    def __exit__(self, *args):
        CURRENT.reset(self.token)

    def summary(self):
        return summarize_records(self.records)

    def append(self, row: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        row = {**row, "observedAt": datetime.now(timezone.utc).isoformat()}
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        self.records.append(row)

    def check_available(self, *, grounded: bool = False) -> None:
        if self.stop_requested and self.stop_requested():
            raise ProviderStopped("Stopped after the current operation. Your completed work is saved.")
        dispatches = [r for r in self.records if r["status"] == "dispatched"]
        completed = {r["id"] for r in self.records if r["status"] == "responded"}
        if any(r["id"] not in completed for r in dispatches):
            raise ProviderLimit("A provider dispatch is uncertain; reconcile before another call.")
        if self.expires_at and datetime.fromisoformat(self.expires_at.replace("Z", "+00:00")) <= datetime.now(timezone.utc):
            raise ProviderLimit("The production authorization has expired. Confirm your limits before continuing.")
        if self.max_calls is not None and len(dispatches) >= self.max_calls:
            raise ProviderLimit("The total call ceiling has been reached.")
        if grounded and self.max_grounded_calls is not None and sum(r["grounded"] for r in dispatches) >= self.max_grounded_calls:
            raise ProviderLimit("The research call ceiling has been reached.")

    def begin(self, role: str, model: str, *, grounded: bool = False, provider: str = "google-cloud",
              max_output_tokens: int | None = None) -> str:
        self.check_available(grounded=grounded)
        call_id = str(uuid4())
        price = price_at_dispatch(provider, model, os.environ.get("GOOGLE_CLOUD_LOCATION", "global"))
        self.append({"id": call_id, "status": "dispatched", "provider": provider,
                     "role": role, "model": model, "grounded": grounded,
                     **({"price": price} if price else {}),
                     **({"operationId": self.operation_identity()} if self.operation_identity else {}),
                     **({"maxOutputTokens": max_output_tokens} if max_output_tokens is not None else {})})
        return call_id


def begin_call(role: str, model: str, *, grounded: bool = False, max_output_tokens: int | None = None) -> str | None:
    journal = CURRENT.get()
    return journal.begin(role, model, grounded=grounded, max_output_tokens=max_output_tokens) if journal else None


def finish_call(call_id: str | None, usage: Any = None, **evidence: Any) -> None:
    journal = CURRENT.get()
    if journal is None or call_id is None:
        return
    # A field allowlist deliberately excludes full SDK responses and error messages.
    counts = {}
    for field in ("prompt_token_count", "candidates_token_count", "thoughts_token_count",
                  "total_token_count", "tool_use_prompt_token_count", "cached_content_token_count"):
        value = getattr(usage, field, None)
        if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
            counts[field] = value
    if usage is not None:
        for field in ("cached_content_token_count", "thoughts_token_count", "tool_use_prompt_token_count"):
            if getattr(usage, field, None) is None:
                counts[field] = 0
    traffic = getattr(usage, "traffic_type", None)
    traffic = getattr(traffic, "value", traffic)
    allowed = {key: value for key, value in evidence.items()
               if key in {"searchQueries", "sources", "supports", "responseSha256", "modelVersion",
                          "answerParts", "extractionStatus", "mediaSha256", "providerHttpStatus",
                          "providerOutcome", "contextSha256", "finishReason", "imageConsumption"}}
    journal.append({"id": call_id, "status": "responded", "usage": counts,
                    **({"trafficType": traffic} if isinstance(traffic, str) else {}), **allowed})
