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


class PlanningRole:
    """Stands in for the ADK role, so the agent's own logic is tested without a provider."""

    def __init__(self, answer: Any = None, *, raises: BaseException | None = None) -> None:
        self.answer = answer
        self.raises = raises
        self.calls = 0

    async def ask(self, _instruction: str, _payload: dict[str, Any]) -> Any:
        self.calls += 1
        if self.raises is not None:
            raise self.raises
        return self.answer


def research_agent(role: PlanningRole, tool: Any) -> Any:
    from vox_crew.adk_roles import AdkResearchAgent

    agent = AdkResearchAgent.__new__(AdkResearchAgent)
    agent._tool = tool
    agent.role = role
    agent.inquiry = ()
    return agent


def test_the_research_agent_plans_the_inquiry_and_the_tool_executes_it() -> None:
    """US31: the crew decides which questions a factual Brief needs answered."""
    tool = RecordedResearchAdapter(DOSSIER)
    role = PlanningRole({"questions": ["What were the two forecasts?", "Who published them?"]})
    agent = research_agent(role, tool)

    dossier = asyncio.run(agent.research(factual_brief()))

    assert role.calls == 1
    assert agent.inquiry == ("What were the two forecasts?", "Who published them?")
    assert tool.inquiry == agent.inquiry
    # The evidence is the tool's, unchanged: the agent plans, it does not author claims.
    assert dossier == DOSSIER


def test_the_planned_questions_travel_with_the_brief_not_instead_of_it() -> None:
    transport = RecordedParallelTransport(
        {"output": {"content": json.loads(json.dumps(DOSSIER))}}
    )
    tool = ParallelResearchAdapter(transport=transport, key_source=lambda: "parallel-test-key")

    asyncio.run(tool.research(factual_brief(), ("Who published them?",)))

    sent = transport.created[0][0]["input"]
    assert sent.startswith("Explain why the forecasts diverged.")
    assert "- Who published them?" in sent


def test_an_empty_inquiry_sends_exactly_what_it_always_sent() -> None:
    """The bare-Brief path is the previous behaviour, byte for byte."""
    transport = RecordedParallelTransport(
        {"output": {"content": json.loads(json.dumps(DOSSIER))}}
    )
    tool = ParallelResearchAdapter(transport=transport, key_source=lambda: "parallel-test-key")

    asyncio.run(tool.research(factual_brief(), ()))

    assert transport.created[0][0]["input"] == "Explain why the forecasts diverged."


@pytest.mark.parametrize(
    "answer",
    [
        {"questions": "not an array"},
        {"questions": [1, 2, 3]},
        {},
        "not an object",
    ],
)
def test_a_bad_plan_degrades_to_the_bare_brief_rather_than_failing_the_phase(answer: Any) -> None:
    """A planning turn that answers badly must not cost the Run its research."""
    tool = RecordedResearchAdapter(DOSSIER)
    agent = research_agent(PlanningRole(answer), tool)

    dossier = asyncio.run(agent.research(factual_brief()))

    assert agent.inquiry == ()
    assert tool.inquiry == ()
    assert tool.calls == 1
    assert dossier == DOSSIER


def test_a_planning_failure_still_researches() -> None:
    tool = RecordedResearchAdapter(DOSSIER)
    agent = research_agent(PlanningRole(raises=RuntimeError("no model")), tool)

    assert asyncio.run(agent.research(factual_brief())) == DOSSIER
    assert tool.calls == 1


def test_the_inquiry_is_deduplicated_and_capped() -> None:
    from vox_crew.adk_roles import MAX_PLANNED_QUESTIONS

    tool = RecordedResearchAdapter(DOSSIER)
    asked = ["  spaced  ", "spaced", *[f"question {index}?" for index in range(20)], ""]
    agent = research_agent(PlanningRole({"questions": asked}), tool)

    asyncio.run(agent.research(factual_brief()))

    assert len(agent.inquiry) == MAX_PLANNED_QUESTIONS
    assert agent.inquiry[0] == "spaced"
    assert len(set(agent.inquiry)) == len(agent.inquiry)
    assert "" not in agent.inquiry


def test_the_agent_reports_the_tools_provider_mode_so_crew_code_never_branches() -> None:
    tool = RecordedResearchAdapter(DOSSIER)
    agent = research_agent(PlanningRole({"questions": []}), tool)

    assert agent.mode is tool.mode
