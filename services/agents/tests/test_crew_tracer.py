"""The recorded whole-crew acceptance seam, including accepted and degraded image paths."""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import Mapping
from typing import Any

from vox_crew.client import Artifact, ProductionClient
from vox_crew.crew import ProductionCrew, UnservableBrief
from vox_crew.crew_contract import (
    Brief,
    CrewTerminal,
    Declined,
    OperatorPolicy,
    ProviderMode,
    Rendered,
    VisualVocabulary,
)
from vox_crew.crew_state import InMemoryCrewStateStore
from vox_crew.crew_evidence import (
    CREW_EVENTS,
    CREW_STATE,
    PRODUCTION_COMMANDS,
    assemble_crew_evidence,
)
from vox_crew.envelopes import ArtifactDescriptor, ResultEnvelope, parse_envelope
from vox_crew.evidence import PASS, verify
from vox_crew.image_generation import AssetRequirement
from vox_crew.recorded import ClientProductionAdapter, RecordedCreativeAdapter, RecordedResearchAdapter


PNG = bytes.fromhex("89504e470d0a1a0a0000000d494844520000000100000001")
PNG_SHA = hashlib.sha256(PNG).hexdigest()
REQUIREMENT = {
    "type": "image",
    "subject": "A night bus waiting outside a small railway station",
    "treatment": "photo",
    "orientation": "landscape",
}
REQUIREMENT_ID = AssetRequirement.from_mapping(REQUIREMENT).requirement_id
DOSSIER = {
    "schemaVersion": 1,
    "mode": "researched",
    "sources": [{"id": "s1", "title": "Transit archive", "url": "https://example.test/transit"}],
    "claims": [
        {
            "id": "c1",
            "text": "The last bus waits under the station clock.",
            "sourceIds": ["s1"],
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
    "angle": "The final departure",
    "hook": "The station clock governs the last journey.",
    "beats": [
        {
            "id": "b1",
            "text": "The last bus waits under the station clock.",
            "claimIds": ["c1"],
            "factual": True,
        }
    ],
}
BIBLE = {
    "schemaVersion": 1,
    "theme": "editorial-cold",
    "motionIntent": ["measured"],
    "colorRoles": ["ground", "accent"],
    "treatments": ["documentary"],
    "motifs": ["station clock"],
    "forbiddenTreatments": ["glossy"],
}
PLAN = {
    "beats": [{"id": "b1", "text": "The last bus waits under the station clock."}],
    "sections": [
        {
            "id": "station",
            "spansBeats": ["b1"],
            "scenes": [
                {
                    "id": "context",
                    "component": "image_context",
                    "layout": "splitLeft",
                    "spansBeats": ["b1"],
                    "props": {
                        "headline": "The final departure",
                        "caption": "A sourced factual scene.",
                        "assetRequirement": REQUIREMENT,
                    },
                }
            ],
        }
    ],
}
REQUEST = {
    "protocolVersion": 1,
    "brief": {"id": "tracer-brief", "text": "Explain the last bus."},
    "production": {
        "voice": {"provider": "elevenlabs", "voiceId": "recorded", "modelId": "recorded", "seed": 7},
        "maxNewTakes": 1,
    },
}


def envelope(
    command: str,
    *,
    run_id: str = "run-tracer",
    stage: str = "initialized",
    data: Mapping[str, Any] | None = None,
    artifacts: tuple[ArtifactDescriptor, ...] = (),
) -> ResultEnvelope:
    return parse_envelope(
        json.dumps(
            {
                "protocolVersion": 1,
                "command": command,
                "outcome": "succeeded",
                "run": {"id": run_id, "stage": stage},
                "data": data,
                "artifacts": [item.as_wire() for item in artifacts],
                "error": None,
                "next": [],
            }
        )
        + "\n"
    )


class TracerProductionClient(ProductionClient):
    def __init__(self, *, image_fails: bool = False) -> None:
        self.image_fails = image_fails
        self.accepted = False
        self.rejected = False
        self.job: Mapping[str, Any] | None = None
        self.calls: list[str] = []
        self.bytes: dict[str, bytes] = {}

    def _artifact(self, kind: str, name: str, data: bytes) -> ArtifactDescriptor:
        path = f"artifacts/{name}"
        self.bytes[path] = data
        return ArtifactDescriptor(kind, path, hashlib.sha256(data).hexdigest())

    def contract_index(self) -> ResultEnvelope:
        return envelope("contract.index")

    def contract_show(self, category: str) -> ResultEnvelope:
        return envelope("contract.show")

    def init(self, request: Mapping[str, Any]) -> ResultEnvelope:
        self.calls.append("init")
        return envelope("run.init")

    def status(self, run_id: str) -> ResultEnvelope:
        self.calls.append("status")
        return envelope("run.status", stage="compiled")

    def validate(self, run_id: str, plan: Mapping[str, Any]) -> ResultEnvelope:
        self.calls.append("validate")
        return envelope("run.validate", stage="validated")

    def preflight(self, run_id: str) -> ResultEnvelope:
        self.calls.append("preflight")
        report = self._artifact("preflight_report", "preflight.json", b"{}")
        return envelope("run.preflight", stage="preflighted", artifacts=(report,))

    def record(self, run_id: str, replacement_authorisation=None) -> ResultEnvelope:
        self.calls.append("record")
        return envelope("run.record", stage="recorded")

    def compile(self, run_id: str) -> ResultEnvelope:
        self.calls.append("compile")
        pending = not (
            self.accepted or self.rejected or (self.image_fails and self.job is not None)
        )
        report = self._artifact("compile_report", f"compile-{len(self.calls)}.json", b"{}")
        document = self._artifact("compiled_document", f"document-{len(self.calls)}.json", b"{}")
        return envelope(
            "run.compile",
            stage="compiled",
            data={
                "report": {"ok": True, "errorCount": 0, "warningCount": int(pending)},
                "assetWorklist": (
                    [{"requirementId": REQUIREMENT_ID, "sectionId": "station", "sceneId": "context", "field": "props.assetRequirement"}]
                    if pending
                    else []
                ),
            },
            artifacts=(document, report),
        )

    def render(self, run_id: str) -> ResultEnvelope:
        self.calls.append("render")
        marker = PNG_SHA.encode() if self.accepted else b"editorial-placeholder"
        preview = self._artifact("preview", f"preview-{len(self.calls)}.mp4", b"mp4:" + marker)
        return envelope("run.render", stage="rendered", artifacts=(preview,))

    def image_start(self, run_id: str, request: Mapping[str, Any], authorisation=None) -> ResultEnvelope:
        self.calls.append("image-start")
        candidate = None
        status = "failed" if self.image_fails else "candidate"
        failure = "Image generation did not produce a valid candidate." if self.image_fails else None
        artifacts: tuple[ArtifactDescriptor, ...] = ()
        if not self.image_fails:
            artifact = self._artifact("generated_image_candidate", "candidate.png", PNG)
            artifacts = (artifact,)
            candidate = {
                "id": f"image-candidate-{PNG_SHA[:20]}",
                "requirementId": REQUIREMENT_ID,
                "identityKey": REQUIREMENT_ID,
                "promptSha256": hashlib.sha256(str(request["prompt"]).encode()).hexdigest(),
                "artifact": artifact.as_wire(),
                "width": 1,
                "height": 1,
            }
        self.job = {
            "schemaVersion": 1,
            "id": "image-job-recorded",
            "requirementId": REQUIREMENT_ID,
            "identityKey": REQUIREMENT_ID,
            "requestSha256": request["requestSha256"],
            "providerMode": "recorded",
            "status": status,
            "candidate": candidate,
            "failure": failure,
        }
        return envelope("run.image.start", stage="compiled", data={"disposition": "created", "providerMode": "recorded", "job": self.job}, artifacts=artifacts)

    def image_status(self, run_id: str, job_id: str) -> ResultEnvelope:
        self.calls.append("image-status")
        assert self.job is not None
        artifacts = ()
        if isinstance(self.job.get("candidate"), Mapping):
            raw = self.job["candidate"]["artifact"]
            artifacts = (ArtifactDescriptor(raw["kind"], raw["path"], raw["sha256"]),)
        return envelope("run.image.status", stage="compiled", data={"job": self.job}, artifacts=artifacts)

    def image_accept(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        self.calls.append("image-accept")
        assert self.job is not None and decision["candidateSha256"] == PNG_SHA
        self.accepted = True
        self.job = {**self.job, "status": "accepted"}
        return envelope("run.image.accept", stage="compiled", data={"job": self.job})

    def image_reject(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        self.calls.append("image-reject")
        assert self.job is not None
        self.rejected = True
        self.job = {**self.job, "status": "rejected"}
        return envelope("run.image.reject", stage="compiled", data={"job": self.job})

    def decline(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        self.calls.append("decline")
        return envelope("run.decline", stage="declined")

    def fetch_artifact(self, run_id: str, artifact: ArtifactDescriptor) -> Artifact:
        data = self.bytes[artifact.path]
        assert hashlib.sha256(data).hexdigest() == artifact.sha256
        return Artifact(artifact.kind, artifact.sha256, data)


def policy() -> OperatorPolicy:
    return OperatorPolicy.from_mapping(
        {
            "schemaVersion": 1,
            "research": {"mode": "recorded", "grantId": None},
            "models": {"mode": "recorded", "grantId": None},
            "images": {"mode": "recorded", "grantId": None},
            "recording": {"mode": "recorded", "grantId": None},
        }
    )


def crew(client: ProductionClient, state=None, decision=lambda candidate: True) -> ProductionCrew:
    return ProductionCrew(
        RecordedResearchAdapter(DOSSIER),
        RecordedCreativeAdapter(NARRATIVE, BIBLE, PLAN),
        ClientProductionAdapter(
            client,
            REQUEST,
            recording_mode=ProviderMode.RECORDED,
            palettes={"editorial-cold": {"ground": "#0d121a", "accent": "#ff5a1f"}},
            image_decider=decision,
        ),
        visual_vocabulary=VisualVocabulary(
            themes=frozenset({"editorial-cold"}),
            motion_intents=frozenset({"measured"}),
            color_roles=frozenset({"ground", "accent"}),
            treatments=frozenset({"documentary", "glossy"}),
        ),
        state_store=state,
    )


def collect(subject: ProductionCrew):
    brief = Brief.from_mapping({"id": "tracer-brief", "text": "Explain the last bus.", "kind": "factual"})
    return asyncio.run(_collect(subject, brief))


def evidence(updates, state: InMemoryCrewStateStore):
    brief = Brief.from_mapping(
        {"id": "tracer-brief", "text": "Explain the last bus.", "kind": "factual"}
    )
    checkpoint = asyncio.run(state.load(brief.id))
    assert checkpoint is not None
    return assemble_crew_evidence(
        brief,
        policy(),
        updates,
        checkpoint,
        executed_at="2026-09-06T00:00:00Z",
    )


async def _collect(subject: ProductionCrew, brief: Brief):
    return [item async for item in subject.run(brief, policy())]


def test_recorded_whole_crew_accepts_one_digest_and_returns_a_preview_containing_it() -> None:
    client = TracerProductionClient()
    state = InMemoryCrewStateStore()
    updates = collect(crew(client, state))

    terminal = updates[-1]
    assert isinstance(terminal, CrewTerminal)
    assert isinstance(terminal.result, Rendered)
    assert any(PNG_SHA.encode() in data for path, data in client.bytes.items() if "preview-" in path)
    assert client.calls.count("image-start") == 1
    assert client.calls.count("image-accept") == 1
    image_event = next(item for item in updates if getattr(item, "phase", None) and item.phase.value == "image_creation")
    assert image_event.counts["accepted"] == 1
    assert image_event.artifacts[0].sha256 == PNG_SHA
    bundle = evidence(updates, state)
    assert bundle.verdict == PASS
    assert verify(bundle.files) == PASS
    assert b'"role":"research_agent"' in bundle.files[CREW_EVENTS]
    assert b'"outcome":"rendered"' in bundle.files[CREW_EVENTS]
    assert PNG_SHA.encode() in bundle.files[CREW_STATE]
    assert b'"command":"run.image.accept"' in bundle.files[PRODUCTION_COMMANDS]


def test_recorded_failure_compiles_and_renders_the_honest_placeholder() -> None:
    client = TracerProductionClient(image_fails=True)
    state = InMemoryCrewStateStore()
    updates = collect(crew(client, state))

    assert isinstance(updates[-1].result, Rendered)
    assert client.calls.count("image-start") == 1
    assert client.calls.count("image-accept") == 0
    assert any(b"editorial-placeholder" in data for data in client.bytes.values())
    image_event = next(item for item in updates if getattr(item, "phase", None) and item.phase.value == "image_creation")
    assert image_event.counts["failed"] == 1
    bundle = evidence(updates, state)
    assert verify(bundle.files) == PASS
    assert b'"status":"failed"' in bundle.files[CREW_STATE]


def test_human_decision_pause_resumes_the_same_job_without_another_provider_start() -> None:
    client = TracerProductionClient()
    state = InMemoryCrewStateStore()
    adapter = ClientProductionAdapter(
        client,
        REQUEST,
        recording_mode=ProviderMode.RECORDED,
        palettes={"editorial-cold": {"ground": "#0d121a", "accent": "#ff5a1f"}},
    )
    subject = ProductionCrew(
        RecordedResearchAdapter(DOSSIER),
        RecordedCreativeAdapter(NARRATIVE, BIBLE, PLAN),
        adapter,
        visual_vocabulary=VisualVocabulary(
            themes=frozenset({"editorial-cold"}),
            motion_intents=frozenset({"measured"}),
            color_roles=frozenset({"ground", "accent"}),
            treatments=frozenset({"documentary", "glossy"}),
        ),
        state_store=state,
    )

    first = collect(subject)
    adapter.set_image_decider(lambda candidate: True)
    resumed = collect(subject)

    assert first[-1].to_mapping()["outcome"] == "paused"
    assert isinstance(resumed[-1].result, Rendered)
    assert client.calls.count("image-start") == 1
    assert client.calls.count("image-status") == 1
    assert client.calls.count("record") == 1
    assert resumed[0].sequence == first[-1].sequence + 1


def test_unservable_brief_publishes_decline_without_take_or_image_spend() -> None:
    class UnservablePlanner:
        mode = ProviderMode.RECORDED

        async def plan(self, brief, dossier, narrative, visual_bible):
            raise UnservableBrief(
                "The catalog cannot show the required geographic route.",
                "A geographic route",
                "No published SceneCapability represents a map.",
            )

    client = TracerProductionClient()
    state = InMemoryCrewStateStore()
    subject = ProductionCrew(
        RecordedResearchAdapter(DOSSIER),
        RecordedCreativeAdapter(NARRATIVE, BIBLE, PLAN),
        ClientProductionAdapter(client, REQUEST, recording_mode=ProviderMode.RECORDED),
        visual_planner=UnservablePlanner(),
        visual_vocabulary=VisualVocabulary(
            themes=frozenset({"editorial-cold"}),
            motion_intents=frozenset({"measured"}),
            color_roles=frozenset({"ground", "accent"}),
            treatments=frozenset({"documentary", "glossy"}),
        ),
        state_store=state,
    )

    updates = collect(subject)

    assert isinstance(updates[-1].result, Declined)
    assert client.calls == ["init", "decline"]
    assert updates[-1].result.catalog_gap.startswith("No published SceneCapability")
    bundle = evidence(updates, state)
    assert verify(bundle.files) == PASS
    assert b'"command":"run.decline"' in bundle.files[PRODUCTION_COMMANDS]
    assert b'run.record' not in bundle.files[PRODUCTION_COMMANDS]
    assert b'run.image.start' not in bundle.files[PRODUCTION_COMMANDS]
