"""The deterministic Director, observed only through the public async crew seam."""

from __future__ import annotations

import asyncio
from typing import Any

from vox_crew.crew import ProductionCrew
from vox_crew.crew_contract import (
    ArtifactHandle,
    Brief,
    CrewTerminal,
    OperatorPolicy,
    ProviderMode,
    Rendered,
    VisualVocabulary,
)
from vox_crew.crew_state import InMemoryCrewStateStore


DOSSIER = {
    "schemaVersion": 1,
    "mode": "researched",
    "sources": [
        {"id": "source-1", "title": "Recorded source", "url": "https://example.test/source"}
    ],
    "claims": [
        {
            "id": "claim-1",
            "text": "The two forecasts used different demand baselines.",
            "sourceIds": ["source-1"],
            "support": "supported",
        }
    ],
    "statistics": [],
    "quotations": [],
    "contradictions": [],
    "visualOpportunities": [],
}
NARRATIVE = {
    "schemaVersion": 1,
    "angle": "The disagreement began in the assumptions.",
    "hook": "Two forecasts began with two versions of normal.",
    "beats": [
        {
            "id": "b1",
            "text": "The two forecasts used different demand baselines.",
            "claimIds": ["claim-1"],
            "factual": True,
        }
    ],
}
BIBLE = {
    "schemaVersion": 1,
    "theme": "editorial-cold",
    "motionIntent": ["measured"],
    "colorRoles": ["accent", "ground"],
    "treatments": ["documentary"],
    "motifs": ["diverging baselines"],
    "forbiddenTreatments": ["glossy"],
}
PLAN = {
    "beats": [{"id": "b1", "text": "The two forecasts used different demand baselines."}],
    "sections": [],
}
PREVIEW = ArtifactHandle.from_mapping(
    {
        "id": "preview:run-recorded-1",
        "kind": "preview",
        "sha256": "cd" * 32,
        "mediaType": "video/mp4",
        "sizeBytes": 16,
    }
)
VOCABULARY = VisualVocabulary(
    themes=frozenset({"editorial-cold"}),
    motion_intents=frozenset({"measured"}),
    color_roles=frozenset({"accent", "ground"}),
    treatments=frozenset({"documentary", "glossy"}),
)


def recorded_policy() -> OperatorPolicy:
    return OperatorPolicy.from_mapping(
        {
            "schemaVersion": 1,
            "research": {"mode": "recorded", "grantId": None},
            "models": {"mode": "recorded", "grantId": None},
            "images": {"mode": "disabled", "grantId": None},
            "recording": {"mode": "recorded", "grantId": None},
        }
    )


class RecordedResearch:
    mode = ProviderMode.RECORDED

    def __init__(self) -> None:
        self.calls = 0

    async def research(self, brief: Brief) -> dict[str, Any]:
        self.calls += 1
        return DOSSIER


class RecordedCreative:
    mode = ProviderMode.RECORDED

    def __init__(self, *, narrative: dict[str, Any] = NARRATIVE) -> None:
        self.narrative = narrative
        self.active: set[str] = set()
        self.both_started = asyncio.Event()
        self.overlapped = False
        self.plan_calls = 0
        self.art_direction_vocabulary: Any = None

    async def narrate(self, brief: Brief, dossier: Any) -> dict[str, Any]:
        return await self._parallel("narrative", self.narrative)

    async def art_direct(self, brief: Brief, dossier: Any, vocabulary: Any) -> dict[str, Any]:
        self.art_direction_vocabulary = vocabulary
        return await self._parallel("art", BIBLE)

    async def _parallel(self, name: str, result: dict[str, Any]) -> dict[str, Any]:
        self.active.add(name)
        if len(self.active) == 2:
            self.overlapped = True
            self.both_started.set()
        await asyncio.wait_for(self.both_started.wait(), timeout=1)
        self.active.remove(name)
        return result

    async def plan(self, brief: Brief, dossier: Any, narrative: Any, visual_bible: Any) -> dict:
        self.plan_calls += 1
        return PLAN


class RecordedProduction:
    recording_mode = ProviderMode.RECORDED

    def __init__(self) -> None:
        self.calls = 0

    async def produce(
        self, brief: Brief, policy: OperatorPolicy, plan: dict[str, Any]
    ) -> Rendered:
        self.calls += 1
        return Rendered(
            run_id="run-recorded-1",
            summary="The narrated preview is verified.",
            preview=PREVIEW,
        )


async def collect(crew: ProductionCrew, brief: Brief, policy: OperatorPolicy) -> list[Any]:
    return [update async for update in crew.run(brief, policy)]


def test_a_recorded_factual_brief_crosses_the_async_crew_seam_to_a_preview() -> None:
    research = RecordedResearch()
    creative = RecordedCreative()
    production = RecordedProduction()
    crew = ProductionCrew(research, creative, production, visual_vocabulary=VOCABULARY)

    updates = asyncio.run(
        collect(
            crew,
            Brief.from_mapping(
                {"id": "brief-1", "text": "Explain why the forecasts diverged.", "kind": "factual"}
            ),
            recorded_policy(),
        )
    )

    events = [update for update in updates if not isinstance(update, CrewTerminal)]
    terminal = updates[-1]
    assert [(event.phase.value, event.status.value) for event in events] == [
        ("research", "started"),
        ("research", "completed"),
        ("narrative", "started"),
        ("art_direction", "started"),
        ("narrative", "completed"),
        ("art_direction", "completed"),
        ("visual_planning", "started"),
        ("visual_planning", "completed"),
        ("asset_resolution", "skipped"),
        ("image_creation", "skipped"),
        ("production", "started"),
        ("production", "completed"),
        ("artifact_retrieval", "completed"),
    ]
    assert [update.sequence for update in updates] == list(range(1, len(updates) + 1))
    assert events[1].counts == {"sources": 1, "claims": 1}
    assert creative.overlapped is True
    assert research.calls == creative.plan_calls == production.calls == 1
    assert isinstance(terminal, CrewTerminal)
    assert isinstance(terminal.result, Rendered)
    assert terminal.result.preview.sha256 == "cd" * 32


def test_a_declared_fictional_brief_never_reaches_the_research_provider() -> None:
    research = RecordedResearch()
    crew = ProductionCrew(
        research, RecordedCreative(narrative={**NARRATIVE, "beats": [{**NARRATIVE["beats"][0], "claimIds": [], "factual": False}]}),
        RecordedProduction(), visual_vocabulary=VOCABULARY
    )

    updates = asyncio.run(
        collect(
            crew,
            Brief.from_mapping({"id": "fiction-1", "text": "A fictional city changes course.", "kind": "fictional"}),
            recorded_policy(),
        )
    )

    assert research.calls == 0
    assert updates[0].status.value == "skipped"
    assert updates[0].counts == {"providerCalls": 0}
    assert isinstance(updates[-1].result, Rendered)


def test_malformed_model_output_fails_at_the_narrative_phase_before_production() -> None:
    invalid = {**NARRATIVE, "beats": [{**NARRATIVE["beats"][0], "claimIds": ["missing"]}]}
    production = RecordedProduction()
    crew = ProductionCrew(
        RecordedResearch(), RecordedCreative(narrative=invalid), production, visual_vocabulary=VOCABULARY
    )

    updates = asyncio.run(
        collect(
            crew,
            Brief.from_mapping({"id": "brief-1", "text": "Explain it.", "kind": "factual"}),
            recorded_policy(),
        )
    )

    assert [(item.phase.value, item.status.value) for item in updates[-2:-1]] == [
        ("narrative", "failed")
    ]
    assert updates[-1].to_mapping()["outcome"] == "failed"
    assert updates[-1].result.code == "NARRATIVE_CONTRACT_INVALID"
    assert production.calls == 0
    # A model answering unparseably is the most retryable failure the crew has, and the
    # checkpoint means a second invocation resumes rather than repaying research.
    assert updates[-1].result.retryable is True


def test_the_art_director_is_handed_the_vocabulary_it_is_told_to_obey() -> None:
    """Its instruction has always named a closed vocabulary; the payload has to carry one.

    Without this the role guesses a theme name and `VisualBible.from_mapping` rejects the guess,
    which is safe and costs a Run that had already paid for research and two model calls.
    """
    creative = RecordedCreative()
    crew = ProductionCrew(
        RecordedResearch(), creative, RecordedProduction(), visual_vocabulary=VOCABULARY
    )

    asyncio.run(
        collect(
            crew,
            Brief.from_mapping({"id": "brief-1", "text": "Explain it.", "kind": "factual"}),
            recorded_policy(),
        )
    )

    assert creative.art_direction_vocabulary is VOCABULARY
    assert creative.art_direction_vocabulary.to_mapping() == {
        "themes": ["editorial-cold"],
        "motionIntents": ["measured"],
        "colorRoles": ["accent", "ground"],
        "treatments": ["documentary", "glossy"],
    }


def test_a_live_provider_without_a_grant_is_not_reached() -> None:
    research = RecordedResearch()
    research.mode = ProviderMode.LIVE
    policy = OperatorPolicy.from_mapping(
        {
            "schemaVersion": 1,
            "research": {"mode": "live", "grantId": None},
            "models": {"mode": "recorded", "grantId": None},
            "images": {"mode": "disabled", "grantId": None},
            "recording": {"mode": "recorded", "grantId": None},
        }
    )
    crew = ProductionCrew(
        research, RecordedCreative(), RecordedProduction(), visual_vocabulary=VOCABULARY
    )

    updates = asyncio.run(
        collect(
            crew,
            Brief.from_mapping({"id": "brief-1", "text": "Explain it.", "kind": "factual"}),
            policy,
        )
    )

    assert research.calls == 0
    assert updates[0].status.value == "paused"
    assert updates[-1].to_mapping()["outcome"] == "paused"


def test_a_provider_mode_mismatch_fails_before_the_adapter_is_reached() -> None:
    research = RecordedResearch()
    policy = OperatorPolicy.from_mapping(
        {
            "schemaVersion": 1,
            "research": {"mode": "live", "grantId": "grant-research-1"},
            "models": {"mode": "recorded", "grantId": None},
            "images": {"mode": "disabled", "grantId": None},
            "recording": {"mode": "recorded", "grantId": None},
        }
    )

    updates = asyncio.run(
        collect(
            ProductionCrew(
                research,
                RecordedCreative(),
                RecordedProduction(),
                visual_vocabulary=VOCABULARY,
            ),
            Brief.from_mapping({"id": "brief-mode-1", "text": "Explain it.", "kind": "factual"}),
            policy,
        )
    )

    assert research.calls == 0
    assert updates[0].status.value == "failed"
    assert updates[-1].to_mapping()["outcome"] == "failed"
    assert updates[-1].result.code == "PROVIDER_MODE_MISMATCH"


def test_a_reconstructed_crew_resumes_after_research_without_repeating_the_call() -> None:
    research = RecordedResearch()
    state = InMemoryCrewStateStore()
    brief = Brief.from_mapping(
        {"id": "brief-resume-1", "text": "Explain why the forecasts diverged.", "kind": "factual"}
    )

    async def interrupt_after_research() -> list[Any]:
        crew = ProductionCrew(
            research,
            RecordedCreative(),
            RecordedProduction(),
            visual_vocabulary=VOCABULARY,
            state_store=state,
        )
        stream = crew.run(brief, recorded_policy())
        observed = [await anext(stream), await anext(stream)]
        await stream.aclose()
        return observed

    first = asyncio.run(interrupt_after_research())
    resumed = asyncio.run(
        collect(
            ProductionCrew(
                research,
                RecordedCreative(),
                RecordedProduction(),
                visual_vocabulary=VOCABULARY,
                state_store=state,
            ),
            brief,
            recorded_policy(),
        )
    )

    assert [(item.phase.value, item.status.value) for item in first] == [
        ("research", "started"),
        ("research", "completed"),
    ]
    assert research.calls == 1
    assert resumed[0].phase.value == "narrative"
    assert resumed[0].sequence == 3
    assert isinstance(resumed[-1].result, Rendered)


def test_a_finished_checkpoint_returns_the_same_terminal_without_repeating_production() -> None:
    state = InMemoryCrewStateStore()
    production = RecordedProduction()
    brief = Brief.from_mapping(
        {"id": "brief-finished-1", "text": "Explain why the forecasts diverged.", "kind": "factual"}
    )

    def crew() -> ProductionCrew:
        return ProductionCrew(
            RecordedResearch(),
            RecordedCreative(),
            production,
            visual_vocabulary=VOCABULARY,
            state_store=state,
        )

    first = asyncio.run(collect(crew(), brief, recorded_policy()))
    resumed = asyncio.run(collect(crew(), brief, recorded_policy()))

    assert production.calls == 1
    assert len(resumed) == 1
    assert resumed[0].to_mapping() == first[-1].to_mapping()
