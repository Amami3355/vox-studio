"""The production client: one interface, payload-shaped, with a local implementation.

These run a real subprocess against a stub launcher, so everything from the method call to the
command line is under test. Only the service behind the pipe is replaced.
"""

from __future__ import annotations

import hashlib
import inspect
import json
from pathlib import Path

import pytest
from conftest import recorded
from vox_crew.client import (
    ArtifactCorrupted,
    ArtifactMissing,
    ArtifactOutsideRun,
    ProductionClient,
    UnknownRun,
)
from vox_crew.envelopes import ArtifactDescriptor, MalformedEnvelope
from vox_crew.local_client import LocalProductionClient

RUN_ID = "0f6d4a3e-2c11-4c1a-9d7b-8a5f2e9c4d10"
REQUEST = {"protocolVersion": 1, "brief": {"id": "crew-tracer-bullet-v1", "text": "A Brief."}}
PLAN = {"beats": [{"id": "b1", "text": "One beat."}], "sections": []}
INITIALISED = "run-init-succeeded.stdout"


def client_for(work_root: Path, launcher, responses: dict) -> LocalProductionClient:
    stub = launcher(responses)
    client = LocalProductionClient(work_root, launcher_command=stub.command)
    client.stub = stub  # type: ignore[attr-defined]
    return client


def initialised(work_root: Path, launcher) -> tuple[LocalProductionClient, str]:
    """A client that has initialised one Run, with the log cleared and the directory known."""
    client = client_for(work_root, launcher, {"*": {"stdout": recorded(INITIALISED)}})
    client.init(REQUEST)
    argv = client.stub.argvs[0]
    directory = argv[argv.index("--out") + 1]
    client.stub.forget()
    return client, directory


def test_the_interface_never_takes_or_returns_a_path() -> None:
    """The defect this ticket names by name, caught structurally rather than by review.

    A path on this interface would work locally and strand the crew in the cloud phase, where
    the Run's disk is not the crew's disk. The local implementation is the only module allowed
    to know a Run has a directory, so the interface it implements may not mention one.
    """
    forbidden = ("path", "root", "dir", "file", "cwd")
    for name, method in inspect.getmembers(ProductionClient, inspect.isfunction):
        if name.startswith("_"):
            continue
        signature = inspect.signature(method)
        for parameter in signature.parameters.values():
            if parameter.name == "self":
                continue
            assert not any(
                word in parameter.name.lower() for word in forbidden
            ), f"ProductionClient.{name} takes a path-shaped parameter {parameter.name!r}"
            assert "Path" not in str(
                parameter.annotation
            ), f"ProductionClient.{name} annotates {parameter.name!r} as a path"
        assert "Path" not in str(
            signature.return_annotation
        ), f"ProductionClient.{name} returns a path"


def test_the_local_implementation_is_the_interface() -> None:
    assert issubclass(LocalProductionClient, ProductionClient)


def test_asks_for_the_contract_index_from_inside_the_work_root(work_root, launcher) -> None:
    raw = recorded("contract-index.stdout")
    client = client_for(work_root, launcher, {"production contract index": {"stdout": raw}})

    envelope = client.contract_index()

    assert envelope.raw == raw
    assert client.stub.argvs == [["production", "contract", "index"]]
    # Working directory is the boundary: relative arguments resolve inside the work root, and
    # nothing on the audit trail names the host machine.
    assert Path(client.stub.invocations[0]["cwd"]).resolve() == work_root.resolve()


def test_asks_for_a_named_projection(work_root, launcher) -> None:
    raw = recorded("contract-show-checks.stdout")
    client = client_for(work_root, launcher, {"production contract show checks": {"stdout": raw}})

    assert client.contract_show("checks").raw == raw
    assert client.stub.argvs == [["production", "contract", "show", "checks"]]


def test_initialises_a_run_from_a_request_object(work_root, launcher) -> None:
    client = client_for(work_root, launcher, {"*": {"stdout": recorded(INITIALISED)}})

    envelope = client.init(REQUEST)

    assert envelope.run is not None and envelope.run.id == RUN_ID
    argv = client.stub.argvs[0]
    assert argv[:3] == ["production", "run", "init"]
    # The Run gets its own directory, chosen here; the caller never named one.
    out = argv[argv.index("--out") + 1]
    assert out.startswith("run-") and "/" not in out


def test_leaves_the_work_root_holding_only_what_it_started_with(work_root, launcher) -> None:
    """The staged request is transient. The work root grows nothing but its Run directories."""
    client = client_for(work_root, launcher, {"*": {"stdout": recorded(INITIALISED)}})

    client.init(REQUEST)

    # The stub launcher never creates the Run directory, so what is left is what was added.
    assert sorted(entry.name for entry in work_root.iterdir()) == ["request.json", "vox.exe"]


def test_stages_the_request_where_production_can_read_it(work_root, launcher) -> None:
    """What is staged has to be the caller's object, still readable when the command runs."""
    seen: dict = {}
    client = client_for(work_root, launcher, {"*": {"stdout": recorded(INITIALISED)}})
    original = client._invoke

    def spy(argv):
        staged = work_root / argv[argv.index("--request") + 1]
        seen["request"] = json.loads(staged.read_text(encoding="utf-8"))
        return original(argv)

    client._invoke = spy  # type: ignore[method-assign]
    client.init(REQUEST)
    assert seen["request"] == REQUEST


def test_validates_a_plan_object_against_a_run_id(work_root, launcher) -> None:
    client, directory = initialised(work_root, launcher)

    client.validate(RUN_ID, PLAN)

    argv = client.stub.argvs[0]
    assert argv[:3] == ["production", "run", "validate"]
    assert argv[argv.index("--run") + 1] == directory
    plan_argument = argv[argv.index("--plan") + 1]
    # The plan is authored into the Run's own directory, where an audit can find it later.
    assert plan_argument == f"{directory}/plan.json"
    assert json.loads((work_root / plan_argument).read_text(encoding="utf-8")) == PLAN


@pytest.mark.parametrize(
    ("call", "verb"),
    [
        (lambda client: client.status(RUN_ID), "status"),
        (lambda client: client.preflight(RUN_ID), "preflight"),
        (lambda client: client.record(RUN_ID), "record"),
        (lambda client: client.compile(RUN_ID), "compile"),
        (lambda client: client.render(RUN_ID), "render"),
    ],
)
def test_every_run_verb_names_the_run_by_id(work_root, launcher, call, verb) -> None:
    client, directory = initialised(work_root, launcher)

    call(client)

    assert client.stub.argvs[0] == ["production", "run", verb, "--run", directory]


def test_carries_a_replacement_authorisation_as_an_object(work_root, launcher) -> None:
    grant = {"protocolVersion": 1, "grantId": "g1", "runId": RUN_ID, "grant": "ab"}
    client, directory = initialised(work_root, launcher)

    client.record(RUN_ID, replacement_authorisation=grant)

    argv = client.stub.argvs[0]
    staged = argv[argv.index("--replacement-authorisation") + 1]
    assert json.loads((work_root / staged).read_text(encoding="utf-8")) == grant


def test_declines_with_a_decision_object(work_root, launcher) -> None:
    decision = {"protocolVersion": 1, "reason": "The catalog cannot serve this Brief."}
    client, directory = initialised(work_root, launcher)

    client.decline(RUN_ID, decision)

    argv = client.stub.argvs[0]
    assert argv[:3] == ["production", "run", "decline"]
    staged = argv[argv.index("--decision") + 1]
    assert json.loads((work_root / staged).read_text(encoding="utf-8")) == decision


def test_finds_a_run_it_did_not_initialise(work_root, launcher) -> None:
    """A Run id resolves from the work root alone, so a second process can pick one up."""
    directory = work_root / "run-abandoned"
    directory.mkdir()
    (directory / "run.json").write_text(json.dumps({"runId": RUN_ID}), encoding="utf-8")
    client = client_for(work_root, launcher, {"*": {"stdout": recorded(INITIALISED)}})

    client.status(RUN_ID)

    assert client.stub.argvs[0] == ["production", "run", "status", "--run", "run-abandoned"]


def test_refuses_a_run_id_it_cannot_place(work_root, launcher) -> None:
    client = client_for(work_root, launcher, {"*": {"stdout": recorded(INITIALISED)}})
    with pytest.raises(UnknownRun):
        client.status("a-run-that-was-never-initialised")


def test_retrieves_an_artifact_by_run_id_and_descriptor(work_root, launcher) -> None:
    client, directory = initialised(work_root, launcher)
    body = json.dumps({"ok": False, "errors": [{"means": "m", "repair": "r"}]}).encode("utf-8")
    report = work_root / directory / "artifacts" / "validation" / ("3f" * 32)
    report.mkdir(parents=True)
    (report / "report.json").write_bytes(body)
    descriptor = ArtifactDescriptor(
        kind="validation_report",
        path=f"artifacts/validation/{'3f' * 32}/report.json",
        sha256=hashlib.sha256(body).hexdigest(),
    )

    artifact = client.fetch_artifact(RUN_ID, descriptor)

    assert artifact.kind == "validation_report"
    assert artifact.data == body
    assert artifact.json()["errors"][0]["repair"] == "r"


def test_refuses_an_artifact_whose_bytes_moved(work_root, launcher) -> None:
    client, directory = initialised(work_root, launcher)
    (work_root / directory / "artifacts").mkdir(parents=True)
    (work_root / directory / "artifacts" / "report.json").write_bytes(b"different bytes")
    descriptor = ArtifactDescriptor(
        kind="validation_report", path="artifacts/report.json", sha256="0" * 64
    )

    with pytest.raises(ArtifactCorrupted):
        client.fetch_artifact(RUN_ID, descriptor)


def test_reports_a_missing_artifact_as_missing(work_root, launcher) -> None:
    client, directory = initialised(work_root, launcher)
    descriptor = ArtifactDescriptor(kind="preview", path="artifacts/absent.mp4", sha256="0" * 64)

    with pytest.raises(ArtifactMissing):
        client.fetch_artifact(RUN_ID, descriptor)


def test_refuses_to_read_outside_the_run_it_was_given(work_root, launcher) -> None:
    """The descriptor comes from an envelope, but the client does not take that on trust."""
    client, directory = initialised(work_root, launcher)
    descriptor = ArtifactDescriptor(kind="brief", path="../request.json", sha256="0" * 64)

    with pytest.raises(ArtifactOutsideRun):
        client.fetch_artifact(RUN_ID, descriptor)


def test_says_so_when_production_writes_something_that_is_not_an_envelope(
    work_root, launcher
) -> None:
    client = client_for(
        work_root,
        launcher,
        {"*": {"stdout": "", "stderr": "vox: Production service is unavailable.\n", "exitCode": 1}},
    )
    with pytest.raises(MalformedEnvelope) as refusal:
        client.contract_index()
    # The launcher's own diagnostic is the operator's only clue; it has to survive.
    assert "Production service is unavailable" in str(refusal.value)
