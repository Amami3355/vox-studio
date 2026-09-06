"""Replaceable creative-workflow checkpoint storage.

The checkpoint is not Production authority. It contains only portable JSON values needed to avoid
repeating completed creative/provider work; Run stage, quota and artifact bindings remain in
Production's checkpoint and ledger.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from typing import Any, Protocol

from .crew_contract import ContractViolation


class CrewStateStore(Protocol):
    async def load(self, brief_id: str) -> Mapping[str, Any] | None: ...

    async def save(self, brief_id: str, checkpoint: Mapping[str, Any]) -> None: ...


class InMemoryCrewStateStore:
    """The deterministic local/test default, shareable across reconstructed crew objects."""

    def __init__(self) -> None:
        self._checkpoints: dict[str, dict[str, Any]] = {}

    async def load(self, brief_id: str) -> Mapping[str, Any] | None:
        value = self._checkpoints.get(brief_id)
        return None if value is None else deepcopy(value)

    async def save(self, brief_id: str, checkpoint: Mapping[str, Any]) -> None:
        if checkpoint.get("briefId") != brief_id:
            raise ContractViolation("A crew checkpoint must name the Brief it is stored under.")
        self._checkpoints[brief_id] = deepcopy(dict(checkpoint))


class FileCrewStateStore:
    """A checkpoint that outlives the process that wrote it.

    The in-memory store is the right default for tests and for one uninterrupted invocation; it
    cannot answer the thing an operator needs after a dropped render, which is whether the
    research, model calls and image generation already paid for are still on disk. This writes
    one JSON document per Brief and reads it back on the next invocation.

    The write is staged and moved, because the failure that matters here is a half-written
    checkpoint: a crew that resumed from one would either repeat paid work or refuse to resume at
    all, and both are worse than the crash that produced it.
    """

    def __init__(self, directory: Path) -> None:
        self._directory = directory

    def path(self, brief_id: str) -> Path:
        """Where one Brief's checkpoint lives, named so no Brief can address another's file."""
        safe = "".join(character if character.isalnum() else "-" for character in brief_id)
        if not safe.strip("-"):
            raise ContractViolation("A Brief id must contain a usable character.")
        return self._directory / f"{safe}.json"

    async def load(self, brief_id: str) -> Mapping[str, Any] | None:
        path = self.path(brief_id)
        if not path.is_file():
            return None
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as unreadable:
            raise ContractViolation(
                f"The stored crew checkpoint could not be read: {unreadable}"
            ) from unreadable
        if not isinstance(value, Mapping) or value.get("briefId") != brief_id:
            raise ContractViolation("The stored crew checkpoint belongs to a different Brief.")
        return deepcopy(dict(value))

    async def save(self, brief_id: str, checkpoint: Mapping[str, Any]) -> None:
        if checkpoint.get("briefId") != brief_id:
            raise ContractViolation("A crew checkpoint must name the Brief it is stored under.")
        path = self.path(brief_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        staging = path.with_suffix(".json.partial")
        staging.write_text(
            json.dumps(dict(checkpoint), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="",
        )
        staging.replace(path)


class AdkSessionStateStore:
    """Crew checkpoints persisted as ADK session state through an injected session service."""

    STATE_KEY = "crew_checkpoint"

    def __init__(
        self,
        session_service: Any,
        *,
        app_name: str = "vox-crew",
        user_id: str = "director",
        session_id: str | None = None,
    ) -> None:
        self._session_service = session_service
        self._app_name = app_name
        self._user_id = user_id
        self._session_id = session_id

    @property
    def session_id(self) -> str | None:
        return self._session_id

    async def load(self, brief_id: str) -> Mapping[str, Any] | None:
        session = await self._session()
        value = session.state.get(self.STATE_KEY)
        if value is None:
            return None
        if not isinstance(value, Mapping) or value.get("briefId") != brief_id:
            raise ContractViolation("ADK session state belongs to a different Brief.")
        return deepcopy(dict(value))

    async def save(self, brief_id: str, checkpoint: Mapping[str, Any]) -> None:
        if checkpoint.get("briefId") != brief_id:
            raise ContractViolation("A crew checkpoint must name the Brief it is stored under.")
        from google.adk.events import Event, EventActions  # noqa: PLC0415

        session = await self._session()
        await self._session_service.append_event(
            session,
            Event(
                author="director",
                actions=EventActions(state_delta={self.STATE_KEY: deepcopy(dict(checkpoint))}),
            ),
        )

    async def _session(self) -> Any:
        if self._session_id is None:
            session = await self._session_service.create_session(
                app_name=self._app_name, user_id=self._user_id
            )
            self._session_id = session.id
            return session
        session = await self._session_service.get_session(
            app_name=self._app_name,
            user_id=self._user_id,
            session_id=self._session_id,
        )
        if session is None:
            raise ContractViolation("The configured ADK session does not exist.")
        return session


__all__ = [
    "AdkSessionStateStore",
    "CrewStateStore",
    "FileCrewStateStore",
    "InMemoryCrewStateStore",
]
