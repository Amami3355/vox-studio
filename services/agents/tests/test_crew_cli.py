"""The production crew as an operator actually reaches it: one command, one work root.

Everything under `test_crew_tracer.py` proves the crew converges when something builds it. This
proves the something exists. The command is what turns an assembled module into a product an
operator can run, and until it did, the crew had no entry point outside a test.

The client is injected rather than launched, because what is under test here is the command's
own work — reading the policy, declaring the Brief's kind, choosing recorded providers over live
ones, writing the checkpoint and the bundle — and a stub launcher would answer for the client
instead of exercising any of it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from conftest import recorded
from test_crew_tracer import DOSSIER, NARRATIVE, PLAN, TracerProductionClient
from vox_crew import cli
from vox_crew.crew_evidence import CREW_EVENTS, CREW_STATE
from vox_crew.crew_run import CHECKPOINTS
from vox_crew.envelopes import parse_envelope
from vox_crew.evidence import NOT_EVIDENCED, PASS, read_bundle, verify

BRIEF = {"id": "cli-crew-brief", "text": "Explain the last bus."}

# Every value here is one the published contract offers. That is the property under test as much
# as the run is: an art direction the crew invented would be refused by the vocabulary the
# catalog publishes, and the recordings are the only place this suite could smuggle one in.
BIBLE = {
    "schemaVersion": 1,
    "theme": "editorial-cold",
    "motionIntent": ["editorialStatic"],
    "colorRoles": ["neutral", "positive"],
    "treatments": ["photo"],
    "motifs": ["station clock"],
    "forbiddenTreatments": ["duotone"],
}

REQUEST = {
    "protocolVersion": 1,
    "brief": BRIEF,
    "production": {
        "voice": {
            "provider": "elevenlabs",
            "voiceId": "recorded",
            "modelId": "recorded",
            "seed": 7,
        },
        "maxNewTakes": 1,
    },
}


class CrewCliClient(TracerProductionClient):
    """The tracer's Run, answering discovery from the recorded projections beside it."""

    def contract_index(self):
        self.calls.append("contract.index")
        return parse_envelope(recorded("contract-index.stdout"))

    def contract_show(self, category: str):
        self.calls.append(f"contract.show:{category}")
        return parse_envelope(recorded(f"contract-show-{category}.stdout"))


def a_crew_work_root(work_root: Path, *, recordings: bool = True) -> Path:
    """What the bootstrap leaves, plus the recordings a free run replays instead of paying."""
    (work_root / "request.json").write_text(
        json.dumps(REQUEST, indent=2) + "\n", encoding="utf-8", newline=""
    )
    if recordings:
        (work_root / "recordings.json").write_text(
            json.dumps(
                {
                    "researchDossier": DOSSIER,
                    "narrative": NARRATIVE,
                    "visualBible": BIBLE,
                    "videoPlan": PLAN,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
            newline="",
        )
    return work_root


def run(work_root: Path, *argv: str, client: Any | None = None) -> tuple[int, Any]:
    subject = client if client is not None else CrewCliClient()
    code = cli.main(
        [
            "--work-root",
            str(work_root),
            "--crew",
            "--recordings",
            "recordings.json",
            *argv,
        ],
        client=subject,
    )
    return code, subject


# --- The command runs the crew ------------------------------------------------------------


def test_one_command_carries_a_brief_through_every_phase_to_a_rendered_preview(
    work_root, capsys
) -> None:
    """The whole crew, from the operator's side: one invocation, one Brief, one preview."""
    a_crew_work_root(work_root)

    code, client = run(work_root, "--images", "accept")

    assert code == 0
    assert "run.render" in "".join(client.calls) or "render" in client.calls
    phases = capsys.readouterr().err
    for phase in ("research", "narrative", "art_direction", "visual_planning", "production"):
        assert phase in phases


def test_the_phases_go_to_stderr_and_stdout_stays_the_interfaces_own_record(
    work_root, capsys
) -> None:
    """The two streams keep the meaning every other invocation gives them.

    A run redirected to a file is production's envelopes and nothing else, which is what makes
    that file a record of what the interface said rather than of what the crew thought about it.
    """
    a_crew_work_root(work_root)

    run(work_root, "--images", "accept")

    captured = capsys.readouterr()
    for line in captured.out.splitlines():
        assert json.loads(line)["protocolVersion"] == 1
    assert "vox-crew:" not in captured.out
    assert "vox-crew:" in captured.err


def test_a_candidate_stops_the_run_for_a_human_by_default(work_root, capsys) -> None:
    """The decision this product exists to keep human is not taken by a default.

    Nothing about the run is lost, and the pause is deliberately *not* written as the
    checkpoint's terminal: a stored terminal is what a resumed invocation replays instead of
    continuing, so recording one here would make the operator's decision unanswerable. What is
    stored is every phase already paid for, which is exactly what the next invocation must not
    buy twice.
    """
    a_crew_work_root(work_root)

    code, _ = run(work_root)

    assert code == 1
    assert "waiting for human review" in capsys.readouterr().err
    state = json.loads(
        (work_root / "evidence" / CHECKPOINTS / "cli-crew-brief.json").read_text("utf-8")
    )
    assert state["terminal"] is None
    assert state["research"] is not None and state["narrative"] is not None
    assert state["videoPlan"] is not None and state["productionState"]["runId"]


def test_the_run_leaves_a_crew_bundle_that_reads_back_and_verifies(work_root) -> None:
    """The evidence a multi-agent Run has to leave, written by the command rather than a test."""
    a_crew_work_root(work_root)

    run(work_root, "--images", "accept")

    written = read_bundle(work_root / "evidence" / "crew")
    assert verify(written) == PASS
    assert CREW_EVENTS in written and CREW_STATE in written


def test_a_resumed_run_repeats_no_completed_phase(work_root) -> None:
    """What the checkpoint is for: the second invocation does not pay for the first one's work.

    The pause is the natural place to prove it, because it is the one an operator actually meets:
    they stop to look at a candidate, and what they come back to must not be a second Run.
    """
    a_crew_work_root(work_root)
    # One client across both invocations, because that is what a production service is: it
    # outlives the process that talked to it, and the job the first invocation started is still
    # there for the second to observe rather than start again.
    service = CrewCliClient()
    run(work_root, client=service)

    code, _ = run(work_root, "--images", "accept", client=service)

    assert code == 0
    assert service.calls.count("init") == 1


def test_each_attempt_leaves_its_own_bundle_rather_than_merging_into_the_last(work_root) -> None:
    """A bundle root is refused rather than merged into, and a resumed Run still leaves evidence.

    The alternative is the one a resumed operator would actually meet: the run works, the
    checkpoint advances, and the only record of it fails to be written because a previous
    attempt already occupied the directory.
    """
    a_crew_work_root(work_root)
    service = CrewCliClient()
    run(work_root, client=service)

    run(work_root, "--images", "accept", client=service)

    # The paused attempt's own verdict is `not-evidenced` and not `pass`: its checkpoint
    # deliberately holds no terminal, so the assertion that would bind one has nothing to
    # measure. A Run that measured nothing must not report that it passed.
    assert verify(read_bundle(work_root / "evidence" / "crew")) == NOT_EVIDENCED
    assert verify(read_bundle(work_root / "evidence" / "crew-2")) == PASS


# --- What the command refuses before it opens anything --------------------------------------


def test_a_handed_plan_and_a_crew_are_two_different_runs(work_root) -> None:
    """Refused rather than resolved by precedence: either reading silently drops the other."""
    a_crew_work_root(work_root)
    (work_root / "plan.json").write_text("{}", encoding="utf-8", newline="")

    with pytest.raises(SystemExit) as refusal:
        cli.main(["--work-root", str(work_root), "--crew", "--plan", "plan.json"])

    assert refusal.value.code == 2


@pytest.mark.parametrize(
    "argv",
    [
        ["--policy", "policy.json"],
        ["--recordings", "recordings.json"],
        ["--images", "accept"],
        ["--brief-kind", "fictional"],
    ],
)
def test_a_crew_flag_without_a_crew_is_a_misunderstanding_and_not_a_default(
    work_root, argv: list[str]
) -> None:
    """Ignoring it would let an operator believe they configured a run they never asked for."""
    a_crew_work_root(work_root)

    with pytest.raises(SystemExit) as refusal:
        cli.main(["--work-root", str(work_root), *argv])

    assert refusal.value.code == 2


def test_a_recorded_phase_without_recordings_is_refused_before_a_run_is_opened(
    work_root, capsys
) -> None:
    """No Run, no provider, nothing to recover: a fact about the invocation, reported as one."""
    a_crew_work_root(work_root, recordings=False)
    client = CrewCliClient()

    code = cli.main(["--work-root", str(work_root), "--crew"], client=client)

    assert code == 2
    assert "recordings" in capsys.readouterr().err
    assert "init" not in client.calls


def test_a_brief_that_is_not_factual_is_never_researched_and_needs_no_dossier(
    work_root, capsys
) -> None:
    """The zero-call path, asserted from the operator's side.

    A fictional Brief makes no research call at all, so it is not asked for a dossier to replay
    either — and the crew still reaches a preview, because nothing downstream of research needed
    one.
    """
    a_crew_work_root(work_root, recordings=False)
    # Its Beats cite nothing and claim nothing factual, which is the only narrative a Brief with
    # no dossier behind it can honestly carry: a factual Beat with no claim to stand on is
    # refused, and that refusal is what stops fiction acquiring borrowed authority.
    invented = {
        **NARRATIVE,
        "beats": [{**beat, "claimIds": [], "factual": False} for beat in NARRATIVE["beats"]],
    }
    (work_root / "recordings.json").write_text(
        json.dumps({"narrative": invented, "visualBible": BIBLE, "videoPlan": PLAN}),
        encoding="utf-8",
        newline="",
    )

    code, _ = run(work_root, "--brief-kind", "fictional", "--images", "accept")

    assert code == 0
    phases = capsys.readouterr().err
    assert "research · director · skipped" in phases or "skipped" in phases
    assert "providerCalls=0" in phases


def test_only_the_recorded_phases_are_asked_for_a_recording(work_root, capsys) -> None:
    """A live research phase is not asked for a dossier the Run will never read.

    The refusal names the documents that are actually missing, because "supply recordings" is
    not an instruction an operator can act on when three of the four are already there.
    """
    a_crew_work_root(work_root, recordings=False)
    (work_root / "recordings.json").write_text(
        json.dumps({"researchDossier": DOSSIER, "narrative": NARRATIVE}), encoding="utf-8", newline=""
    )
    client = CrewCliClient()

    code = run(work_root, client=client)[0]

    assert code == 2
    refusal = capsys.readouterr().err
    assert "visualBible" in refusal and "videoPlan" in refusal
    assert "researchDossier" not in refusal and "narrative" not in refusal
    assert "init" not in client.calls


def test_a_policy_that_is_not_one_is_refused_rather_than_repaired(work_root, capsys) -> None:
    """A policy decides what may be spent, so a half-read one is not a policy at all."""
    a_crew_work_root(work_root)
    (work_root / "policy.json").write_text(
        json.dumps({"schemaVersion": 1, "research": {"mode": "live"}}),
        encoding="utf-8",
        newline="",
    )
    client = CrewCliClient()

    code = run(work_root, "--policy", "policy.json", client=client)[0]

    assert code == 2
    assert "policy" in capsys.readouterr().err
    assert "init" not in client.calls


def test_the_default_policy_reaches_no_live_provider(work_root) -> None:
    """A bare crew invocation spends nothing, so spending stays the deliberate act."""
    a_crew_work_root(work_root)

    code, _ = run(work_root, "--images", "accept")

    assert code == 0
    written = read_bundle(work_root / "evidence" / "crew")
    assert b'"live"' not in written[CREW_EVENTS]
