"""The live research boundary requires actual searches and verifiable citation bindings."""
import asyncio
from types import SimpleNamespace

import pytest

from vox_crew.crew_contract import Brief, ContractViolation
from vox_crew.grounded_research import GroundedParallelResearchAdapter, grounded_dossier
from vox_crew.parallel_research import ParallelUnavailable
from vox_crew.provider_usage import ProviderJournal, ProviderLimit, begin_call, finish_call


def response():
    text = "Café: landing uses thrust."
    return {"candidates": [{"content": {"parts": [{"text": "Uncited introduction."}, {"text": text}]},
        "grounding_metadata": {"web_search_queries": ["landing thrust primary evidence"],
        "grounding_chunks": [{"web": {"uri": "https://www.nasa.gov/example", "title": "NASA"}}],
        "grounding_supports": [{"segment": {"part_index": 1, "start_index": 0,
            "end_index": len(text.encode()), "text": text}, "grounding_chunk_indices": [0]}]}}]}


def test_only_cited_segments_become_claims_with_utf8_multipart_coordinates():
    dossier, evidence = grounded_dossier(response())
    assert [c["text"] for c in dossier["claims"]] == ["Café: landing uses thrust."]
    assert dossier["claims"][0]["sourceIds"] == [dossier["sources"][0]["id"]]
    assert evidence["searchQueries"] == ["landing thrust primary evidence"]
    assert evidence["supports"][0]["partIndex"] == 1


@pytest.mark.parametrize("field", ["web_search_queries", "grounding_chunks", "grounding_supports"])
def test_enabling_a_tool_without_search_evidence_is_not_research(field):
    body = response()
    body["candidates"][0]["grounding_metadata"][field] = []
    with pytest.raises(ContractViolation, match="not evidenced"):
        grounded_dossier(body)


@pytest.mark.parametrize("mutation", ["source", "text", "characters", "thought"])
def test_fabricated_citations_cannot_enter_the_dossier(mutation):
    body = response()
    candidate = body["candidates"][0]
    support = candidate["grounding_metadata"]["grounding_supports"][0]
    if mutation == "source":
        support["grounding_chunk_indices"] = [9]
    elif mutation == "text":
        support["segment"]["text"] = "Invented assertion."
    elif mutation == "characters":
        support["segment"]["end_index"] -= 1
    else:
        candidate["content"]["parts"][1]["thought"] = True
    with pytest.raises(ContractViolation):
        grounded_dossier(body)


def test_missing_key_is_refused_before_creating_a_client(monkeypatch):
    monkeypatch.delenv("VOX_PARALLEL_AUTH", raising=False)
    adapter = GroundedParallelResearchAdapter(client_factory=lambda: pytest.fail("client created"),
                                             key_source=lambda: "")
    brief = Brief.from_mapping({"id": "b", "text": "Explain landing.", "kind": "factual"})
    with pytest.raises(ParallelUnavailable, match="PARALLEL_API_KEY"):
        asyncio.run(adapter.research(brief))


def test_actual_sdk_request_and_usage_are_bound_to_parallel_and_journal(tmp_path):
    from google.genai.types import GenerateContentResponse

    observed = []
    async def generate_content(**kwargs):
        observed.append(kwargs)
        return GenerateContentResponse.model_validate(response())
    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    adapter = GroundedParallelResearchAdapter(client_factory=lambda: client,
                                             key_source=lambda: "test-parallel-secret")
    brief = Brief.from_mapping({"id": "b", "text": "Explain landing.", "kind": "factual"})
    with ProviderJournal(tmp_path / "usage.jsonl"):
        dossier = asyncio.run(adapter.research(brief))
    assert dossier["claims"]
    tool = observed[0]["config"].tools[0]
    assert tool.parallel_ai_search.api_key == "test-parallel-secret"
    assert tool.google_search is None
    evidence = (tmp_path / "usage.jsonl").read_text()
    assert "test-parallel-secret" not in evidence
    assert "searchQueries" in evidence
    assert "responded" in evidence


def test_call_ceiling_survives_new_attempt_and_does_not_repay_uncertain_work(tmp_path):
    path = tmp_path / "usage.jsonl"
    with ProviderJournal(path, max_calls=1):
        call = begin_call("Research", "test-model")
        finish_call(call)
    with ProviderJournal(path, max_calls=1):
        with pytest.raises(ProviderLimit, match="ceiling"):
            begin_call("Narrative", "test-model")
    with ProviderJournal(tmp_path / "uncertain.jsonl"):
        begin_call("Research", "test-model")
    with pytest.raises(ProviderLimit, match="uncertain"):
        ProviderJournal(tmp_path / "uncertain.jsonl")


def test_grounded_call_ceiling_is_separate_from_creative_calls(tmp_path):
    with ProviderJournal(tmp_path / "usage.jsonl", max_grounded_calls=1):
        finish_call(begin_call("Research", "test-model", grounded=True))
        finish_call(begin_call("Narrative", "test-model"))
        with pytest.raises(ProviderLimit, match="grounded-research"):
            begin_call("Research", "test-model", grounded=True)


def test_hosted_adk_roles_use_cloud_identity_and_journal_each_model_call(tmp_path, monkeypatch):
    from vox_crew.adk_roles import AdkJsonRole
    from google.adk.models.llm_request import LlmRequest
    from google.adk.models.llm_response import LlmResponse
    from google.genai.types import GenerateContentResponseUsageMetadata

    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    with ProviderJournal(tmp_path / "usage.jsonl", max_calls=1):
        agent = AdkJsonRole("NarrativeAgent", "Writes narration.", model="gemini-3.5-flash").agent("Return JSON.")
        assert agent.model.client_kwargs["enterprise"] is True
        assert agent.model.retry_options.attempts == 1
        agent.before_model_callback(None, LlmRequest())
        agent.after_model_callback(None, LlmResponse(usage_metadata=GenerateContentResponseUsageMetadata(total_token_count=123)))
        with pytest.raises(ProviderLimit, match="ceiling"):
            agent.before_model_callback(None, LlmRequest())
    assert '"total_token_count": 123' in (tmp_path / "usage.jsonl").read_text()
