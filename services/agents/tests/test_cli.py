"""One command, headless, against a bootstrapped work root.

The command is the crew as an operator runs it, and as the proof harness's crew driver spawns
it: point it at a work root the bootstrap built, and it discovers the contracts, converges on
the Brief that work root carries, and leaves an evidence bundle beside the Run.

The tests drive it through the stub launcher rather than a stub client wherever the thing under
test is the command as a whole, because the command's job includes building its own client and
spawning the launcher, and a stub client would answer for both.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from conftest import recorded, recorded_bytes
from test_complete_run import (
    PLAN,
    VALIDATION_REPORT,
    a_complete_run,
    client_for,
    refused_at_validation,
    verbs,
)
from test_teaching_surface import CATEGORIES, StubClient, projection
from vox_crew import cli
from vox_crew.evidence import ASSERTIONS, COMMANDS, PASS, TRANSCRIPT, read_bundle, verify
from vox_crew.planner import AdkPlanAuthor, HandedPlanAuthor

EXPECTED = recorded("contract-index.stdout") + "".join(projection(name) for name in CATEGORIES)


def discovery() -> dict:
    """The six commands every convergence opens with, as the launcher answers them."""
    return {
        "production contract index": {"stdout": recorded("contract-index.stdout")},
        **{
            f"production contract show {category}": {"stdout": projection(category)}
            for category in CATEGORIES
        },
    }


def a_converging_work_root(work_root: Path, plan: dict | None = None) -> Path:
    """The bootstrap's two files, plus the plan an operator hands in."""
    (work_root / "plan.json").write_text(
        json.dumps(plan if plan is not None else PLAN, indent=2) + "\n",
        encoding="utf-8",
        newline="",
    )
    return work_root


def run_crew(work_root: Path, launcher, responses: dict, *argv: str) -> tuple[int, Any]:
    """The command, against a launcher that replays the responses it was given."""
    client = client_for(work_root, launcher, responses)
    code = cli.main(
        ["--work-root", str(work_root), "--plan", "plan.json", *argv], client=client
    )
    return code, client


# --- Converging, which is what the command is for ----------------------------------------


def test_a_handed_plan_carries_the_briefs_work_root_to_a_rendered_preview(
    work_root, launcher, capsys
) -> None:
    """The whole command: discovery, authoring, the Run, and the bundle it leaves behind."""
    a_converging_work_root(work_root)

    code, client = run_crew(work_root, launcher, {**discovery(), **a_complete_run()})

    assert code == 0
    assert verbs(client) == [
        "production contract index",
        *["production contract show" for _ in CATEGORIES],
        "production run init",
        "production run validate",
        "production run preflight",
        "production run record",
        "production run compile",
        "production run render",
    ]


def test_the_run_leaves_a_bundle_that_reads_back_and_verifies(work_root, launcher) -> None:
    """Ticket 10 built the bundle and left the caller here. This is the caller.

    Nothing in the crew persisted one before this command did: `converge` was reached only from
    tests, so "each run persists its transcript and every command envelope" was a criterion no
    run in existence could be held to.
    """
    a_converging_work_root(work_root)

    run_crew(work_root, launcher, {**discovery(), **a_complete_run()})

    written = read_bundle(work_root / "evidence")
    assert verify(written) == PASS
    assert COMMANDS in written and TRANSCRIPT in written


def test_the_bundles_commands_start_at_discovery_and_not_at_the_run(work_root, launcher) -> None:
    """The contract index and the five projections are commands the Run was authored against.

    They arrive on the surface rather than on the Run, and a bundle that started at `run.init`
    would be six commands short of what the crew actually asked production for.
    """
    a_converging_work_root(work_root)

    run_crew(work_root, launcher, {**discovery(), **a_complete_run()})

    written = read_bundle(work_root / "evidence")
    logged = [json.loads(line) for line in written[COMMANDS].decode("utf-8").splitlines()]
    assert [entry["command"] for entry in logged][:2] == ["contract.index", "contract.show"]
    assert len(logged) == 12


def test_stdout_is_every_envelope_the_convergence_saw_and_nothing_else(
    work_root, launcher, capsys
) -> None:
    """The same contract the tracer bullet had, over a whole Run rather than over discovery."""
    a_converging_work_root(work_root)

    run_crew(work_root, launcher, {**discovery(), **a_complete_run()})

    written = read_bundle(work_root / "evidence")
    logged = [json.loads(line) for line in written[COMMANDS].decode("utf-8").splitlines()]
    out = capsys.readouterr().out
    assert out.startswith(EXPECTED)
    assert out.count("\n") == len(logged)


def test_the_work_root_grows_the_run_and_the_bundle_and_nothing_else(
    work_root, launcher
) -> None:
    """The invariant the isolation assertion reads, kept by a command that writes two things.

    The Run directory is production's, and the bundle is the crew's own evidence. A staged
    request is not among them: it is written transiently for `run init` and taken away again.
    """
    a_converging_work_root(work_root)
    before = {entry.name for entry in work_root.iterdir()}

    run_crew(work_root, launcher, {**discovery(), **a_complete_run()})

    grown = {entry.name for entry in work_root.iterdir()} - before
    assert "evidence" in grown
    assert len(grown) == 2, grown


def test_a_run_that_did_not_render_still_leaves_a_bundle_and_reports_it(
    work_root, launcher, capsys
) -> None:
    """Every ending gets a bundle, and only a rendered one gets a zero exit.

    An operator reads the exit code and a driver reads the bundle. The Run that stopped is the
    one whose evidence matters most, so the ending that produced no preview is not the ending
    that produces no record.
    """
    a_converging_work_root(work_root)
    responses = {
        **discovery(),
        **a_complete_run(),
        "production run record": {"stdout": recorded("run-record-paused-budget.stdout")},
    }

    code, _ = run_crew(work_root, launcher, responses)

    assert code == 1
    written = read_bundle(work_root / "evidence")
    assert ASSERTIONS in written and COMMANDS in written
    assert "paused" in capsys.readouterr().err


def test_the_bundle_goes_where_it_was_told_to_go(work_root, launcher) -> None:
    """`write_bundle` is handed its root, and this is the caller that hands it one."""
    a_converging_work_root(work_root)

    run_crew(
        work_root, launcher, {**discovery(), **a_complete_run()}, "--evidence", "run-evidence"
    )

    assert (work_root / "run-evidence").is_dir()
    assert not (work_root / "evidence").exists()


# --- What the command refuses -------------------------------------------------------------


def test_refuses_a_work_root_that_was_never_bootstrapped(tmp_path, capsys) -> None:
    exit_code = cli.main(["--work-root", str(tmp_path / "nowhere")], client=None)

    assert exit_code == 2
    assert "work root" in capsys.readouterr().err.lower()


def test_refuses_a_work_root_that_carries_no_brief(tmp_path, capsys) -> None:
    """The bootstrap's invariant is two files, and one of them is the Brief."""
    root = tmp_path / "crew"
    root.mkdir()
    (root / "vox.exe").write_bytes(b"MZ-not-really-a-launcher")

    exit_code = cli.main(["--work-root", str(root)], client=None)

    assert exit_code == 2
    assert "request.json" in capsys.readouterr().err


def test_refuses_a_handed_plan_that_is_not_there(work_root, capsys) -> None:
    exit_code = cli.main(
        ["--work-root", str(work_root), "--plan", "absent.json"], client=StubClient("")
    )

    assert exit_code == 2
    assert "absent.json" in capsys.readouterr().err


def test_a_refused_plan_nobody_can_repair_is_reported_rather_than_resubmitted(
    work_root, launcher, capsys
) -> None:
    """A handed plan cannot answer a refusal, and the command says which plan and why.

    The alternative is the crew resubmitting the plan it was handed until the budget runs out
    and reporting `budget-exhausted`, which would read as a crew that could not converge rather
    than as an operator whose plan production will not take.
    """
    a_converging_work_root(work_root)
    # The refusal is read back before it is answered, so the report the compiler published has
    # to be there: a convergence reads what production said, not only that it said no.
    refused = refused_at_validation()
    refused["production run validate"]["artifacts"] = {
        VALIDATION_REPORT.path: recorded_bytes("validation-report.json")
    }

    code, client = run_crew(work_root, launcher, {**discovery(), **refused})

    assert code == 1
    # One validate, not five. The refusal is reported in the compiler's own codes, which is
    # what an operator needs to fix the plan they handed in.
    assert verbs(client).count("production run validate") == 1
    assert "UNKNOWN_ACTION" in capsys.readouterr().err


def test_a_finished_run_reports_what_it_put_in_front_of_a_model(
    work_root, launcher, capsys
) -> None:
    """The measurement reaches an operator without their having to open the bundle.

    On stderr, like everything else the crew has to say. Stdout is production's envelopes and
    a character count is not one of them.
    """
    a_converging_work_root(work_root)

    run_crew(work_root, launcher, {**discovery(), **a_complete_run()})

    said = capsys.readouterr().err
    assert "1 model ask" in said
    assert "put in front of a model" in said


def test_a_teaching_surface_too_large_for_the_budget_is_reported_and_nothing_is_opened(
    work_root, launcher, capsys, monkeypatch
) -> None:
    """The refusal `converge` raises reaches an operator as a message, not a traceback.

    Reported the way a leaking prompt is reported, because it is the same kind of finding: the
    crew's own prompt does not fit what it is budgeted, and no Run can be spent discovering it.
    """
    a_converging_work_root(work_root)
    monkeypatch.setattr("vox_crew.context.RESIDENT_CHARS_ALLOWED", 10)

    code, client = run_crew(work_root, launcher, {**discovery(), **a_complete_run()})

    assert code == 1
    assert "production run init" not in verbs(client)
    said = capsys.readouterr().err
    assert "vox-crew:" in said and "characters" in said


# --- The tracer bullet, still there --------------------------------------------------------


def test_discovery_only_reads_the_teaching_surface_and_stops(work_root, capsys) -> None:
    """The diagnostic the command used to be: is the boundary alive, and what does it teach?

    It writes nothing and opens no Run, so it is the one thing safe to run against a work root
    whose Brief has already been converged on.
    """
    exit_code = cli.main(
        ["--work-root", str(work_root), "--discovery-only"],
        client=StubClient(recorded("contract-index.stdout")),
    )

    assert exit_code == 0
    assert capsys.readouterr().out == EXPECTED


def test_discovery_only_leaves_the_work_root_exactly_as_it_found_it(work_root) -> None:
    before = {entry.name: entry.stat().st_size for entry in work_root.iterdir()}

    cli.main(
        ["--work-root", str(work_root), "--discovery-only"],
        client=StubClient(recorded("contract-index.stdout")),
    )

    assert {entry.name: entry.stat().st_size for entry in work_root.iterdir()} == before


def test_reports_a_refused_discovery_without_losing_what_it_read(work_root, capsys) -> None:
    exit_code = cli.main(
        ["--work-root", str(work_root), "--discovery-only"],
        client=StubClient(recorded("run-validate-failed.stdout")),
    )

    captured = capsys.readouterr()
    assert exit_code == 1
    # The refusing envelope is still on stdout. An operator debugging a broken boundary needs
    # what production said, not the crew's exception.
    assert captured.out == recorded("run-validate-failed.stdout")
    assert "INVALID_INPUT" in captured.err


# --- The arguments -------------------------------------------------------------------------


def test_defaults_the_launcher_to_the_one_in_the_work_root(work_root) -> None:
    arguments = cli.parse_arguments(["--work-root", str(work_root)])

    assert arguments.work_root == work_root
    assert arguments.launcher == [str(Path(work_root) / "vox.exe")]


def test_takes_a_launcher_command_for_development(work_root) -> None:
    arguments = cli.parse_arguments(
        ["--work-root", str(work_root), "--launcher", "python", "--launcher", "stub.py"]
    )

    assert arguments.launcher == ["python", "stub.py"]


def test_the_bundle_lands_beside_the_run_by_default(work_root) -> None:
    """Both paths are inside the work root, because that is the only disk the crew has."""
    arguments = cli.parse_arguments(["--work-root", str(work_root)])

    assert arguments.evidence == work_root / "evidence"
    assert arguments.plan is None


def test_a_handed_plan_selects_the_author_that_cannot_reach_a_model(work_root) -> None:
    """Which author the command holds is the whole difference between free and billed.

    Nothing else in the crew branches on it: `converge` takes a `PlanAuthor` and cannot tell
    which one it has, which is what makes the deterministic end-to-end run the same code path
    as the live one.
    """
    a_converging_work_root(work_root)
    arguments = cli.parse_arguments(["--work-root", str(work_root), "--plan", "plan.json"])

    assert isinstance(cli.author_for(arguments), HandedPlanAuthor)


def test_no_handed_plan_means_the_live_author_and_a_model_credential(work_root) -> None:
    pytest.importorskip("google.adk")
    arguments = cli.parse_arguments(["--work-root", str(work_root)])

    assert isinstance(cli.author_for(arguments), AdkPlanAuthor)


def test_the_default_model_is_the_authors_own(work_root) -> None:
    """An invocation that names no model asks for none, rather than restating the pin here.

    The pin and the test that keeps it served both live at the author. A default repeated in
    the command would be a second place to update when a family is retired, and the one that
    would be missed.
    """
    arguments = cli.parse_arguments(["--work-root", str(work_root)])

    assert arguments.model is None


def test_an_invocation_can_choose_the_model_that_authors_the_plan(work_root) -> None:
    """The showcase run wants a pro model; the default is flash and stays flash.

    Without this the seam `AdkPlanAuthor(model=...)` exists but nothing can reach it, and the
    only way to run the showcase on a different model would be to edit the default — which is
    exactly the change the pinning test refuses.
    """
    pytest.importorskip("google.adk")
    arguments = cli.parse_arguments(
        ["--work-root", str(work_root), "--model", "gemini-3.1-flash-lite"]
    )
    author = cli.author_for(arguments)

    assert isinstance(author, AdkPlanAuthor)
    # Read through the author rather than off it: what matters is the model the agent is built
    # on, which is the value that reaches the framework.
    assert author.agent("instructions").model == "gemini-3.1-flash-lite"


def test_choosing_a_model_for_a_handed_plan_is_refused(work_root) -> None:
    """A handed plan reaches no model at all, so naming one is a misunderstanding, not a no-op.

    Accepting it silently would let a run be launched believing it had chosen an author it
    never had, and the bundle would say `handed-plan` while the operator read a model name.
    """
    a_converging_work_root(work_root)

    with pytest.raises(SystemExit):
        cli.parse_arguments(
            ["--work-root", str(work_root), "--plan", "plan.json", "--model", "gemini-3.6-pro"]
        )
