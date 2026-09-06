"""Live and recorded research adapters share one provider-neutral dossier contract."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from vox_crew.crew_contract import Brief, ContractViolation, ResearchDossier
from vox_crew.parallel_research import ParallelResearchAdapter, ParallelUnavailable
from vox_crew.recorded import RecordedResearchAdapter

from test_crew import DOSSIER


class RecordedParallelTransport:
    def __init__(self, result: dict[str, Any]) -> None:
        self.result_body = result
        self.created: list[tuple[dict[str, Any], str]] = []
        self.results: list[tuple[str, str]] = []

    def create(self, payload: dict[str, Any], api_key: str) -> str:
        self.created.append((payload, api_key))
        return "parallel-run-1"

    def result(self, run_id: str, api_key: str) -> dict[str, Any]:
        self.results.append((run_id, api_key))
        return self.result_body


def factual_brief() -> Brief:
    return Brief.from_mapping(
        {"id": "brief-1", "text": "Explain why the forecasts diverged.", "kind": "factual"}
    )


def test_live_and_recorded_research_return_the_same_normalized_contract() -> None:
    transport = RecordedParallelTransport(
        {"output": {"type": "json", "content": json.dumps(DOSSIER), "basis": []}}
    )
    live = ParallelResearchAdapter(transport=transport, key_source=lambda: "parallel-test-key")
    recorded = RecordedResearchAdapter(DOSSIER)

    live_value = asyncio.run(live.research(factual_brief()))
    recorded_value = asyncio.run(recorded.research(factual_brief()))

    assert ResearchDossier.from_mapping(live_value) == ResearchDossier.from_mapping(recorded_value)
    assert set(live_value) == set(DOSSIER)
    payload, key = transport.created[0]
    assert key == "parallel-test-key"
    assert payload["input"] == factual_brief().text
    assert payload["processor"] == "core"
    assert payload["task_spec"]["output_schema"]["type"] == "json"
    assert payload["task_spec"]["output_schema"]["json_schema"]["additionalProperties"] is False
    assert transport.results == [("parallel-run-1", "parallel-test-key")]


def test_a_missing_live_credential_fails_before_the_transport_is_reached() -> None:
    transport = RecordedParallelTransport({})
    adapter = ParallelResearchAdapter(transport=transport, key_source=lambda: "")

    with pytest.raises(ParallelUnavailable, match="PARALLEL_API_KEY"):
        asyncio.run(adapter.research(factual_brief()))

    assert transport.created == []
    assert transport.results == []


def test_provider_fields_cannot_cross_the_research_interface() -> None:
    provider_shaped = {**DOSSIER, "parallelRunId": "parallel-run-1"}
    transport = RecordedParallelTransport(
        {"output": {"type": "json", "content": json.dumps(provider_shaped), "basis": []}}
    )
    adapter = ParallelResearchAdapter(transport=transport, key_source=lambda: "parallel-test-key")

    with pytest.raises(ContractViolation, match="parallelRunId"):
        asyncio.run(adapter.research(factual_brief()))


def test_the_live_adapter_itself_refuses_non_factual_briefs_without_a_call() -> None:
    transport = RecordedParallelTransport({})
    adapter = ParallelResearchAdapter(transport=transport, key_source=lambda: "parallel-test-key")
    fictional = Brief.from_mapping(
        {"id": "fiction-1", "text": "A fictional city changes course.", "kind": "fictional"}
    )

    with pytest.raises(ContractViolation, match="factual"):
        asyncio.run(adapter.research(fictional))

    assert transport.created == []
