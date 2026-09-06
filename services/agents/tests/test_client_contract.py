"""What every production client must do, asserted without knowing which one it is holding.

`test_local_client.py` keeps the expectations that are genuinely about the launcher — the argv
it builds, the working directory it runs in, the diagnostic it preserves when stdout is not an
envelope. Everything here is about the *interface*, and it runs over every implementation.

The failure mode this exists to prevent is a second client that passes its own tests. Two
implementations with two suites diverge in the direction of whatever the author of the second
one found convenient, and for this interface that direction is known in advance: the read-back
half, because moving bytes over a network is more annoying than reading a file.

**A test here that can tell which client it holds is a failing test**, and the last case in this
file says so structurally rather than trusting review.
"""

from __future__ import annotations

import hashlib
import inspect
import json
from pathlib import Path

import pytest
from client_harness import ClientHarness
from conftest import recorded
from in_memory_client import InMemoryProductionClient
from stub_service import SECRET, StubProductionService
from vox_crew.client import (
    ArtifactCorrupted,
    ArtifactMissing,
    ArtifactOutsideRun,
    ProductionClient,
    UnknownRun,
)
from vox_crew.envelopes import ArtifactDescriptor
from vox_crew.http_client import HttpProductionClient
from vox_crew.local_client import LocalProductionClient

RUN_ID = "0f6d4a3e-2c11-4c1a-9d7b-8a5f2e9c4d10"
REQUEST = {"protocolVersion": 1, "brief": {"id": "crew-tracer-bullet-v1", "text": "A Brief."}}
PLAN = {"beats": [{"id": "b1", "text": "One beat."}], "sections": []}
DECISION = {"protocolVersion": 1, "reason": "The catalog cannot serve this Brief."}
GRANT = {"protocolVersion": 1, "grantId": "g1", "runId": RUN_ID, "grant": "ab"}
IMAGE_REQUEST = {
    "protocolVersion": 1,
    "requirementId": "req_ccb9f349",
    "identityKey": "req_ccb9f349",
    "prompt": "A constrained image prompt.",
    "aspectRatio": "16:9",
    "outputMimeType": "image/png",
    "seed": 7,
    "requestSha256": "ab" * 32,
}
IMAGE_GRANT = {
    "protocolVersion": 1,
    "grantId": "image-grant-1",
    "runId": RUN_ID,
    "requestSha256": "ab" * 32,
    "issuedAt": "2026-09-06T12:00:00Z",
    "expiresAt": "2026-09-06T13:00:00Z",
    "grant": "signed",
}
BODY = json.dumps({"ok": False, "errors": [{"means": "m", "repair": "r"}]}).encode("utf-8")
ARTIFACT_PATH = f"artifacts/validation/{'3f' * 32}/report.json"

IMPLEMENTATIONS = (InMemoryProductionClient, LocalProductionClient, HttpProductionClient)


def descriptor(body: bytes = BODY, *, path: str = ARTIFACT_PATH) -> ArtifactDescriptor:
    return ArtifactDescriptor(
        kind="validation_report", path=path, sha256=hashlib.sha256(body).hexdigest()
    )


@pytest.fixture
def in_memory_harness() -> ClientHarness:
    client = InMemoryProductionClient()
    return ClientHarness(
        name="in-memory",
        client=client,
        open_run=lambda: client.init(REQUEST).run.id,
        publish=client.publish,
        staged=client.staged,
    )


@pytest.fixture
def local_harness(work_root: Path, launcher) -> ClientHarness:
    stub = launcher({"*": {"stdout": recorded("run-init-succeeded.stdout")}})
    client = LocalProductionClient(work_root, launcher_command=stub.command)
    directories: dict[str, str] = {}

    def open_run() -> str:
        envelope = client.init(REQUEST)
        argv = [json.loads(line)["argv"] for line in _log_lines(stub)][-1]
        directories[envelope.run.id] = argv[argv.index("--out") + 1]
        return envelope.run.id

    def publish(run_id: str, path: str, body: bytes) -> None:
        target = work_root / directories[run_id] / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)

    def staged(run_id: str, name: str):
        target = work_root / directories[run_id] / name
        if not target.is_file():
            return None
        return json.loads(target.read_text(encoding="utf-8"))

    return ClientHarness(
        name="local", client=client, open_run=open_run, publish=publish, staged=staged
    )


def _log_lines(stub) -> list[str]:
    return [json.dumps(invocation) for invocation in stub.invocations]


@pytest.fixture
def http_harness(admit_endpoint) -> ClientHarness:
    """A client speaking to a service on a loopback port this test opened and will close.

    The store behind the socket is the in-memory one, so a command means the same thing here as
    it does in the first harness and this one only carries it over a wire.
    """
    store = InMemoryProductionClient()
    service = StubProductionService(store)
    port = service.start()
    admit_endpoint("127.0.0.1", port)
    client = HttpProductionClient(f"http://127.0.0.1:{port}", key_source=lambda: SECRET)
    try:
        yield ClientHarness(
            name="http",
            client=client,
            open_run=lambda: client.init(REQUEST).run.id,
            publish=store.publish,
            staged=store.staged,
        )
    finally:
        service.stop()


@pytest.fixture(params=["in-memory", "local", "http"])
def harness(request) -> ClientHarness:
    return request.getfixturevalue(f"{request.param.replace('-', '_')}_harness")


# -- the interface itself ------------------------------------------------------------------


@pytest.mark.parametrize("implementation", IMPLEMENTATIONS)
def test_the_interface_never_takes_or_returns_a_path(implementation) -> None:
    """The defect the deployment seam names by name, caught structurally rather than by review.

    A path on this interface would work locally and strand the crew in the cloud, where the
    Run's disk is not the crew's disk. It is asserted over the abstract base *and over every
    implementation*, because an implementation is free to widen a signature and a base class
    that stayed clean would not notice.
    """
    forbidden = ("path", "root", "dir", "file", "cwd")
    for name, method in inspect.getmembers(ProductionClient, inspect.isfunction):
        if name.startswith("_"):
            continue
        signature = inspect.signature(getattr(implementation, name))
        for parameter in signature.parameters.values():
            if parameter.name == "self":
                continue
            assert not any(
                word in parameter.name.lower() for word in forbidden
            ), f"{implementation.__name__}.{name} takes a path-shaped parameter {parameter.name!r}"
            assert "Path" not in str(
                parameter.annotation
            ), f"{implementation.__name__}.{name} annotates {parameter.name!r} as a path"
        assert "Path" not in str(
            signature.return_annotation
        ), f"{implementation.__name__}.{name} returns a path"


@pytest.mark.parametrize("implementation", IMPLEMENTATIONS)
def test_every_implementation_is_the_interface(implementation) -> None:
    assert issubclass(implementation, ProductionClient)


@pytest.mark.parametrize("implementation", IMPLEMENTATIONS)
def test_no_implementation_adds_or_drops_a_method(implementation) -> None:
    """The seam does not move to suit a transport. If a network client wants a method, the
    seam is in the wrong place."""
    published = {
        name
        for name, _ in inspect.getmembers(ProductionClient, inspect.isfunction)
        if not name.startswith("_")
    }
    implemented = {
        name
        for name, member in inspect.getmembers(implementation, inspect.isfunction)
        if not name.startswith("_") and name in published
    }
    assert implemented == published


# -- opening and naming a Run ---------------------------------------------------------------


def test_a_run_opened_by_init_is_named_by_id_afterwards(harness: ClientHarness) -> None:
    run_id = harness.open_run()

    envelope = harness.client.status(run_id)

    assert envelope.run is not None and envelope.run.id == run_id


def test_refuses_a_run_id_it_cannot_place(harness: ClientHarness) -> None:
    with pytest.raises(UnknownRun):
        harness.client.status(harness.unknown_run_id)


# -- payloads crossing as objects ------------------------------------------------------------


def test_validates_a_plan_that_crossed_as_an_object(harness: ClientHarness) -> None:
    run_id = harness.open_run()

    harness.client.validate(run_id, PLAN)

    assert harness.staged(run_id, "plan.json") == PLAN


def test_carries_a_replacement_authorisation_as_an_object(harness: ClientHarness) -> None:
    run_id = harness.open_run()

    harness.client.record(run_id, replacement_authorisation=GRANT)

    assert harness.staged(run_id, "replacement-authorisation.json") == GRANT


def test_records_without_an_authorisation_when_none_is_given(harness: ClientHarness) -> None:
    run_id = harness.open_run()

    harness.client.record(run_id)

    assert harness.staged(run_id, "replacement-authorisation.json") is None


def test_declines_with_a_decision_object(harness: ClientHarness) -> None:
    run_id = harness.open_run()

    harness.client.decline(run_id, DECISION)

    assert harness.staged(run_id, "decision.json") == DECISION


def test_carries_image_requests_and_authorisation_as_objects(harness: ClientHarness) -> None:
    run_id = harness.open_run()

    harness.client.image_start(run_id, IMAGE_REQUEST, IMAGE_GRANT)

    assert harness.staged(run_id, "image-request.json") == IMAGE_REQUEST
    assert harness.staged(run_id, "image-authorisation.json") == IMAGE_GRANT


def test_carries_image_acceptance_and_rejection_as_objects(harness: ClientHarness) -> None:
    run_id = harness.open_run()
    acceptance = {"protocolVersion": 1, "jobId": "job-1", "candidateSha256": "cd" * 32}
    rejection = {"protocolVersion": 1, "jobId": "job-2"}

    harness.client.image_accept(run_id, acceptance)
    harness.client.image_reject(run_id, rejection)

    assert harness.staged(run_id, "image-acceptance.json") == acceptance
    assert harness.staged(run_id, "image-rejection.json") == rejection


# -- the read-back direction, which is the one the cloud phase turns on ----------------------


def test_retrieves_an_artifact_by_run_id_and_descriptor(harness: ClientHarness) -> None:
    run_id = harness.open_run()
    harness.publish(run_id, ARTIFACT_PATH, BODY)

    artifact = harness.client.fetch_artifact(run_id, descriptor())

    assert artifact.kind == "validation_report"
    assert artifact.data == BODY
    assert artifact.json()["errors"][0]["repair"] == "r"


def test_checks_the_digest_on_arrival(harness: ClientHarness) -> None:
    """The refusal that proves the digest is recomputed rather than echoed."""
    run_id = harness.open_run()
    harness.publish(run_id, ARTIFACT_PATH, b"different bytes")

    with pytest.raises(ArtifactCorrupted):
        harness.client.fetch_artifact(run_id, descriptor())


def test_reports_a_missing_artifact_as_missing(harness: ClientHarness) -> None:
    run_id = harness.open_run()

    with pytest.raises(ArtifactMissing):
        harness.client.fetch_artifact(run_id, descriptor(path="artifacts/absent.mp4"))


def test_refuses_to_read_outside_the_run_it_was_given(harness: ClientHarness) -> None:
    """The descriptor comes from an envelope, and no implementation takes that on trust."""
    run_id = harness.open_run()

    with pytest.raises(ArtifactOutsideRun):
        harness.client.fetch_artifact(run_id, descriptor(path="../request.json"))


def test_refuses_an_artifact_for_a_Run_it_cannot_place(harness: ClientHarness) -> None:
    with pytest.raises(UnknownRun):
        harness.client.fetch_artifact(harness.unknown_run_id, descriptor())


# -- the guard on this file itself -----------------------------------------------------------


def test_no_test_here_can_tell_which_client_it_holds() -> None:
    """Structural, and the same discipline the crew applies to the author seam.

    A contract test that named an implementation would be a launcher test that had wandered
    into the wrong file, and it would go on passing while quietly covering one client.
    """
    source = Path(__file__).read_text(encoding="utf-8")
    # The fixtures above the first marker name every implementation, because building one is
    # the whole of what they do. This guard itself sits below the last marker and names them
    # too. What is between the two is the contract, and it may name none of them.
    body = source.split("# -- the interface itself", 1)[1].split("# -- the guard on this file", 1)[
        0
    ]
    for name in ("LocalProductionClient", "InMemoryProductionClient", "HttpProductionClient"):
        assert name not in body, f"A contract test names {name}."
    assert "argv" not in body and "vox.exe" not in body
