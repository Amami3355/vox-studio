"""A complete Run, driven by a fixture plan and no model at all.

This is the Python counterpart of the scripted driver the proofs use, and it proves the whole
client surface for zero tokens: every verb the crew will ever call is exercised, while the
thing under test is the client rather than a model's judgement.

Everything here replays recorded envelopes through a stub launcher. No service, no key, no
quota, no network — the sentinel in `conftest.py` fails any test that reaches for one.
"""

from __future__ import annotations

import inspect
import json
from hashlib import sha256
from pathlib import Path

import pytest
from conftest import recorded, recorded_bytes
from vox_crew.client import Artifact, ProductionClient
from vox_crew.envelopes import (
    ArtifactDescriptor,
    MalformedEnvelope,
    ResultEnvelope,
    parse_envelope,
)
from vox_crew.local_client import LocalProductionClient
from vox_crew.producer import produce

RUN_ID = "0f6d4a3e-2c11-4c1a-9d7b-8a5f2e9c4d10"

REQUEST = {
    "protocolVersion": 1,
    "brief": {
        "id": "crew-complete-run-v1",
        "text": "A Brief the crew never edits, carried from a fresh Run to a rendered preview.",
    },
    "production": {
        "voice": {
            "provider": "elevenlabs",
            "voiceId": "crew-fixture-voice",
            "modelId": "eleven_multilingual_v2",
            "seed": 7,
        },
        "maxNewTakes": 1,
    },
}

# A fixture plan, not an authored one. Nothing here validates it — the stub launcher replies
# from a table and the compiler is the only authority on a plan's shape — so it is written to
# look like what ticket 07's planner will author, and to be obviously scripted.
PLAN = {
    "beats": [
        {"id": "b1", "text": "Two forecasts disagreed about the same winter."},
        {"id": "b2", "text": "One of them was built on last year's demand curve."},
        {"id": "b3", "text": "The other was not."},
    ],
    "sections": [
        {"id": "sec-opening", "beats": ["b1"], "scenes": ["scene-headline"]},
        {"id": "sec-evidence", "beats": ["b2", "b3"], "scenes": ["scene-figure"]},
    ],
}

DECISION = {
    "protocolVersion": 1,
    "kind": "unservable_brief",
    "summary": "The Brief asks for a comparison the catalog has no capability to draw.",
    "unmetNeeds": [
        {
            "need": "A side-by-side of two competing forecasts over the same axis.",
            "catalogGap": "No capability plots two series against one shared axis.",
        }
    ],
}

AUTHORISATION = {
    "protocolVersion": 1,
    "grantId": "grant-crew-fixture-1",
    "runId": RUN_ID,
    "recordingInputSha256": "ab" * 32,
    "issuedAt": "2026-08-24T09:00:00+00:00",
    "grant": "One replacement Take, authorised by the operator.",
}


def published(fixture: str, kind: str) -> ArtifactDescriptor:
    """The descriptor a fixture envelope publishes, read from the fixture rather than repeated.

    The bodies under `fixtures/artifacts/` are staged at these paths, so the paths have to come
    from the envelopes that name them or the two would drift apart silently.
    """
    descriptor = parse_envelope(recorded(fixture)).artifact(kind)
    assert descriptor is not None, f"{fixture} publishes no {kind}"
    return descriptor


PREFLIGHT_REPORT = published("run-preflight-succeeded.stdout", "preflight_report")
COMPILE_REPORT = published("run-compile-succeeded.stdout", "compile_report")
PREVIEW = published("run-render-succeeded.stdout", "preview")
VALIDATION_REPORT = published("run-validate-needs-repair.stdout", "validation_report")


def a_complete_run() -> dict:
    """The six commands a Run takes from initialise to rendered, and what each publishes."""
    return {
        "production run init": {"stdout": recorded("run-init-succeeded.stdout")},
        "production run validate": {"stdout": recorded("run-validate-succeeded.stdout")},
        "production run preflight": {
            "stdout": recorded("run-preflight-succeeded.stdout"),
            "artifacts": {PREFLIGHT_REPORT.path: recorded_bytes("preflight-report.json")},
        },
        "production run record": {"stdout": recorded("run-record-succeeded.stdout")},
        "production run compile": {
            "stdout": recorded("run-compile-succeeded.stdout"),
            "artifacts": {COMPILE_REPORT.path: recorded_bytes("compile-report.json")},
        },
        "production run render": {
            "stdout": recorded("run-render-succeeded.stdout"),
            "artifacts": {PREVIEW.path: recorded_bytes("preview.mp4")},
        },
    }


class InMemoryClient(ProductionClient):
    """A second implementation of the interface, holding no path and spawning nothing.

    It exists so the producer can be driven without the local client underneath it. Its bodies
    are the same fixture bodies the stub launcher stages, keyed by the kind their descriptors
    name, so the two implementations answer the same Run with the same bytes.
    """

    BODIES = {
        "preflight_report": "preflight-report.json",
        "compile_report": "compile-report.json",
        "preview": "preview.mp4",
    }

    def __init__(self) -> None:
        self.calls: list[str] = []

    def _replay(self, verb: str, fixture: str) -> ResultEnvelope:
        self.calls.append(verb)
        return parse_envelope(recorded(fixture))

    def contract_index(self) -> ResultEnvelope:
        return self._replay("contract_index", "contract-index.stdout")

    def contract_show(self, category: str) -> ResultEnvelope:
        return self._replay("contract_show", "contract-show-checks.stdout")

    def init(self, request) -> ResultEnvelope:
        return self._replay("init", "run-init-succeeded.stdout")

    def status(self, run_id: str) -> ResultEnvelope:
        return self._replay("status", "run-status-rendered.stdout")

    def validate(self, run_id: str, plan) -> ResultEnvelope:
        return self._replay("validate", "run-validate-succeeded.stdout")

    def preflight(self, run_id: str) -> ResultEnvelope:
        return self._replay("preflight", "run-preflight-succeeded.stdout")

    def record(self, run_id: str, replacement_authorisation=None) -> ResultEnvelope:
        return self._replay("record", "run-record-succeeded.stdout")

    def compile(self, run_id: str) -> ResultEnvelope:
        return self._replay("compile", "run-compile-succeeded.stdout")

    def render(self, run_id: str) -> ResultEnvelope:
        return self._replay("render", "run-render-succeeded.stdout")

    def decline(self, run_id: str, decision) -> ResultEnvelope:
        return self._replay("decline", "run-decline-declined.stdout")

    def fetch_artifact(self, run_id: str, artifact: ArtifactDescriptor) -> Artifact:
        self.calls.append("fetch_artifact")
        data = recorded_bytes(self.BODIES[artifact.kind])
        assert sha256(data).hexdigest() == artifact.sha256
        return Artifact(kind=artifact.kind, sha256=artifact.sha256, data=data)


def refused_at_validation() -> dict:
    """The same Run, refused where the compiler reads the plan. Nothing after it is reached."""
    return {
        **a_complete_run(),
        "production run validate": {
            "stdout": recorded("run-validate-needs-repair.stdout"),
            "exitCode": 1,
        },
    }


def client_for(work_root: Path, launcher, responses: dict) -> LocalProductionClient:
    stub = launcher(responses)
    client = LocalProductionClient(work_root, launcher_command=stub.command)
    client.stub = stub  # type: ignore[attr-defined]
    return client


def verbs(client: LocalProductionClient) -> list[str]:
    """The command each invocation named, as the launcher saw it."""
    return [" ".join(argv[:3]) for argv in client.stub.argvs]  # type: ignore[attr-defined]


def test_a_fixture_plan_carries_a_brief_from_a_fresh_run_to_a_rendered_preview(
    work_root, launcher
) -> None:
    client = client_for(work_root, launcher, a_complete_run())

    run = produce(client, REQUEST, PLAN)

    assert verbs(client) == [
        "production run init",
        "production run validate",
        "production run preflight",
        "production run record",
        "production run compile",
        "production run render",
    ]
    assert run.refusal is None
    assert run.rendered
    assert run.run_id == RUN_ID
    assert run.envelopes[-1].run is not None and run.envelopes[-1].run.stage == "rendered"


def test_the_preview_and_both_reports_come_back_through_artifact_retrieval(
    work_root, launcher
) -> None:
    """The read-back direction, which is the one the cloud phase turns on.

    Nothing above the client ever joins a Run root to a relative path: the crew hands back the
    descriptor the envelope published and receives bytes that hash to what it promised.
    """
    client = client_for(work_root, launcher, a_complete_run())

    run = produce(client, REQUEST, PLAN)

    preview = run.artifact("preview")
    assert preview is not None and preview.data == recorded_bytes("preview.mp4")
    preflight = run.artifact("preflight_report")
    assert preflight is not None
    assert preflight.json()["authority"] == "advisory"
    assert preflight.json()["duration"]["status"] == "available"
    compiled = run.artifact("compile_report")
    assert compiled is not None
    assert compiled.json()["ok"] is True
    assert compiled.json()["warnings"][0]["code"] == "SLOT_RELOCATED"


def test_the_reports_are_the_ones_the_envelopes_named(work_root, launcher) -> None:
    """Read back by descriptor, so a report that moved or changed is not quietly accepted."""
    client = client_for(work_root, launcher, a_complete_run())

    run = produce(client, REQUEST, PLAN)

    for descriptor in (PREVIEW, PREFLIGHT_REPORT, COMPILE_REPORT):
        artifact = run.artifact(descriptor.kind)
        assert artifact is not None
        assert artifact.sha256 == descriptor.sha256


def test_every_verb_the_command_surface_publishes_is_reachable_through_the_client(
    work_root, launcher
) -> None:
    """All ten commands, driven once.

    Two Runs, because a Run that has recorded a Take cannot be declined. The Run above is the
    one that shows the sequence; this one shows the surface is complete.
    """
    client = client_for(
        work_root,
        launcher,
        {
            "production contract index": {"stdout": recorded("contract-index.stdout")},
            "production contract show": {"stdout": recorded("contract-show-checks.stdout")},
            **a_complete_run(),
            "production run status": {"stdout": recorded("run-status-rendered.stdout")},
            "production run decline": {"stdout": recorded("run-decline-declined.stdout")},
        },
    )

    client.contract_index()
    client.contract_show("checks")
    produce(client, REQUEST, PLAN)
    client.status(RUN_ID)
    client.record(RUN_ID, replacement_authorisation=AUTHORISATION)
    unservable = client.init(REQUEST)
    assert unservable.run is not None
    client.decline(unservable.run.id, DECISION)

    assert verbs(client) == [
        "production contract index",
        "production contract show",
        "production run init",
        "production run validate",
        "production run preflight",
        "production run record",
        "production run compile",
        "production run render",
        "production run status",
        "production run record",
        "production run init",
        "production run decline",
    ]


def test_request_plan_decision_and_authorisation_all_arrive_as_objects(
    work_root, launcher
) -> None:
    """Payload-shaping applies to all four inputs, not just the plan.

    Each is handed to the client as an object and each is staged by the client, so the shape
    the crew works in is the shape the cloud implementation will take unchanged.
    """
    staged: dict[str, dict] = {}
    responses = {
        **a_complete_run(),
        "production run decline": {"stdout": recorded("run-decline-declined.stdout")},
    }
    client = client_for(work_root, launcher, responses)
    original = client._invoke

    def spy(argv):
        for flag in ("--request", "--plan", "--decision", "--replacement-authorisation"):
            if flag in argv:
                target = work_root / argv[argv.index(flag) + 1]
                staged[flag] = json.loads(target.read_text(encoding="utf-8"))
        return original(argv)

    client._invoke = spy  # type: ignore[method-assign]

    produce(client, REQUEST, PLAN)
    client.record(RUN_ID, replacement_authorisation=AUTHORISATION)
    client.decline(RUN_ID, DECISION)

    assert staged["--request"] == REQUEST
    assert staged["--plan"] == PLAN
    assert staged["--decision"] == DECISION
    assert staged["--replacement-authorisation"] == AUTHORISATION


def test_a_refused_command_comes_back_as_its_envelope(work_root, launcher) -> None:
    """A refusal is information the crew acts on. A client that raised would destroy it."""
    client = client_for(work_root, launcher, refused_at_validation())

    run = produce(client, REQUEST, PLAN)

    assert run.refusal is not None
    assert run.refusal.outcome == "needs_repair"
    assert run.refusal.raw == recorded("run-validate-needs-repair.stdout")
    assert not run.rendered
    # Stopped where it was refused. Nothing was recorded, compiled or rendered on a bad plan.
    assert verbs(client) == [
        "production run init",
        "production run validate",
    ]


def test_a_refusal_still_carries_the_report_that_explains_it(work_root, launcher) -> None:
    """The refusal names an artifact, and that artifact reads back like any other.

    This is the material ticket 08's repair loop works from: the codes, the fields and the
    expected values the compiler published, fetched by the descriptor the refusal carried.
    """
    responses = refused_at_validation()
    responses["production run validate"]["artifacts"] = {
        VALIDATION_REPORT.path: recorded_bytes("validation-report.json")
    }
    client = client_for(work_root, launcher, responses)

    run = produce(client, REQUEST, PLAN)

    assert run.refusal is not None and run.run_id is not None
    named = run.refusal.artifact("validation_report")
    assert named is not None
    report = client.fetch_artifact(run.run_id, named).json()
    assert report["ok"] is False
    assert [error["code"] for error in report["errors"]] == ["UNKNOWN_ACTION", "INVALID_PROPS"]
    assert report["errors"][0]["expected"] == ["countTo", "settle", "annotate"]


def test_a_failed_command_is_an_envelope_too(work_root, launcher) -> None:
    """`failed` exits non-zero and is still not an exception. Only an unreadable stdout is."""
    responses = {**a_complete_run()}
    responses["production run validate"] = {
        "stdout": recorded("run-validate-failed.stdout"),
        "exitCode": 1,
    }
    client = client_for(work_root, launcher, responses)

    run = produce(client, REQUEST, PLAN)

    assert run.refusal is not None
    assert run.refusal.outcome == "failed"
    assert run.refusal.error is not None and run.refusal.error.code == "INVALID_INPUT"


def test_an_init_that_succeeds_and_names_no_run_is_not_a_refusal(work_root, launcher) -> None:
    """A success with nothing in it. Every later call needs the Run this one did not publish."""
    opened = json.loads(recorded("run-init-succeeded.stdout"))
    opened["run"] = None
    responses = {**a_complete_run()}
    responses["production run init"] = {"stdout": json.dumps(opened) + "\n"}
    client = client_for(work_root, launcher, responses)

    with pytest.raises(MalformedEnvelope):
        produce(client, REQUEST, PLAN)

    assert verbs(client) == ["production run init"]


def test_the_caller_sees_every_envelope_verbatim_and_in_order(work_root, launcher) -> None:
    """What the crew is shown is what production said, not a rendering of it."""
    seen: list[str] = []
    client = client_for(work_root, launcher, a_complete_run())

    run = produce(client, REQUEST, PLAN, on_envelope=lambda envelope: seen.append(envelope.raw))

    assert seen == [envelope.raw for envelope in run.envelopes]
    assert seen == [
        recorded(name)
        for name in (
            "run-init-succeeded.stdout",
            "run-validate-succeeded.stdout",
            "run-preflight-succeeded.stdout",
            "run-record-succeeded.stdout",
            "run-compile-succeeded.stdout",
            "run-render-succeeded.stdout",
        )
    ]


def test_the_work_root_grows_nothing_but_the_run_it_opened(work_root, launcher) -> None:
    """The staged request is transient; the plan lives inside the Run it belongs to."""
    client = client_for(work_root, launcher, a_complete_run())

    run = produce(client, REQUEST, PLAN)

    entries = sorted(entry.name for entry in work_root.iterdir())
    added = [name for name in entries if name not in ("request.json", "vox.exe")]
    assert len(entries) == 3
    assert len(added) == 1 and added[0].startswith("run-")
    assert (work_root / added[0] / "plan.json").is_file()
    assert run.rendered


def test_the_producer_never_learns_where_a_run_lives() -> None:
    """The driver above the client is payload-shaped, like the client it drives.

    `produce` is what the planner will call once a model authors the plan, so a path reaching
    it would put path handling back above the deployment seam.
    """
    for parameter in inspect.signature(produce).parameters.values():
        assert not any(
            word in parameter.name.lower() for word in ("path", "root", "dir", "file", "cwd")
        ), f"produce takes a path-shaped parameter {parameter.name!r}"
        assert "Path" not in str(parameter.annotation)


def test_the_producer_drives_the_interface_and_not_an_implementation() -> None:
    """The deployment seam, exercised rather than asserted about (ADR-0015).

    This client spawns nothing and owns no directory — it is roughly the shape the cloud
    implementation will be, answering from what it was given. `produce` drives it to a
    rendered preview without a subprocess, a work root or a launcher, which is the property
    that makes the crew deployable later without touching the producer.
    """
    client = InMemoryClient()

    run = produce(client, REQUEST, PLAN)

    assert not isinstance(client, LocalProductionClient)
    assert run.rendered
    assert run.run_id == RUN_ID
    assert run.artifact("preview") is not None
    assert run.artifact("preflight_report").json()["authority"] == "advisory"
    assert client.calls == [
        "init",
        "validate",
        "preflight",
        "record",
        "compile",
        "render",
        "fetch_artifact",
        "fetch_artifact",
        "fetch_artifact",
    ]


@pytest.mark.parametrize("kind", ["preflight_report", "compile_report", "preview"])
def test_a_run_that_stopped_early_reads_back_nothing(work_root, launcher, kind) -> None:
    """A refused Run has no preview to offer, and does not pretend otherwise."""
    client = client_for(work_root, launcher, refused_at_validation())

    run = produce(client, REQUEST, PLAN)

    assert run.artifact(kind) is None
