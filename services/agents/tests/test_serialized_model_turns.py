"""Hosted creative concurrency retains the single outstanding provider dispatch rule."""
import asyncio

import pytest

from vox_crew.adk_roles import AdkJsonRole
from vox_crew.provider_usage import ProviderJournal, ProviderLimit, begin_call, finish_call


@pytest.mark.parametrize("uncertain", [False, True])
def test_concurrent_roles_share_dispatch_boundary(tmp_path, uncertain):
    async def scenario():
        journal = ProviderJournal(tmp_path / "calls.jsonl")
        first = AdkJsonRole("First", "test")
        second = AdkJsonRole("Second", "test")

        async def turn(instruction, payload, *, tools=()):
            call = begin_call(instruction, "test")
            await asyncio.sleep(0)
            if not uncertain:
                finish_call(call)
            return {"ok": True}

        first._ask = second._ask = turn
        with journal:
            results = await asyncio.gather(first.ask("first", {}), second.ask("second", {}),
                                           return_exceptions=True)
        dispatches = [r for r in journal.records if r["status"] == "dispatched"]
        if uncertain:
            assert len(dispatches) == 1
            assert isinstance(results[1], ProviderLimit)
        else:
            assert results == [{"ok": True}, {"ok": True}]
            assert [r["status"] for r in journal.records] == [
                "dispatched", "responded", "dispatched", "responded"]

    asyncio.run(scenario())
