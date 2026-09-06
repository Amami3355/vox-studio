"""Creative checkpoints use replaceable storage; ADK sessions are the hosted adapter."""

from __future__ import annotations

import asyncio
import json

import pytest

from vox_crew.crew_contract import ContractViolation
from vox_crew.crew_state import AdkSessionStateStore, FileCrewStateStore


def test_an_injected_adk_session_persists_a_checkpoint_for_a_reconstructed_crew() -> None:
    pytest.importorskip("google.adk")
    from google.adk.sessions import InMemorySessionService

    sessions = InMemorySessionService()
    checkpoint = {
        "schemaVersion": 1,
        "briefId": "brief-1",
        "sequence": 2,
        "research": {"schemaVersion": 1, "mode": "researched"},
    }

    async def round_trip():
        first = AdkSessionStateStore(sessions, user_id="operator-1")
        await first.save("brief-1", checkpoint)
        resumed = AdkSessionStateStore(
            sessions, user_id="operator-1", session_id=first.session_id
        )
        return first.session_id, await resumed.load("brief-1")

    session_id, loaded = asyncio.run(round_trip())

    assert session_id
    assert loaded == checkpoint
    assert loaded is not checkpoint


def test_a_file_checkpoint_outlives_the_store_that_wrote_it(tmp_path) -> None:
    """What an operator needs after a dropped render: the paid work is still on disk."""
    checkpoint = {"schemaVersion": 1, "briefId": "brief-1", "sequence": 3, "research": {"mode": "researched"}}

    async def round_trip():
        await FileCrewStateStore(tmp_path).save("brief-1", checkpoint)
        return await FileCrewStateStore(tmp_path).load("brief-1")

    assert asyncio.run(round_trip()) == checkpoint


def test_an_unwritten_brief_has_no_checkpoint_rather_than_an_empty_one(tmp_path) -> None:
    """`None` and an empty checkpoint are different answers: one resumes, the other starts."""
    assert asyncio.run(FileCrewStateStore(tmp_path).load("brief-1")) is None


def test_a_checkpoint_is_refused_for_a_brief_it_does_not_name(tmp_path) -> None:
    """The stored document names its own Brief, so no Brief can resume from another's work."""
    store = FileCrewStateStore(tmp_path)
    asyncio.run(store.save("brief-1", {"briefId": "brief-1", "sequence": 1}))
    store.path("brief-2").write_text(
        json.dumps({"briefId": "brief-1", "sequence": 1}), encoding="utf-8", newline=""
    )

    with pytest.raises(ContractViolation, match="different Brief"):
        asyncio.run(store.load("brief-2"))
    with pytest.raises(ContractViolation, match="name the Brief"):
        asyncio.run(store.save("brief-2", {"briefId": "brief-1"}))


def test_a_half_written_checkpoint_is_never_what_a_resume_reads(tmp_path) -> None:
    """The staged write is the whole guard: a crash leaves the previous checkpoint, not a torn one."""
    store = FileCrewStateStore(tmp_path)
    asyncio.run(store.save("brief-1", {"briefId": "brief-1", "sequence": 1}))
    store.path("brief-1").with_suffix(".json.partial").write_text(
        "{ not json", encoding="utf-8", newline=""
    )

    assert asyncio.run(store.load("brief-1")) == {"briefId": "brief-1", "sequence": 1}
