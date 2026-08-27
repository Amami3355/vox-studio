"""The evidence bundle: what a Run leaves behind, and whether it still reads true afterwards.

Everything here runs a real convergence against recorded envelopes and then asks what the
bundle made of it, because a bundle assembled from a hand-built `ConvergedRun` would be a test
of the assembler against a shape this crew never produces. The Runs are the same four endings
`test_converge.py` drives, and the bundle is asserted from its own bytes — the tests read what
would be written, not what the assembler happens to hold.
"""

from __future__ import annotations

import json
from dataclasses import replace
from hashlib import sha256
from pathlib import Path
from typing import Any

import pytest
from conftest import recorded, recorded_bytes
from test_complete_run import REQUEST, RUN_ID
from test_converge import RepairingAuthor, a_client, a_catalog_following_plan, a_repaired_plan
from vox_crew.context import tokens
from vox_crew.converge import (
    BUDGET_EXHAUSTED,
    PAUSED,
    RENDERED,
    STOPPED,
    ConvergedRun,
    converge,
)
from vox_crew.evidence import (
    ARTIFACTS,
    ASSERTIONS,
    COMMANDS,
    ENVIRONMENT,
    FAIL,
    HASH_INDEX,
    NOT_EVIDENCED,
    PASS,
    SUMMARY,
    TRANSCRIPT,
    BundleInvalid,
    EvidenceBundle,
    EvidenceLeaked,
    assemble,
    read_bundle,
    verify,
    write_bundle,
)
from vox_crew.context import tokens
from vox_crew.planner import scan_for_leaks


def a_rendered_run() -> ConvergedRun:
    """The Run that converged cleanly: one plan, one Take, a preview."""
    return converge(a_client(), REQUEST, RepairingAuthor(a_catalog_following_plan()))


def a_repaired_run() -> ConvergedRun:
    """A Run that was refused once before the Take and repaired into a preview."""
    client = a_client(
        validate=["run-validate-needs-repair.stdout", "run-validate-succeeded.stdout"]
    )
    return converge(
        client, REQUEST, RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())
    )


def an_exhausted_run() -> ConvergedRun:
    """The budget ran out before the plan was accepted, and the ending names the line."""
    return converge(
        a_client(validate=["run-validate-needs-repair.stdout"]),
        REQUEST,
        RepairingAuthor(a_catalog_following_plan()),
    )


def a_stopped_run() -> ConvergedRun:
    """`failed` is not a refusal. There is a report-less error and nothing to author against."""
    return converge(
        a_client(validate=["run-validate-failed.stdout"]),
        REQUEST,
        RepairingAuthor(a_catalog_following_plan()),
    )


def a_paused_run() -> ConvergedRun:
    """The ending an operator has to act on: production stopped before the network."""
    return converge(
        a_client(record=["run-record-paused-budget.stdout"]),
        REQUEST,
        RepairingAuthor(a_catalog_following_plan()),
    )


def lines(files: Any, name: str) -> list[dict[str, Any]]:
    return [json.loads(line) for line in files[name].decode("utf-8").splitlines() if line]


def document(files: Any, name: str) -> dict[str, Any]:
    return json.loads(files[name].decode("utf-8"))


def outcomes(files: Any) -> dict[str, str]:
    return {
        item["id"]: item["outcome"] for item in document(files, ASSERTIONS)["assertions"]
    }


# --- Every command envelope, in the order it was issued --------------------------------------


def test_every_envelope_reaches_the_command_transcript_in_the_order_it_arrived() -> None:
    """The first criterion. Discovery included: the crew's Run starts before its Run does."""
    run = a_repaired_run()

    records = lines(assemble(run).files, COMMANDS)

    trail = [*run.surface.envelopes, *run.envelopes]
    assert [record["command"] for record in records] == [
        envelope.command for envelope in trail
    ]
    assert [record["ordinal"] for record in records] == list(range(1, len(trail) + 1))
    assert records[0]["command"] == "contract.index"
    assert records[1]["command"] == "contract.show"
    assert records[6]["command"] == "run.init"


def test_the_command_transcript_carries_the_bytes_production_wrote() -> None:
    """Byte for byte, and hashed, because a paraphrased envelope is not evidence of one."""
    run = a_rendered_run()

    records = lines(assemble(run).files, COMMANDS)

    trail = [*run.surface.envelopes, *run.envelopes]
    for record, envelope in zip(records, trail, strict=True):
        assert record["envelope"] == envelope.raw
        assert record["sha256"] == sha256(envelope.raw.encode("utf-8")).hexdigest()
        assert record["outcome"] == envelope.outcome
    assert records[-1]["envelope"] == recorded("run-render-succeeded.stdout")


# --- The crew's own material ----------------------------------------------------------------


def test_the_transcript_carries_every_plan_version_including_the_one_withheld() -> None:
    """A withheld version exists nowhere else: it was authored and never submitted.

    The assertion sheets count what a model *authored*, so a bundle that carried only the
    submitted versions would under-report the thing the budget exists to bound.
    """
    client = a_client(
        compile=["run-compile-needs-repair.stdout", "run-compile-succeeded.stdout"],
        record=["run-record-succeeded.stdout", "run-record-reused.stdout"],
    )
    author = RepairingAuthor(
        a_catalog_following_plan(), _a_rewritten_plan(), a_repaired_plan()
    )
    run = converge(client, REQUEST, author)

    plans = [
        record for record in lines(assemble(run).files, TRANSCRIPT) if record["kind"] == "plan"
    ]

    assert [record["disposition"] for record in plans] == [
        "submitted",
        "submitted",
        "withheld",
    ]
    assert [record["plan"] for record in plans[:2]] == [
        version.plan for version in run.versions
    ]
    assert plans[2]["plan"] == run.withheld[0].plan


def test_the_transcript_opens_with_the_brief_the_run_answered() -> None:
    """An operator's own prose, carried whole. It is the one input the crew never edits."""
    records = lines(assemble(a_rendered_run()).files, TRANSCRIPT)

    assert records[0]["kind"] == "task"
    assert records[0]["brief"] == REQUEST["brief"]


def test_a_refusal_record_is_anchored_to_the_command_that_carried_it() -> None:
    """The ordered spine is `commands.jsonl`; everything else hangs off it by digest.

    A `ConvergedRun` does not record which refusal a withheld version answered, so the
    transcript groups by kind rather than inventing an interleaving it cannot know. Anchoring
    each refusal to the envelope's digest is what makes the order recoverable anyway.
    """
    run = a_repaired_run()
    files = assemble(run).files

    refusals = [
        record for record in lines(files, TRANSCRIPT) if record["kind"] == "refusal"
    ]
    digests = {record["sha256"] for record in lines(files, COMMANDS)}

    assert len(refusals) == 1
    assert refusals[0]["envelopeSha256"] in digests
    assert refusals[0]["codes"] == list(run.refusals[0].codes)
    assert refusals[0]["report"] == run.refusals[0].report


def test_the_crews_own_findings_travel_with_the_version_they_are_about() -> None:
    """`review()` has had nowhere to publish since it was written. This is where."""
    run = a_rendered_run()

    plans = [
        record for record in lines(assemble(run).files, TRANSCRIPT) if record["kind"] == "plan"
    ]

    assert [finding["code"] for finding in plans[0]["findings"]] == [
        finding.code for finding in run.versions[0].findings
    ]


def test_whether_the_author_pointed_at_anything_is_a_number_in_the_bundle() -> None:
    """"Did this Run's author reach for the word anchor" stops being a plan to open.

    The whole deixis effort turns on that question, and until this it was answerable only by
    reading every event of every scene — twice, for anyone comparing two Runs. The
    before-and-after measurement the rule is closed by is a subtraction over these numbers.
    """
    run = a_rendered_run()

    plans = [
        record for record in lines(assemble(run).files, TRANSCRIPT) if record["kind"] == "plan"
    ]
    deixis = plans[0]["deixis"]

    events = [
        event
        for section in run.versions[0].plan["sections"]
        for scene in section["scenes"]
        for event in scene.get("events", ())
    ]

    assert deixis["wordAnchors"] + deixis["boundaryAnchors"] == len(events)
    assert deixis["scenes"] == sum(
        len(section["scenes"]) for section in run.versions[0].plan["sections"]
    )
    assert deixis["scenesThatPointed"] <= deixis["scenes"]


def test_a_word_anchor_is_counted_apart_from_the_gesture_it_is_not() -> None:
    """The gap between the two counts is the finding, so they may never be the same number.

    An author may anchor a non-deictic verb to a spoken word. That is legal, it is not a
    pointing gesture, and a bundle that folded the two together would report a Run as having
    pointed when it had only cut on a word. `pointingEvents` reads the catalog's own
    `deicticFields`, so the distinction is the manifest's rather than this module's.
    """
    run = a_rendered_run()
    plan = run.versions[0].plan
    scene = plan["sections"][0]["scenes"][0]
    scene["events"] = [
        {"at": "b2.word:gauge", "action": "annotate", "payload": {"label": "Larkmouth", "text": "x"}}
    ]

    plans = [
        record for record in lines(assemble(run).files, TRANSCRIPT) if record["kind"] == "plan"
    ]
    deixis = plans[0]["deixis"]

    assert deixis["wordAnchors"] == 1
    assert deixis["pointingEvents"] == 0
    assert deixis["scenesThatPointed"] == 0


def test_the_instructions_are_recorded_by_digest_and_not_a_second_time() -> None:
    """They are the contracts, and the contracts are already in the bundle verbatim.

    `commands.jsonl` carries the discovery envelopes whole, which is where every byte of an
    instruction text but the preamble comes from. Writing them again — once per authored
    version — would make the largest thing in the bundle its most repeated one.
    """
    run = a_repaired_run()
    files = assemble(run).files

    plans = [record for record in lines(files, TRANSCRIPT) if record["kind"] == "plan"]

    assert [record["instructionsSha256"] for record in plans] == [
        sha256(version.instructions.encode("utf-8")).hexdigest() for version in run.versions
    ]
    for version in run.versions:
        assert version.instructions.encode("utf-8") not in files[TRANSCRIPT]


def test_the_terminal_record_hands_over_the_decision_a_pause_is_waiting_on() -> None:
    """In production's own words: the command it named and the reason it gave for naming it."""
    run = a_paused_run()

    terminal = lines(assemble(run).files, TRANSCRIPT)[-1]

    assert terminal["kind"] == "terminal"
    assert terminal["outcome"] == PAUSED
    assert [item["reason"] for item in terminal["decision"]] == [
        command.reason for command in run.decision
    ]
    assert terminal["decision"]


# --- The Run's artifacts, by descriptor -----------------------------------------------------


def test_the_artifacts_are_carried_under_the_kinds_production_named_them_by() -> None:
    """Named by kind and nothing else. The crew is never told what a kind's bytes are."""
    run = a_rendered_run()

    files = assemble(run).files

    for artifact in run.artifacts:
        assert files[f"artifacts/{artifact.kind}"] == artifact.data
        assert sha256(files[f"artifacts/{artifact.kind}"]).hexdigest() == artifact.sha256
    assert files["artifacts/preview"] == recorded_bytes("preview.mp4")


def test_the_bundle_carries_the_proof_bundles_own_file_names() -> None:
    """The names are the criterion, not an implementation detail.

    Everything else in this file reads the bundle through the constants, so renaming one would
    leave the whole suite green while the bundle quietly stopped being readable beside a proof
    bundle. These are the names `verifyProofBundle` and the proofs' own `walk` expect, written
    out once as literals so that the rename has somewhere to fail.
    """
    files = assemble(a_rendered_run()).files

    assert {name for name in files if not name.startswith("artifacts/")} == {
        "SUMMARY.md",
        "environment.json",
        "commands.jsonl",
        "agent-transcript.jsonl",
        "assertions.json",
        "hash-index.json",
    }
    assert ARTIFACTS == "artifacts"


def test_a_run_that_never_rendered_carries_what_it_did_publish() -> None:
    """A paused Run has a Preflight report and no preview, and the bundle says exactly that."""
    files = assemble(a_paused_run()).files

    assert files["artifacts/preflight_report"] == recorded_bytes("preflight-report.json")
    assert "artifacts/preview" not in files
    assert "artifacts/compile_report" not in files


# --- The assertion evaluation ----------------------------------------------------------------


def test_a_clean_run_passes_the_assertions_it_can_observe() -> None:
    """The limits, the single dispatch, the compile and the preview it reached."""
    files = assemble(a_rendered_run()).files

    verdict = outcomes(files)

    assert document(files, ASSERTIONS)["machineVerdict"] == PASS
    for name in (
        "contracts.all-categories",
        "limits.plan-versions",
        "limits.validate-calls",
        "limits.preflight-calls",
        "limits.post-record-plan-versions",
        "network.one-provider-dispatch",
        "record.one-take-used",
        "run.rendered",
        "compile.green",
        "compile.zero-errors",
        "preflight.advisory-wording",
        "preflight.minimum-risk-cleared",
        "evidence.agent-transcript",
        "evidence.command-transcript",
    ):
        assert verdict[name] == PASS, name


def test_the_budget_the_limits_are_read_against_is_the_runs_own() -> None:
    """Not a constant. The Brief's length set it, and the bundle reports it as the expectation."""
    run = a_rendered_run()

    items = {
        item["id"]: item for item in document(assemble(run).files, ASSERTIONS)["assertions"]
    }

    assert items["limits.plan-versions"]["expected"] == f"<={run.budget.plan_versions}"
    assert items["limits.validate-calls"]["expected"] == f"<={run.budget.validate_calls}"
    assert items["limits.preflight-calls"]["expected"] == f"<={run.budget.preflight_calls}"


def test_the_limits_restate_the_sheets_own_numbers_and_not_only_the_runs_fields() -> None:
    """The assertion above is true of any budget, including a wrong one.

    `evaluateNorthbridgeAssertions` bounds `limits.validate-calls` by `authoringVersions` and
    `limits.preflight-calls` by `cycles`, where `cycles = 2 + ceil(targetSeconds / 60)` and
    `authoringVersions = cycles + 2`. The crew reaches the same numbers through differently
    named fields, so nothing but a literal catches the day one of the two derivations moves.
    Ticket 12 scores this Run against the real sheet; this is what it should agree with.
    """
    items = {
        item["id"]: item
        for item in document(assemble(a_rendered_run()).files, ASSERTIONS)["assertions"]
    }

    # The Brief asks for 25 seconds: cycles = 3, authoringVersions = 5.
    assert items["limits.plan-versions"]["expected"] == "<=5"
    assert items["limits.validate-calls"]["expected"] == "<=5"
    assert items["limits.preflight-calls"]["expected"] == "<=3"
    assert items["limits.post-record-plan-versions"]["expected"] == "<=2"


def test_what_the_run_never_reached_is_not_evidenced_rather_than_failed() -> None:
    """The sheet's third outcome, used for what it is for.

    A paused Run never compiled, so there is no compile report to judge and saying it failed
    would be the bundle reporting a breach it never measured. `run.rendered` is a different
    matter: the Run was measured against it and did not render.
    """
    files = assemble(a_paused_run()).files

    verdict = outcomes(files)

    assert verdict["compile.green"] == NOT_EVIDENCED
    assert verdict["compile.zero-errors"] == NOT_EVIDENCED
    assert verdict["record.one-take-used"] == NOT_EVIDENCED
    assert verdict["run.rendered"] == FAIL
    assert verdict["preflight.advisory-wording"] == PASS
    assert document(files, ASSERTIONS)["machineVerdict"] == FAIL


def test_all_four_endings_assemble_a_bundle_that_verifies() -> None:
    """Only one of them rendered, and all four are auditable. That is the point of the four.

    A stopped Run stopped before a Take, so it has no artifacts to carry and its bundle is the
    envelopes, the versions and the error production named — which is exactly what an operator
    reads to decide whether to run it again.
    """
    endings = {
        RENDERED: a_rendered_run(),
        BUDGET_EXHAUSTED: an_exhausted_run(),
        PAUSED: a_paused_run(),
        STOPPED: a_stopped_run(),
    }

    for outcome, run in endings.items():
        bundle = assemble(run)
        assert run.outcome == outcome
        assert verify(bundle.files) == bundle.verdict, outcome
        assert lines(bundle.files, TRANSCRIPT)[-1]["outcome"] == outcome
        assert document(bundle.files, ENVIRONMENT)["outcome"] == outcome
    assert document(assemble(endings[BUDGET_EXHAUSTED]).files, ENVIRONMENT)["limit"] == (
        "plan_versions"
    )


def test_a_run_stopped_before_a_take_carries_the_refusal_that_stopped_it() -> None:
    """Nothing production published is in `READ_BACK`, so there is nothing to read back.

    The bundle is not empty for it. The envelopes are there, the plan that was refused is
    there, and so is the error production named — which is the material an operator decides
    from, and the reason an ending with no artifacts still gets a bundle.
    """
    run = a_stopped_run()

    files = assemble(run).files

    assert run.run_id == RUN_ID
    assert not [name for name in files if name.startswith("artifacts/")]
    refusals = [record for record in lines(files, TRANSCRIPT) if record["kind"] == "refusal"]
    assert [record["outcome"] for record in refusals] == ["failed"]


def test_every_assertion_names_evidence_the_bundle_actually_carries() -> None:
    """An assertion pointing at a file that is not there is the sheet's own malformed case."""
    for run in (a_rendered_run(), an_exhausted_run(), a_paused_run(), a_stopped_run()):
        files = assemble(run).files
        for item in document(files, ASSERTIONS)["assertions"]:
            assert item["evidence"], item["id"]
            for name in item["evidence"]:
                assert name in files, (item["id"], name)


def test_the_machine_verdict_is_the_worst_outcome_present() -> None:
    """`fail` above `not-evidenced`, exactly as the sheet aggregates it."""
    assert document(assemble(a_rendered_run()).files, ASSERTIONS)["machineVerdict"] == PASS
    assert document(assemble(a_paused_run()).files, ASSERTIONS)["machineVerdict"] == FAIL


def test_a_run_that_failed_nothing_and_could_not_measure_something_is_not_evidenced() -> None:
    """The third outcome as an aggregate, which is the case ticket 12 is scored under.

    Both branches above resolve to `pass` or `fail`, so the middle one — nothing found wrong
    and something not shown right — was never reached by a test even though it is the verdict
    the crew phase is expected to earn. A rendered Run whose compile report was not published
    is the smallest way to reach it: nothing failed, and two assertions have no material.
    """
    run = a_rendered_run()
    without_compile = replace(
        run, artifacts=tuple(a for a in run.artifacts if a.kind != "compile_report")
    )

    files = assemble(without_compile).files

    assert outcomes(files)["compile.green"] == NOT_EVIDENCED
    assert outcomes(files)["run.rendered"] == PASS
    assert FAIL not in set(outcomes(files).values())
    assert document(files, ASSERTIONS)["machineVerdict"] == NOT_EVIDENCED
    assert verify(files) == NOT_EVIDENCED


# --- The bundle reads true afterwards ---------------------------------------------------------


def test_a_bundle_verifies_from_its_own_bytes_with_nothing_else_present() -> None:
    """The last criterion: no crew, no client, no Run — the bytes and the rule."""
    bundle = assemble(a_rendered_run())

    assert verify(bundle.files) == bundle.verdict == PASS


def test_a_bundle_whose_bytes_changed_does_not_verify() -> None:
    """A hash index that agrees with anything is not an index."""
    bundle = assemble(a_rendered_run())
    tampered = {**bundle.files, COMMANDS: bundle.files[COMMANDS] + b'{"ordinal":99}\n'}

    with pytest.raises(BundleInvalid, match="PROOF_HASH_MISMATCH"):
        verify(tampered)


def test_a_bundle_missing_a_file_its_index_names_does_not_verify() -> None:
    bundle = assemble(a_rendered_run())
    without = {name: data for name, data in bundle.files.items() if name != ENVIRONMENT}

    with pytest.raises(BundleInvalid, match="PROOF_HASH_INDEX_INCOMPLETE"):
        verify(without)


def test_a_verdict_the_assertions_do_not_support_does_not_verify() -> None:
    """Re-derived rather than trusted, by the same rule that wrote it."""
    bundle = assemble(a_paused_run())
    claimed = document(bundle.files, ASSERTIONS)
    claimed["machineVerdict"] = PASS
    files = _reindexed({**bundle.files, ASSERTIONS: _bytes(claimed)})

    with pytest.raises(BundleInvalid, match="PROOF_MACHINE_VERDICT_MISMATCH"):
        verify(files)


def test_an_assertion_pointing_at_evidence_that_is_gone_does_not_verify() -> None:
    bundle = assemble(a_rendered_run())
    claimed = document(bundle.files, ASSERTIONS)
    claimed["assertions"][0]["evidence"] = ["artifacts/nothing-of-the-kind"]
    files = _reindexed({**bundle.files, ASSERTIONS: _bytes(claimed)})

    with pytest.raises(BundleInvalid, match="PROOF_ASSERTION_EVIDENCE_MISSING"):
        verify(files)


def test_a_bundle_asserting_nothing_does_not_verify() -> None:
    """A sheet that asserts nothing has proved nothing, which is the sheet's own words."""
    bundle = assemble(a_rendered_run())
    files = _reindexed(
        {**bundle.files, ASSERTIONS: _bytes({"machineVerdict": PASS, "assertions": []})}
    )

    with pytest.raises(BundleInvalid, match="PROOF_ASSERTIONS_ABSENT"):
        verify(files)


# --- Written inside the root it was given, and nowhere else ----------------------------------


def test_the_bundle_is_written_under_the_root_it_was_handed(tmp_path: Path) -> None:
    """The crew never computes where evidence goes. It writes what it was told to write."""
    bundle = assemble(a_rendered_run())
    root = tmp_path / "evidence" / RUN_ID

    write_bundle(root, bundle)

    written = {
        path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()
    }
    assert written == set(bundle.files)
    assert {path.name for path in tmp_path.iterdir()} == {"evidence"}


def test_a_written_bundle_verifies_when_it_is_read_back(tmp_path: Path) -> None:
    """Round trip: the bytes that were assembled are the bytes an auditor reads."""
    bundle = assemble(a_paused_run())
    write_bundle(tmp_path, bundle)

    read = read_bundle(tmp_path)

    assert read == dict(bundle.files)
    assert verify(read) == FAIL


def test_a_root_that_already_holds_a_bundle_is_refused(tmp_path: Path) -> None:
    """Evidence is not merged. A directory written twice is two Runs under one hash index."""
    write_bundle(tmp_path, assemble(a_rendered_run()))

    with pytest.raises(BundleInvalid, match="already holds a bundle"):
        write_bundle(tmp_path, assemble(a_paused_run()))


def test_a_name_that_would_leave_the_root_is_refused(tmp_path: Path) -> None:
    """Nothing is written outside the root, and the check is structural rather than reviewed."""
    with pytest.raises(BundleInvalid, match="outside"):
        write_bundle(tmp_path, _a_bundle_named("../escaped.json"))
    assert not list(tmp_path.iterdir())


def test_a_root_that_is_itself_a_link_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`resolve()` follows a linked root, which would land the bundle wherever it points.

    The containment check below is relative to the resolved base, so it cannot see this: every
    name would sit correctly inside a root that is somewhere else entirely. That is the one way
    left for the crew to write outside its work root, and it is the rule the whole module is
    written to keep.
    """
    root = tmp_path / "linked-root"
    monkeypatch.setattr(Path, "is_symlink", lambda self: self.name == "linked-root")

    with pytest.raises(BundleInvalid, match="link"):
        write_bundle(root, assemble(a_rendered_run()))


def test_a_bundle_file_that_is_a_link_is_refused_rather_than_followed(tmp_path: Path) -> None:
    """The proofs' `walk` throws on any link it meets, and reading one back has to agree.

    A link hashes as whatever it points at, so a bundle whose `commands.jsonl` is a link to a
    file outside the root verifies perfectly while evidencing a Run nobody audited. That is the
    hash index certifying bytes the bundle does not contain.
    """
    write_bundle(tmp_path, assemble(a_rendered_run()))
    elsewhere = tmp_path.parent / "elsewhere.json"
    elsewhere.write_bytes(b"{}\n")
    link = tmp_path / "linked.json"
    try:
        link.symlink_to(elsewhere)
    except (OSError, NotImplementedError):
        pytest.skip("this platform does not let the test process create a symlink")

    with pytest.raises(BundleInvalid, match="link"):
        read_bundle(tmp_path)


def test_the_link_refusal_does_not_depend_on_a_platform_that_grants_symlinks(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The same guard, provable where the test process may not create a link.

    Windows withholds the privilege unless the session was elevated, which would leave the
    check above skipped on the machine the crew is developed on and proved only in CI.
    """
    write_bundle(tmp_path, assemble(a_rendered_run()))
    monkeypatch.setattr(Path, "is_symlink", lambda self: self.name == COMMANDS)

    with pytest.raises(BundleInvalid, match="link"):
        read_bundle(tmp_path)


# --- Nothing the crew writes is repository knowledge -----------------------------------------


def test_the_bundle_the_crew_authors_passes_the_leak_scan_that_will_read_it() -> None:
    """It lands in the work root, where the proofs' scan reads every file it finds.

    A bundle carrying a marker would fail `leaks.agent-readable-files` at the end of a paid
    Run, so it is scanned here — with the full scan, because a transcript carries instructions
    and instructions are the crew's own repository-side material.
    """
    files = assemble(a_repaired_run()).files

    for name in (SUMMARY, ENVIRONMENT, COMMANDS, TRANSCRIPT, ASSERTIONS, HASH_INDEX):
        assert scan_for_leaks(files[name].decode("utf-8")).ok, name


def test_a_bundle_that_would_leak_is_refused_rather_than_written() -> None:
    """The same stance the planner takes with a prompt: refuse, do not sanitise and carry on."""
    run = a_rendered_run()
    leaked = {**dict(REQUEST["brief"]), "text": "Read packages/production and copy it."}

    with pytest.raises(EvidenceLeaked, match="packages/production"):
        assemble(_run_with_brief(run, leaked))


# --- What the bundle says about itself --------------------------------------------------------


def test_the_environment_says_what_the_crew_did_not_measure() -> None:
    """`sandboxEvidence: null` is settled, and the bundle states it rather than omitting it."""
    environment = document(assemble(a_rendered_run()).files, ENVIRONMENT)

    assert environment["sandboxEvidence"] is None
    assert environment["claimEligible"] is False
    assert environment["runId"] == RUN_ID
    assert environment["outcome"] == RENDERED
    assert environment["limit"] is None


def test_the_environment_records_what_the_run_put_in_front_of_a_model() -> None:
    """The second criterion's recording half: consumption travels with the Run that spent it.

    In the environment block rather than as an assertion, because the harness's sheet has no
    line for it — this is a fact about what the Run was, which is what that block is for, and
    inventing a sheet assertion the sheet does not have would be worse coming from the party
    being judged.
    """
    run = a_repaired_run()

    context = document(assemble(run).files, ENVIRONMENT)["context"]

    assert context["asks"] == run.spend.asks_made
    assert context["residentChars"] == run.spend.resident_chars
    assert context["freshChars"] == run.spend.fresh_chars
    assert context["sentChars"] == run.spend.sent_chars
    assert context["distinctChars"] == run.spend.distinct_chars
    assert context["repeatedPrefixChars"] == run.spend.repeated_prefix_chars
    assert context["onePrefix"] is True
    # False rather than null: this is a structural fact about the session model, not a
    # measurement the crew lacks an instrument for, so it is asserted rather than withheld.
    assert context["prefixCache"]["reachable"] is False
    assert context["budget"] == {
        "residentChars": run.context_budget.resident_chars,
        "freshChars": run.context_budget.fresh_chars,
        "modelCalls": run.context_budget.model_calls,
    }
    # The tool's answers, apart from the message beside the prefix: they are not re-sent.
    assert context["returnedChars"] == run.spend.returned_chars
    # The figure the budget is stated in, beside the one a model is billed in.
    assert context["sentTokens"] == tokens(run.spend.sent_chars)


def test_the_context_block_says_why_a_prefix_cache_is_out_of_reach_and_stays_that_way() -> None:
    """Ticket 22's ninth criterion: the rejection is recorded beside the field, not only in code.

    An operator meets this number in the bundle and nowhere else. A reason kept in a module
    docstring is a reason that reader never sees, and the reading they are left with — "eligible,
    not yet confirmed" — is the one thing this block must not invite. The two facts that make it
    unreachable are asserted rather than the sentence carrying them, so the wording can be
    rewritten without the criterion quietly going with it.
    """
    context = document(assemble(a_repaired_run()).files, ENVIRONMENT)["context"]

    reason = context["prefixCache"]["reason"]

    # A fresh session per ask, and a cache that begins on a session's second turn. Either
    # alone would be a curiosity; together they are why the number can never be a saving.
    assert "fresh session" in reason
    assert "second turn" in reason
    # And why it is not simply a bug someone should clear by reusing one.
    assert "ADR-0017" in reason


def test_the_summary_reports_the_spend_and_how_much_of_it_is_the_repeated_prefix() -> None:
    """The page a person opens first says what the Run cost, not only how it ended."""
    run = a_repaired_run()

    summary = assemble(run).files[SUMMARY].decode("utf-8")

    assert f"{run.spend.distinct_chars:,}" in summary
    assert f"{run.spend.repeated_prefix_chars:,}" in summary
    assert f"{run.spend.asks_made}" in summary


def test_the_summary_names_the_families_this_bundle_does_not_evidence() -> None:
    """The proof bundles carry explicit non-claims. A crew bundle has more of them, not fewer."""
    summary = assemble(a_rendered_run()).files[SUMMARY].decode("utf-8")

    assert "Explicit non-claims" in summary
    assert "Isolation is not evidenced" in summary
    assert RUN_ID in summary


# --- helpers ----------------------------------------------------------------------------------


def _a_rewritten_plan() -> dict[str, Any]:
    """The same scene with a Beat reworded: the repair a Take does not survive."""
    plan = a_catalog_following_plan()
    plan["beats"][1]["text"] = "Only one town read its gauge at the top of the tide."
    return plan


def _bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def _reindexed(files: dict[str, bytes]) -> dict[str, bytes]:
    """Rebuilds the hash index, so a test about one failure is not caught by another."""
    index = {
        name: sha256(data).hexdigest()
        for name, data in sorted(files.items())
        if name != HASH_INDEX
    }
    return {**files, HASH_INDEX: _bytes(index)}


def _a_bundle_named(name: str) -> Any:
    return EvidenceBundle(files={name: b"{}\n"}, verdict=PASS)


def _run_with_brief(run: ConvergedRun, brief: dict[str, Any]) -> ConvergedRun:
    return replace(run, request={**REQUEST, "brief": brief})
