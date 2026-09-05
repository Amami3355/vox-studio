"""What is true of the local client because it is the launcher's, and of no other client.

These run a real subprocess against a stub launcher, so everything from the method call to the
command line is under test. Only the service behind the pipe is replaced.

**The expectations that are about the interface are not here.** They moved to
`test_client_contract.py`, which runs them over every implementation, and what is left is the
part a second client cannot satisfy and should not be asked to: the argv this one builds, the
working directory it runs in, where it stages a payload on the caller's own disk, how it finds a
Run directory it did not open, and the launcher diagnostic it preserves when stdout is not an
envelope.

The split is why a network client can be held to the same suite at all. A test that asserts an
argv is not a stricter version of a test that asserts a plan crossed as an object — it is a
different test, about a mechanism, and leaving the two mixed is what makes a second
implementation arrive with a suite of its own.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from conftest import recorded
from vox_crew.envelopes import MalformedEnvelope
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
