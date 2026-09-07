"""The public, transport-free contract of the ADK production crew."""

from __future__ import annotations

import pytest

from vox_crew.crew_contract import (
    RETRYABLE_FAILURES,
    ArtifactHandle,
    Brief,
    ContractViolation,
    CrewEvent,
    CrewPhase,
    CrewRole,
    CrewTerminal,
    Failed,
    OperatorPolicy,
    PhaseStatus,
    ProviderMode,
    ResearchDossier,
    Rendered,
    UnclassifiedFailure,
    crew_failure,
    Narrative,
    VisualBible,
    VisualVocabulary,
)


def test_a_caller_can_validate_the_ordered_progress_and_rendered_terminal_contract() -> None:
    preview = ArtifactHandle.from_mapping(
        {
            "id": "preview:run-1",
            "kind": "preview",
            "sha256": "ab" * 32,
            "mediaType": "video/mp4",
            "sizeBytes": 12,
        }
    )
    progress = CrewEvent.from_mapping(
        {
            "schemaVersion": 1,
            "briefId": "brief-1",
            "sequence": 1,
            "phase": "research",
            "role": "research_agent",
            "status": "completed",
            "providerMode": "recorded",
            "summary": "Two sourced claims are ready.",
            "counts": {"claims": 2, "sources": 1},
            "artifacts": [],
        }
    )
    terminal = CrewTerminal.from_mapping(
        {
            "schemaVersion": 1,
            "briefId": "brief-1",
            "sequence": 2,
            "outcome": "rendered",
            "runId": "run-1",
            "summary": "The narrated preview is verified.",
            "preview": preview.to_mapping(),
        }
    )

    assert progress.phase is CrewPhase.RESEARCH
    assert progress.role is CrewRole.RESEARCH_AGENT
    assert progress.status is PhaseStatus.COMPLETED
    assert progress.provider_mode is ProviderMode.RECORDED
    assert progress.to_mapping()["counts"] == {"claims": 2, "sources": 1}
    assert isinstance(terminal.result, Rendered)
    assert terminal.result.preview.sha256 == "ab" * 32
    assert terminal.to_mapping()["outcome"] == "rendered"


def test_live_spend_is_fail_closed_but_recorded_work_needs_no_grant() -> None:
    policy = OperatorPolicy.from_mapping(
        {
            "schemaVersion": 1,
            "research": {"mode": "recorded", "grantId": None},
            "models": {"mode": "recorded", "grantId": None},
            "images": {"mode": "live", "grantId": None},
            "recording": {"mode": "live", "grantId": "voice-grant-1"},
        }
    )

    policy.research.require_authorized("research")
    policy.models.require_authorized("models")
    policy.recording.require_authorized("recording")
    with pytest.raises(ContractViolation, match="images.*grant"):
        policy.images.require_authorized("images")


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (
            {
                "schemaVersion": 1,
                "briefId": "brief-1",
                "sequence": 0,
                "phase": "research",
                "role": "research_agent",
                "status": "started",
                "providerMode": "recorded",
                "summary": "Starting.",
                "counts": {},
                "artifacts": [],
            },
            "sequence",
        ),
        (
            {
                "schemaVersion": 1,
                "briefId": "brief-1",
                "sequence": 1,
                "phase": "research",
                "role": "research_agent",
                "status": "completed",
                "providerMode": "recorded",
                "summary": "The key is sk-secret.",
                "counts": {},
                "artifacts": [],
            },
            "safe summary",
        ),
    ],
)
def test_progress_rejects_malformed_or_disclosing_events(payload: dict, message: str) -> None:
    with pytest.raises(ContractViolation, match=message):
        CrewEvent.from_mapping(payload)


def test_terminal_failures_are_explicit_and_cannot_masquerade_as_rendered() -> None:
    terminal = CrewTerminal.from_mapping(
        {
            "schemaVersion": 1,
            "briefId": "brief-1",
            "sequence": 7,
            "outcome": "failed",
            "runId": None,
            "summary": "Research output did not satisfy its contract.",
            "code": "RESEARCH_CONTRACT_INVALID",
            "retryable": False,
        }
    )

    assert isinstance(terminal.result, Failed)
    assert terminal.result.code == "RESEARCH_CONTRACT_INVALID"
    with pytest.raises(ContractViolation, match="preview"):
        CrewTerminal.from_mapping(
            {
                "schemaVersion": 1,
                "briefId": "brief-1",
                "sequence": 8,
                "outcome": "rendered",
                "runId": "run-1",
                "summary": "Rendered somehow.",
                "preview": None,
            }
        )

    with pytest.raises(ContractViolation, match="safe public text"):
        CrewTerminal.from_mapping(
            {
                "schemaVersion": 1,
                "briefId": "brief-1",
                "sequence": 8,
                "outcome": "paused",
                "runId": None,
                "summary": "Waiting for authorization.",
                "reason": "Read the credential from C:\\private\\token.txt.",
                "resumeId": "brief-1:research",
            }
        )


def test_a_brief_is_editorial_intent_and_not_a_provider_prompt() -> None:
    brief = Brief.from_mapping(
        {"id": "brief-1", "text": "Explain why the winter forecasts diverged.", "kind": "factual"}
    )

    assert brief.to_mapping() == {
        "id": "brief-1",
        "text": "Explain why the winter forecasts diverged.",
        "kind": "factual",
    }
    with pytest.raises(ContractViolation, match="unknown fields"):
        Brief.from_mapping(
            {"id": "brief-1", "text": "Explain it.", "kind": "factual", "prompt": "secret"}
        )


def test_an_artifact_handle_cannot_smuggle_a_storage_location() -> None:
    with pytest.raises(ContractViolation, match="opaque"):
        ArtifactHandle.from_mapping(
            {
                "id": "C:\\runs\\preview.mp4",
                "kind": "preview",
                "sha256": "ab" * 32,
                "mediaType": "video/mp4",
                "sizeBytes": 12,
            }
        )


def test_creative_artifacts_are_validated_before_the_next_phase_can_use_them() -> None:
    dossier = ResearchDossier.from_mapping(
        {
            "schemaVersion": 1,
            "mode": "researched",
            "sources": [
                {
                    "id": "source-1",
                    "title": "Forecast methodology note",
                    "url": "https://example.test/forecast",
                }
            ],
            "claims": [
                {
                    "id": "claim-1",
                    "text": "The forecasts used different demand baselines.",
                    "sourceIds": ["source-1"],
                    "support": "supported",
                }
            ],
            "statistics": [],
            "quotations": [],
            "contradictions": [],
            "visualOpportunities": [
                {
                    "id": "visual-1",
                    "description": "Contrast the two baselines.",
                    "claimIds": ["claim-1"],
                }
            ],
        }
    )
    narrative = Narrative.from_mapping(
        {
            "schemaVersion": 1,
            "angle": "The disagreement began before either forecast was calculated.",
            "hook": "Two forecasts; two different versions of normal.",
            "beats": [
                {
                    "id": "b1",
                    "text": "The forecasts used different demand baselines.",
                    "claimIds": ["claim-1"],
                    "factual": True,
                }
            ],
        },
        dossier,
    )
    bible = VisualBible.from_mapping(
        {
            "schemaVersion": 1,
            "theme": "editorial-cold",
            "motionIntent": ["measured"],
            "colorRoles": ["accent", "ground"],
            "treatments": ["documentary"],
            "motifs": ["forecast divergence"],
            "forbiddenTreatments": ["glossy advertising"],
        },
        VisualVocabulary(
            themes=frozenset({"editorial-cold"}),
            motion_intents=frozenset({"measured", "energetic"}),
            color_roles=frozenset({"accent", "ground"}),
            treatments=frozenset({"documentary", "glossy advertising"}),
        ),
    )

    assert dossier.claims[0].source_ids == ("source-1",)
    assert narrative.beats[0].text == "The forecasts used different demand baselines."
    assert bible.theme == "editorial-cold"


def test_a_malformed_creative_artifact_fails_at_its_owning_contract() -> None:
    dossier = ResearchDossier.from_mapping(
        {
            "schemaVersion": 1,
            "mode": "researched",
            "sources": [],
            "claims": [],
            "statistics": [],
            "quotations": [],
            "contradictions": [],
            "visualOpportunities": [],
        }
    )

    with pytest.raises(ContractViolation, match="unknown claim"):
        Narrative.from_mapping(
            {
                "schemaVersion": 1,
                "angle": "An angle.",
                "hook": "A hook.",
                "beats": [
                    {
                        "id": "b1",
                        "text": "A factual statement.",
                        "claimIds": ["claim-missing"],
                        "factual": True,
                    }
                ],
            },
            dossier,
        )

    with pytest.raises(ContractViolation, match="unknown fields.*hexColor"):
        VisualBible.from_mapping(
            {
                "schemaVersion": 1,
                "theme": "editorial-cold",
                "motionIntent": ["measured"],
                "colorRoles": ["accent"],
                "treatments": ["documentary"],
                "motifs": [],
                "forbiddenTreatments": [],
                "hexColor": "#ffffff",
            },
            VisualVocabulary(
                themes=frozenset({"editorial-cold"}),
                motion_intents=frozenset({"measured"}),
                color_roles=frozenset({"accent"}),
                treatments=frozenset({"documentary"}),
            ),
        )


def test_a_failure_caused_by_a_model_or_a_socket_says_it_is_worth_running_again() -> None:
    """`retryable` used to be hardcoded False everywhere, so it carried no information.

    The line it draws is between a nondeterministic cause and a fact about the invocation. A
    model returning unparseable JSON may parse next time; a transport that died mid-command left
    a Run on the other side that resuming can still reach.
    """
    assert crew_failure("NARRATIVE_CONTRACT_INVALID", "rejected").retryable is True
    assert crew_failure("CREATIVE_PHASE_FAILED", "could not complete").retryable is True
    assert crew_failure("PRODUCTION_FAILED", "could not complete").retryable is True


def test_a_failure_that_will_be_just_as_true_next_time_says_so() -> None:
    """Something has to change before another attempt means anything."""
    assert crew_failure("PROVIDER_MODE_MISMATCH", "mismatch").retryable is False
    assert crew_failure("PRODUCTION_BRIEF_MISMATCH", "mismatch").retryable is False
    assert crew_failure("DECLINE_UNAVAILABLE", "unavailable").retryable is False


def test_an_unclassified_code_is_refused_rather_than_quietly_called_permanent() -> None:
    """The defect this table exists to prevent is a new code defaulting to False in silence."""
    with pytest.raises(UnclassifiedFailure, match="TOTALLY_NEW_CODE"):
        crew_failure("TOTALLY_NEW_CODE", "something happened")


def test_the_table_classifies_every_code_the_crew_itself_can_emit() -> None:
    """Read out of the source rather than restated, because this one is a completeness claim.

    A restated list would pass while a newly added `failed("...")` went unclassified, which is
    the opposite of what this asserts. `crew_failure` raises at runtime; this fails the build.
    """
    import re
    from pathlib import Path

    import vox_crew.crew as crew_module
    import vox_crew.recorded as recorded_module

    emitted: set[str] = set()
    for module in (crew_module, recorded_module):
        source = Path(module.__file__).read_text(encoding="utf-8")
        emitted.update(re.findall(r'crew_failure\(\s*"([A-Z_]+)"', source))
        emitted.update(re.findall(r'failed\(\s*"([A-Z_]+)"', source))

    assert emitted, "no failure codes were found; the scan itself is broken."
    assert emitted <= set(RETRYABLE_FAILURES)


def test_the_visual_vocabulary_serialises_in_a_stable_order() -> None:
    """It is built from sets, and a set's order is not stable across processes.

    An unsorted payload would put a different prompt in front of the same role on every run,
    which is the prefix identity ADR-0019 requires to hold inside a role.
    """
    vocabulary = VisualVocabulary(
        themes=frozenset({"editorial-paper", "editorial-cold"}),
        motion_intents=frozenset({"pushIn", "editorialStatic"}),
        color_roles=frozenset({"positive", "neutral"}),
        treatments=frozenset({"duotone", "cutout"}),
    )

    assert vocabulary.to_mapping() == {
        "themes": ["editorial-cold", "editorial-paper"],
        "motionIntents": ["editorialStatic", "pushIn"],
        "colorRoles": ["neutral", "positive"],
        "treatments": ["cutout", "duotone"],
    }
