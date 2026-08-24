"""The repair loop, driven to every ending it has, with no model and no money.

What is under test is the crew's judgement, not a model's. A scripted author answers with the
plans a test hands it, so the interesting question in each case is what the crew *did* with
what production said: which plan it submitted, what it refused to submit, when it consulted
Preflight, and where it stopped.

Every envelope replayed here is a recorded one and every report body is the one whose digest
the envelope published, so the refusals the crew repairs from are refusals the service could
have written. The two ticket 08 adds — Preflight forecasting a scene below its minimum, and
the compiler refusing after a Take exists — are held to the contract by the same vitest suite
as the rest.
"""

from __future__ import annotations

import inspect
import json
from hashlib import sha256
from typing import Any

import pytest
from conftest import recorded, recorded_bytes
from test_complete_run import REQUEST, RUN_ID
from test_planner import CATEGORIES, SURFACE, a_catalog_following_plan
from vox_crew.client import Artifact, ProductionClient
from vox_crew.converge import (
    BUDGET_EXHAUSTED,
    DISPATCHED,
    MARGIN_CLEAR,
    PAUSED,
    RENDERED,
    REUSED,
    STOPPED,
    Take,
    beat_shape,
    converge,
    preflight_risks,
    repair_budget,
    take_bound,
    take_preserved,
    target_seconds,
)
from vox_crew.envelopes import ArtifactDescriptor, ResultEnvelope, parse_envelope
from vox_crew.planner import InstructionsLeaked, PlanAuthor, repair_plan, scan_for_leaks
from vox_crew.producer import READ_BACK
from vox_crew.refusals import Refusal, read_refusal

# Every artifact body a fixture envelope publishes, keyed by the digest that names it. The
# client below answers a descriptor by looking its digest up here, which is the same check the
# real client makes and the reason a body cannot drift from the envelope that published it.
BODIES = (
    "preflight-report.json",
    "preflight-report-duration-risk.json",
    "compile-report.json",
    "compile-report-needs-repair.json",
    "compile-report-placeholder.json",
    "validation-report.json",
    "preview.mp4",
)
BY_DIGEST = {sha256(recorded_bytes(name)).hexdigest(): name for name in BODIES}

# The six commands of a Run that needs no repairing at all.
COMPLETE = {
    "init": ["run-init-succeeded.stdout"],
    "validate": ["run-validate-succeeded.stdout"],
    "preflight": ["run-preflight-succeeded.stdout"],
    "record": ["run-record-succeeded.stdout"],
    "compile": ["run-compile-succeeded.stdout"],
    "render": ["run-render-succeeded.stdout"],
}


class ScriptedClient(ProductionClient):
    """A client that answers each verb from a queue, so a Run can refuse once and then not.

    The stub launcher replays one response per command, which is what proved the client and is
    exactly what a repair loop cannot be driven with. This holds no path and spawns nothing:
    the thing under test is above the client, and the client itself is proved elsewhere.

    A queue that runs out keeps answering with its last entry, so a test only writes down the
    commands whose answers change.
    """

    def __init__(self, **script: list[str]) -> None:
        self.calls: list[str] = []
        self.submitted: list[Any] = []
        self.authorisations: list[Any] = []
        self._script = {verb: list(names) for verb, names in script.items()}

    def _replay(self, verb: str) -> ResultEnvelope:
        self.calls.append(verb)
        queued = self._script[verb]
        return parse_envelope(recorded(queued.pop(0) if len(queued) > 1 else queued[0]))

    def contract_index(self) -> ResultEnvelope:
        self.calls.append("contract_index")
        return parse_envelope(recorded("contract-index.stdout"))

    def contract_show(self, category: str) -> ResultEnvelope:
        self.calls.append("contract_show")
        return parse_envelope(recorded(f"contract-show-{category}.stdout"))

    def init(self, request: Any) -> ResultEnvelope:
        return self._replay("init")

    def status(self, run_id: str) -> ResultEnvelope:
        return self._replay("status")

    def validate(self, run_id: str, plan: Any) -> ResultEnvelope:
        self.submitted.append(plan)
        return self._replay("validate")

    def preflight(self, run_id: str) -> ResultEnvelope:
        return self._replay("preflight")

    def record(self, run_id: str, replacement_authorisation: Any = None) -> ResultEnvelope:
        self.authorisations.append(replacement_authorisation)
        return self._replay("record")

    def compile(self, run_id: str) -> ResultEnvelope:
        return self._replay("compile")

    def render(self, run_id: str) -> ResultEnvelope:
        return self._replay("render")

    def decline(self, run_id: str, decision: Any) -> ResultEnvelope:
        return self._replay("decline")

    def fetch_artifact(self, run_id: str, artifact: ArtifactDescriptor) -> Artifact:
        self.calls.append("fetch_artifact")
        data = recorded_bytes(BY_DIGEST[artifact.sha256])
        return Artifact(kind=artifact.kind, sha256=artifact.sha256, data=data)


def a_client(**script: list[str]) -> ScriptedClient:
    return ScriptedClient(**{**COMPLETE, **script})


class RepairingAuthor(PlanAuthor):
    """Answers with the plans it was handed, in order, and keeps everything it was asked.

    The second implementation of the seam, extended for the second method. It holds no model,
    so what a test asserts about a repair is what the crew put in front of one rather than what
    a model made of it.
    """

    def __init__(self, *plans: dict[str, Any]) -> None:
        self._plans = list(plans)
        self.asked: list[tuple[str, Any]] = []
        self.repairs: list[tuple[str, Any, Any, Refusal]] = []

    def _next(self) -> dict[str, Any]:
        return self._plans.pop(0) if len(self._plans) > 1 else self._plans[0]

    def author(self, instructions: str, brief: Any) -> dict[str, Any]:
        self.asked.append((instructions, brief))
        return self._next()

    def repair(self, instructions: str, brief: Any, plan: Any, refusal: Refusal) -> dict[str, Any]:
        self.repairs.append((instructions, brief, plan, refusal))
        return self._next()


def a_repaired_plan() -> dict[str, Any]:
    """The same Beats, with the scene rebuilt. A repair a Take survives."""
    plan = a_catalog_following_plan()
    scene = plan["sections"][0]["scenes"][0]
    scene["events"] = [
        {"at": "b1.start", "action": "showBaseline"},
        {"at": "b2.end", "action": "revealAll"},
    ]
    return plan


def a_rewritten_plan() -> dict[str, Any]:
    """The same scene, with a Beat reworded. A repair that costs the Take."""
    plan = a_catalog_following_plan()
    plan["beats"][1]["text"] = "Only one town read its gauge at the top of the tide."
    return plan


# --- A refusal is repaired from its own fields ------------------------------------------


def test_a_refused_plan_is_repaired_from_the_refusals_own_fields_and_resubmitted() -> None:
    """The first criterion, end to end: refused, repaired, resubmitted, rendered."""
    client = a_client(
        validate=["run-validate-needs-repair.stdout", "run-validate-succeeded.stdout"]
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    run = converge(client, REQUEST, author)

    assert run.outcome == RENDERED
    assert run.rendered
    assert run.run_id == RUN_ID
    assert len(author.repairs) == 1
    assert client.submitted == [a_catalog_following_plan(), a_repaired_plan()]
    assert client.calls.count("validate") == 2


def test_the_repair_is_authored_against_what_production_published_and_not_a_summary() -> None:
    """The refusal reaches the author whole: the envelope, the report, and the codes' meanings.

    None of it is written here. The report is fetched by the descriptor the envelope published,
    and the `means` and `repair` are looked up in the checks contract by the codes that report
    named — which is the difference between teaching from a refusal and teaching about one.
    """
    client = a_client(
        validate=["run-validate-needs-repair.stdout", "run-validate-succeeded.stdout"]
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    converge(client, REQUEST, author)

    text, brief, refused, refusal = author.repairs[0]
    published = SURFACE.contract("checks")["errors"]
    said = refusal.as_text()
    assert brief == REQUEST["brief"]
    assert refused == a_catalog_following_plan()
    assert refusal.outcome == "needs_repair"
    assert refusal.report == json.loads(recorded_bytes("validation-report.json"))
    assert refusal.codes == ("UNKNOWN_ACTION", "INVALID_PROPS", "SOFT_LIMIT_EXCEEDED")
    for code in ("UNKNOWN_ACTION", "INVALID_PROPS"):
        assert refusal.checks[code] == published[code]
        assert published[code]["repair"] in said
        assert published[code]["means"] in said
    # Narrowed to the codes this report named. The instructions already carry every category;
    # what a repair adds is which of them applies here.
    assert "UNKNOWN_CAPABILITY" not in refusal.checks
    assert recorded("run-validate-needs-repair.stdout").strip() in said
    assert said in text


def test_the_refusal_carries_what_the_contract_says_about_repair_itself() -> None:
    """The rule a Take survives is published, so the crew hands it over rather than paraphrasing."""
    client = a_client(
        validate=["run-validate-needs-repair.stdout", "run-validate-succeeded.stdout"]
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    converge(client, REQUEST, author)

    text, _, _, refusal = author.repairs[0]
    published = SURFACE.contract("protocol")["repair"]
    assert refusal.guidance["repair"] == published
    assert published["takeRemainsReusableWhen"] in refusal.as_text()
    assert published["preferredDurationRepair"] in refusal.as_text()
    assert refusal.as_text() in text


def test_a_repair_prompt_is_held_to_the_same_leak_scan_as_an_authoring_one() -> None:
    """New text reaching a model is new text, whoever wrote it."""
    client = a_client(
        validate=["run-validate-needs-repair.stdout", "run-validate-succeeded.stdout"]
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    run = converge(client, REQUEST, author)

    text, _, _, _ = author.repairs[0]
    assert scan_for_leaks(text).ok
    assert text.startswith(run.versions[0].instructions)


def test_repair_instructions_that_leak_never_reach_an_author(monkeypatch) -> None:
    """The scan is a gate on the repair path too, not a report.

    Driven through `repair_plan` rather than through a whole Run, because the authoring gate
    would catch a leaking preamble first and this is an assertion about the second gate.
    """
    monkeypatch.setattr(
        "vox_crew.planner._preamble",
        lambda: "Author from C:/Users/x/vox-studio/packages/production.",
    )
    client = a_client()
    refusal = read_refusal(
        client, RUN_ID, parse_envelope(recorded("run-validate-needs-repair.stdout")), SURFACE
    )
    author = RepairingAuthor(a_catalog_following_plan())

    with pytest.raises(InstructionsLeaked):
        repair_plan(SURFACE, REQUEST["brief"], a_catalog_following_plan(), refusal, author)

    assert author.repairs == []


# --- Preflight is consulted -------------------------------------------------------------


def test_preflight_is_consulted_before_any_recording_is_attempted() -> None:
    """The criterion means reading the report, not observing that the envelope succeeded.

    Preflight publishes `risksBlockRecord: false` and this Run's Preflight succeeds — so a
    producer that checked only the outcome would have recorded a Take against a plan whose
    opening scene is shorter than its capability can animate, and discovered it at compile.
    """
    client = a_client(
        preflight=["run-preflight-duration-risk.stdout", "run-preflight-succeeded.stdout"]
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    run = converge(client, REQUEST, author)

    assert run.rendered
    assert client.calls.index("record") > client.calls.index("preflight")
    assert [call for call in client.calls if call in ("validate", "preflight", "record")] == [
        "validate",
        "preflight",
        "validate",
        "preflight",
        "record",
    ]
    assert len(author.repairs) == 1


def test_a_duration_risk_is_repaired_from_preflights_own_report() -> None:
    """What Preflight published is what the author is given, advisory authority included."""
    client = a_client(
        preflight=["run-preflight-duration-risk.stdout", "run-preflight-succeeded.stdout"]
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    converge(client, REQUEST, author)

    text, _, _, refusal = author.repairs[0]
    said = refusal.as_text()
    assert refusal.advisory
    assert refusal.outcome == "succeeded"
    assert refusal.report == json.loads(recorded_bytes("preflight-report-duration-risk.json"))
    assert refusal.guidance["preflight"] == SURFACE.contract("protocol")["preflight"]
    assert "advisory" in said and "did not stop the Run" in said
    assert recorded("run-preflight-duration-risk.stdout").strip() in said
    assert said in text and scan_for_leaks(text).ok


def test_a_preflight_that_clears_every_minimum_buys_no_repair() -> None:
    """A Run with nothing to fix pays nothing for the consultation."""
    client = a_client()
    author = RepairingAuthor(a_catalog_following_plan())

    run = converge(client, REQUEST, author)

    assert run.rendered
    assert author.repairs == []
    assert client.calls.count("preflight") == 1


def test_only_the_minimum_threshold_is_worth_a_repair_cycle() -> None:
    """The recorded report crosses its *recommended* hold and clears every minimum.

    Missing a recommendation publishes `SCENE_BELOW_RECOMMENDED_DURATION`, a quality warning a
    plan may ship with. Spending a repair cycle on one would spend the budget on the thing the
    budget exists to protect.
    """
    clear = json.loads(recorded_bytes("preflight-report.json"))
    risky = json.loads(recorded_bytes("preflight-report-duration-risk.json"))

    assert clear["duration"]["summary"]["recommended"]["margin_crosses"] == 1
    assert preflight_risks(clear) == ()
    assert preflight_risks(risky) == ("scene-headline",)


def test_the_assessment_the_crew_reads_for_is_one_the_contract_publishes() -> None:
    """The guard on the duration reader: a renamed assessment shows up here, not in a paid Run."""
    assert MARGIN_CLEAR in SURFACE.contract("protocol")["preflight"]["assessments"]


def test_a_run_with_no_calibration_has_nothing_to_consult_about_duration() -> None:
    """Preflight cannot estimate before a Take exists anywhere, and says so rather than guessing."""
    unavailable = {
        "reportVersion": 1,
        "authority": "advisory",
        "planChecks": {"findingCount": 0, "findings": []},
        "duration": {
            "status": "unavailable",
            "reasonCode": "CALIBRATION_MISSING",
            "calibration": None,
            "summary": None,
            "scenes": None,
        },
        "limitations": ["Preflight is advisory."],
    }

    assert preflight_risks(unavailable) == ()


# --- Take-preserving repair --------------------------------------------------------------


def test_after_a_take_exists_a_repair_that_rewrites_beat_text_is_not_submitted() -> None:
    """Asserted behaviour, not a hope expressed in a prompt.

    The plan's ordered Beat text *is* the recording input, so submitting a reworded Beat would
    stale the Take and turn the next `run.record` into a second synthesis dispatch against a
    `maxNewTakes` of one. The interface would refuse that correctly and the Take would still
    be gone, which is why the withheld plan never reaches `validate` at all.
    """
    client = a_client(
        compile=["run-compile-needs-repair.stdout", "run-compile-succeeded.stdout"],
        record=["run-record-succeeded.stdout", "run-record-reused.stdout"],
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_rewritten_plan(), a_repaired_plan())

    run = converge(client, REQUEST, author)

    assert run.rendered
    assert len(author.repairs) == 2
    assert [version.plan for version in run.withheld] == [a_rewritten_plan()]
    assert client.submitted == [a_catalog_following_plan(), a_repaired_plan()]
    assert beat_shape(client.submitted[0]) == beat_shape(client.submitted[1])


def test_a_take_preserving_repair_costs_no_second_dispatch() -> None:
    """The whole point of preserving it: the second recording reuses the Take it already has."""
    client = a_client(
        compile=["run-compile-needs-repair.stdout", "run-compile-succeeded.stdout"],
        record=["run-record-succeeded.stdout", "run-record-reused.stdout"],
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    run = converge(client, REQUEST, author)

    dispositions = [
        (envelope.data or {}).get("disposition")
        for envelope in run.envelopes
        if envelope.command == "run.record"
    ]
    assert dispositions == ["recorded", "reused"]
    assert run.rendered


def test_the_beats_a_take_is_bound_to_are_the_ones_the_contract_names() -> None:
    """`takeRemainsReusableWhen` is ordered Beat texts and segmentation, and nothing else."""
    plan = a_catalog_following_plan()

    assert beat_shape(plan) == (("b1", plan["beats"][0]["text"]), ("b2", plan["beats"][1]["text"]))
    assert take_preserved(plan, a_repaired_plan())
    assert not take_preserved(plan, a_rewritten_plan())


def test_a_repair_before_a_take_exists_may_rewrite_whatever_it_likes() -> None:
    """Nothing is preserved before there is anything to preserve."""
    client = a_client(
        validate=["run-validate-needs-repair.stdout", "run-validate-succeeded.stdout"]
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_rewritten_plan())

    run = converge(client, REQUEST, author)

    assert run.rendered
    assert run.withheld == ()
    assert client.submitted == [a_catalog_following_plan(), a_rewritten_plan()]


# --- The budget ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("asks_for", "seconds", "cycles"),
    [
        ("Create a 20–30-second English editorial explainer about a fictional city.", 25, 3),
        ("Create a 110–130-second English editorial explainer about a fictional city.", 120, 4),
        ("Create a 170–190-second English editorial explainer about a fictional city.", 180, 5),
    ],
)
def test_the_budget_is_the_one_the_briefs_own_length_buys(
    asks_for: str, seconds: int, cycles: int
) -> None:
    """The three Briefs that exist, at the numbers the proof scenarios record for them.

    The openings are quoted rather than imported because the crew is a Python process that
    cannot read the sheet it is judged by. Pinning them here is what keeps the two from
    drifting apart silently.
    """
    assert target_seconds({"id": "b", "text": asks_for}) == seconds
    budget = repair_budget(seconds)
    assert budget.cycles == cycles
    assert budget.plan_versions == cycles + 2
    assert budget.preflight_calls == cycles
    assert budget.post_record_plan_versions == 2


def test_a_brief_states_its_length_before_it_states_its_facts() -> None:
    """Later numbers in a Brief are its content. Only the length it opens with is its length."""
    brief = {
        "id": "b",
        "text": (
            "Create a 170–190-second explainer. The average wait fell from 22 minutes to 11 "
            "minutes, and 18,000 people rode in March."
        ),
    }

    assert target_seconds(brief) == 180


def test_a_brief_that_names_no_length_is_budgeted_as_the_shortest_one() -> None:
    """An unbounded budget is the failure mode the whole idea is against."""
    assert target_seconds(REQUEST["brief"]) == 25
    assert repair_budget(target_seconds(REQUEST["brief"])).cycles == 3


def test_a_brief_that_asks_in_minutes_is_read_in_minutes() -> None:
    assert target_seconds({"id": "b", "text": "Create a 3-minute explainer."}) == 180


def test_convergence_stays_inside_the_budget_and_reports_an_exhausted_one() -> None:
    """The last two criteria: a bounded loop, and an ending that names the limit it hit."""
    client = a_client(validate=["run-validate-needs-repair.stdout"])
    author = RepairingAuthor(a_catalog_following_plan())

    run = converge(client, REQUEST, author)

    assert run.outcome == BUDGET_EXHAUSTED
    assert run.limit == "plan_versions"
    assert not run.rendered
    assert run.budget.plan_versions == 5
    assert len(run.versions) == 5
    assert client.calls.count("validate") == 5
    assert "record" not in client.calls


def test_a_budget_the_caller_sets_is_the_budget_that_binds() -> None:
    """A Brief's length is the default, not the only way in: the harness passes its own."""
    client = a_client(validate=["run-validate-needs-repair.stdout"])
    author = RepairingAuthor(a_catalog_following_plan())

    run = converge(client, REQUEST, author, budget=repair_budget(180))

    assert run.outcome == BUDGET_EXHAUSTED
    assert run.budget.plan_versions == 7
    assert client.calls.count("validate") == 7


def test_an_author_that_keeps_costing_the_take_exhausts_the_post_record_budget() -> None:
    """Two plan versions after a Take, and withheld ones count: the model wrote them."""
    client = a_client(compile=["run-compile-needs-repair.stdout"])
    author = RepairingAuthor(a_catalog_following_plan(), a_rewritten_plan())

    run = converge(client, REQUEST, author)

    assert run.outcome == BUDGET_EXHAUSTED
    assert run.limit == "post_record_plan_versions"
    assert len(run.withheld) == 2
    assert client.submitted == [a_catalog_following_plan()]
    assert client.calls.count("record") == 1


# --- Endings the crew may not repair -------------------------------------------------------


def test_a_failure_is_not_something_the_crew_repairs() -> None:
    """`failed` is not a refusal with a report in it. There is nothing to author against."""
    client = a_client(validate=["run-validate-failed.stdout"])
    author = RepairingAuthor(a_catalog_following_plan())

    run = converge(client, REQUEST, author)

    assert run.outcome == STOPPED
    assert run.limit is None
    assert author.repairs == []
    assert run.refusal is not None
    assert run.refusal.envelope.error is not None
    assert run.refusal.envelope.error.code == "INVALID_INPUT"
    assert run.refusal.report is None


def test_nothing_raises_on_an_ending_the_crew_did_not_want() -> None:
    """An operator reads what production said. An exception where six envelopes were is worse."""
    client = a_client(validate=["run-validate-failed.stdout"])

    run = converge(client, REQUEST, RepairingAuthor(a_catalog_following_plan()))

    assert [envelope.command for envelope in run.envelopes][-2:] == ["run.init", "run.validate"]
    assert run.envelopes[-1].raw == recorded("run-validate-failed.stdout")


# --- The quota rules -----------------------------------------------------------------------


def test_a_compliant_plan_spends_exactly_one_synthesis_dispatch() -> None:
    """The ticket's first criterion, counted the way the harness counts it.

    Nothing here is a counter the crew kept. `run.record` publishes its disposition beside
    `newTakesUsed` and `maxNewTakes`, so how many dispatches a Run spent is read off the
    envelopes it received — which is the answer the assertion sheet reaches from
    `network-audit.json`, arrived at from the crew's side of the boundary.
    """
    client = a_client()
    author = RepairingAuthor(a_catalog_following_plan())

    run = converge(client, REQUEST, author)

    assert run.rendered
    assert run.dispatches == 1
    assert client.calls.count("record") == 1
    assert [take.disposition for take in run.takes] == ["recorded"]


def test_the_new_take_budget_is_the_one_production_published() -> None:
    """`maxNewTakes` travels out in the request and back on the envelope. The crew reads it.

    Tracking it in parallel would give the crew a second number to be wrong with, for the
    same reason the repair budget reads the Brief rather than being told what it is.
    """
    run = converge(a_client(), REQUEST, RepairingAuthor(a_catalog_following_plan()))

    assert run.quota is not None
    assert run.quota.max_new_takes == REQUEST["production"]["maxNewTakes"]
    assert run.quota.new_takes_used == 1
    assert run.quota.within_quota


def test_an_identical_recording_input_is_rebound_rather_than_redispatched() -> None:
    """Two `record` calls, one dispatch: the second bound the Take the first paid for."""
    client = a_client(
        compile=["run-compile-needs-repair.stdout", "run-compile-succeeded.stdout"],
        record=["run-record-succeeded.stdout", "run-record-reused.stdout"],
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    run = converge(client, REQUEST, author)

    assert run.rendered
    assert client.calls.count("record") == 2
    assert run.dispatches == 1
    assert [take.disposition for take in run.takes] == ["recorded", "reused"]
    assert run.quota is not None and run.quota.new_takes_used == 1


def test_the_crew_never_hands_production_an_authorisation_of_its_own() -> None:
    """The crew's whole side of the redispatch rule: it holds no grant, so it passes none.

    A replacement grant is an operator's signature over a recording input. The client takes
    one because an operator's decision has to reach production somehow, and the loop is not
    where that decision is made.
    """
    client = a_client(
        compile=["run-compile-needs-repair.stdout", "run-compile-succeeded.stdout"],
        record=["run-record-succeeded.stdout", "run-record-reused.stdout"],
    )

    run = converge(
        client, REQUEST, RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())
    )

    assert run.rendered
    assert client.authorisations == [None, None]


def test_a_second_dispatch_where_a_take_already_existed_ends_the_run() -> None:
    """The backstop under take-preserving repair, at the one place two rules have to agree.

    Nothing should reach it: a repair that would stale the Take is withheld above, and the
    interface enforces `maxNewTakes` on its own side. A `recorded` disposition arriving where
    a `reused` one was expected means those two rules have parted company and a dispatch was
    spent that nothing intended — so the Run ends there rather than carrying on inside a
    quota it can no longer account for.
    """
    client = a_client(
        compile=["run-compile-needs-repair.stdout", "run-compile-succeeded.stdout"],
        record=["run-record-succeeded.stdout"],
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    run = converge(client, REQUEST, author)

    assert run.outcome == BUDGET_EXHAUSTED
    assert run.limit == "new_takes"
    assert not run.rendered
    assert client.calls.count("record") == 2
    assert "render" not in client.calls


def test_a_spend_past_the_cap_production_named_is_over_the_quota() -> None:
    """The other arm of the same reading, as arithmetic rather than as an invented envelope."""
    assert Take("recorded", "take-1", new_takes_used=1, max_new_takes=1).within_quota
    assert not Take("recorded", "take-1", new_takes_used=2, max_new_takes=1).within_quota


def test_a_take_is_read_off_the_envelope_that_published_it() -> None:
    """And off nothing else: a command that binds no Take publishes no quota to read."""
    bound = take_bound(parse_envelope(recorded("run-record-succeeded.stdout")))
    reused = take_bound(parse_envelope(recorded("run-record-reused.stdout")))

    assert bound == Take("recorded", "take-crew-fixture-1", 1, 1)
    assert bound.dispatched
    assert reused is not None and not reused.dispatched
    assert take_bound(parse_envelope(recorded("run-compile-succeeded.stdout"))) is None
    assert take_bound(parse_envelope(recorded("run-record-paused-budget.stdout"))) is None


def test_the_dispositions_that_cost_a_dispatch_are_the_ones_the_contract_names() -> None:
    """Three dispositions, published as an enum, and exactly one of them binds without paying."""
    published = SURFACE.contract("protocol")["schemas"]["commandData"]["run.record"]
    names = published["properties"]["disposition"]["enum"]

    assert set(DISPATCHED) | {REUSED} == set(names)
    assert REUSED not in DISPATCHED
    assert set(published["required"]) >= {"disposition", "newTakesUsed", "maxNewTakes"}


def test_the_quota_rules_the_crew_obeys_are_the_ones_the_protocol_publishes() -> None:
    """The whole of ticket 09 is written down in `protocol.recording`. This is that reading.

    Pinning the published phrases is what makes the crew's behaviour reviewable against the
    interface rather than against this file: a rule reworded on the other side fails here
    instead of quietly meaning something else in the loop.
    """
    rules = SURFACE.contract("protocol")["recording"]

    assert rules["onlyNetworkCommand"] == "run.record"
    assert rules["verifiedMatchingTake"] == "reuse without quota"
    assert rules["identicalInputRedispatch"] == "replacement grant required"
    assert rules["exhaustedBudget"] == "paused before network"
    assert rules["uncertainDispatch"] == "never retried automatically"


# --- A pause is the operator's, not the crew's ----------------------------------------------


def test_a_paused_outcome_stops_the_crew_rather_than_proceeding() -> None:
    """The Run ends where production paused it, under production's own word for the ending."""
    client = a_client(record=["run-record-paused-budget.stdout"])
    author = RepairingAuthor(a_catalog_following_plan())

    run = converge(client, REQUEST, author)

    assert run.outcome == PAUSED
    assert run.paused
    assert not run.rendered
    assert run.dispatches == 0
    assert "compile" not in client.calls
    assert "render" not in client.calls
    assert author.repairs == []


def test_a_pause_surfaces_the_operator_decision_in_the_words_production_used() -> None:
    """The reason is the only thing separating the two pauses, and it travels verbatim.

    `refusals.py` gathers and does not explain, and a pause is held to the same rule: the
    envelope's `next` already names the command an operator would run and why, so surfacing
    the decision means handing those over rather than composing a sentence about them.
    """
    exhausted = converge(
        a_client(record=["run-record-paused-budget.stdout"]),
        REQUEST,
        RepairingAuthor(a_catalog_following_plan()),
    )
    replacement = converge(
        a_client(record=["run-record-paused-replacement.stdout"]),
        REQUEST,
        RepairingAuthor(a_catalog_following_plan()),
    )

    for run in (exhausted, replacement):
        assert len(run.decision) == 1
        assert run.decision[0].command == "run.record"
        assert "--replacement-authorisation" in run.decision[0].args
        assert run.decision[0].reason in run.envelopes[-1].raw

    assert exhausted.decision[0].reason == "The Run has no remaining recording budget."
    assert replacement.decision[0].reason == (
        "A later dispatch for this Recording input requires a replacement grant."
    )


def test_a_paused_run_is_not_a_failed_one() -> None:
    """Both stop. Only one is a decision waiting on a human, and they say so apart."""
    paused = converge(
        a_client(record=["run-record-paused-replacement.stdout"]),
        REQUEST,
        RepairingAuthor(a_catalog_following_plan()),
    )
    failed = converge(
        a_client(validate=["run-validate-failed.stdout"]),
        REQUEST,
        RepairingAuthor(a_catalog_following_plan()),
    )

    assert paused.outcome == PAUSED
    assert failed.outcome == STOPPED
    assert paused.decision != ()
    assert failed.decision == ()
    assert not failed.paused


def test_the_crew_never_answers_a_pause_by_authorising_itself() -> None:
    """A pause asks for a grant. The crew has none, and does not try the call a second time."""
    client = a_client(record=["run-record-paused-replacement.stdout"])

    run = converge(client, REQUEST, RepairingAuthor(a_catalog_following_plan()))

    assert run.paused
    assert client.calls.count("record") == 1
    assert client.authorisations == [None]


def test_a_paused_run_still_carries_everything_production_said() -> None:
    """An operator decides from the envelopes, so a pause returns them rather than raising."""
    client = a_client(record=["run-record-paused-budget.stdout"])

    run = converge(client, REQUEST, RepairingAuthor(a_catalog_following_plan()))

    assert [envelope.command for envelope in run.envelopes] == [
        "run.init",
        "run.validate",
        "run.preflight",
        "run.record",
    ]
    assert run.envelopes[-1].raw == recorded("run-record-paused-budget.stdout")
    assert run.refusal is not None
    assert run.refusal.envelope.outcome == "paused"
    assert run.refusal.report is None
    assert run.artifacts == ()


# --- Placeholder degradation is accepted, not fought ----------------------------------------


def test_placeholder_degradation_is_reported_on_the_finished_run() -> None:
    """A preview with placeholders is an honest intermediate state, and a green compile.

    `ASSET_PLACEHOLDER` sits in the checks contract's `warnings` block, so it never arrives
    as a refusal. What is under test is that it reaches an operator anyway.
    """
    client = a_client(compile=["run-compile-placeholder.stdout"])
    author = RepairingAuthor(a_catalog_following_plan())

    run = converge(client, REQUEST, author)

    assert run.rendered
    assert run.degradations == ("ASSET_PLACEHOLDER",)


def test_a_placeholder_warning_buys_no_repair_cycle() -> None:
    """Fighting it would spend the budget on the thing the budget exists to protect."""
    client = a_client(compile=["run-compile-placeholder.stdout"])
    author = RepairingAuthor(a_catalog_following_plan())

    run = converge(client, REQUEST, author)

    assert author.repairs == []
    assert len(run.versions) == 1
    assert client.calls.count("validate") == 1
    assert client.calls.count("compile") == 1
    assert run.withheld == ()


def test_a_degradation_is_named_in_the_code_the_contract_publishes_it_under() -> None:
    """The crew reports the compiler's word for it, so rewording one does not need the crew."""
    published = SURFACE.contract("checks")
    client = a_client(compile=["run-compile-placeholder.stdout"])

    run = converge(client, REQUEST, RepairingAuthor(a_catalog_following_plan()))

    assert run.degradations
    for code in run.degradations:
        assert code in published["warnings"]
    assert published["warnings"]["ASSET_PLACEHOLDER"]["regime"] == "warning"


def test_a_run_that_compiled_clean_of_placeholders_reports_what_it_did_carry() -> None:
    """`degradations` is every warning the finished compile published, not a placeholder filter.

    A crew reporting only the code it was asked about would hide the next one, and the
    compiler's `warnings` block is the whole list of things a Run may ship with.
    """
    run = converge(a_client(), REQUEST, RepairingAuthor(a_catalog_following_plan()))

    assert run.degradations == ("SLOT_RELOCATED",)


def test_a_run_that_never_compiled_has_no_degradations_to_report() -> None:
    """Nothing is inferred where nothing was published."""
    run = converge(
        a_client(record=["run-record-paused-budget.stdout"]),
        REQUEST,
        RepairingAuthor(a_catalog_following_plan()),
    )

    assert run.degradations == ()


# --- Compile, render, and reading the result back -------------------------------------------


def test_a_compliant_plan_ends_at_a_narrated_preview() -> None:
    """Record, compile, render, in that order, and the Run stands at `rendered` afterwards."""
    client = a_client()

    run = converge(client, REQUEST, RepairingAuthor(a_catalog_following_plan()))

    assert [envelope.command for envelope in run.envelopes] == [
        "run.init",
        "run.validate",
        "run.preflight",
        "run.record",
        "run.compile",
        "run.render",
    ]
    assert run.envelopes[-1].run is not None
    assert run.envelopes[-1].run.stage == "rendered"
    preview = run.artifact("preview")
    assert preview is not None and preview.kind == "preview"
    assert preview.data == recorded_bytes("preview.mp4")


def test_the_preview_and_the_reports_come_back_by_descriptor_and_never_by_path() -> None:
    """The read-back direction, on a Run that actually rendered.

    Every artifact is fetched with the descriptor an envelope published and checked against
    the digest that descriptor named — which is what the client does in the cloud, where no
    Run directory is anywhere near the crew.
    """
    client = a_client()

    run = converge(client, REQUEST, RepairingAuthor(a_catalog_following_plan()))

    published = {
        descriptor.kind: descriptor.sha256
        for envelope in run.envelopes
        for descriptor in envelope.artifacts
    }
    assert [artifact.kind for artifact in run.artifacts] == list(READ_BACK)
    for artifact in run.artifacts:
        assert artifact.sha256 == published[artifact.kind]
        assert sha256(artifact.data).hexdigest() == artifact.sha256
    assert client.calls[-len(READ_BACK) :] == ["fetch_artifact"] * len(READ_BACK)


# --- The seam ------------------------------------------------------------------------------


def test_a_repair_is_handed_the_plan_and_the_refusal_and_nothing_else() -> None:
    """The model's second seam is payload-shaped like its first, and like the client's."""
    signature = inspect.signature(PlanAuthor.repair)

    assert list(signature.parameters) == ["self", "instructions", "brief", "plan", "refusal"]
    for parameter in signature.parameters.values():
        assert not any(
            word in parameter.name.lower() for word in ("path", "root", "dir", "file", "client")
        )
        assert "Path" not in str(parameter.annotation)


def test_the_loop_never_learns_where_a_run_lives() -> None:
    for function in (
        converge,
        read_refusal,
        repair_budget,
        target_seconds,
        beat_shape,
        take_bound,
    ):
        for parameter in inspect.signature(function).parameters.values():
            assert not any(
                word in parameter.name.lower() for word in ("path", "root", "dir", "file", "cwd")
            ), f"{function.__name__} takes a path-shaped parameter {parameter.name!r}"
            assert "Path" not in str(parameter.annotation)


def test_the_loop_does_not_branch_on_which_client_it_is_holding() -> None:
    """ADR-0015's rule, asserted structurally rather than trusted to review."""
    import vox_crew.converge as loop

    for line in inspect.getsource(loop).splitlines():
        stripped = line.strip()
        if stripped.startswith(("def ", "class ", "#", '"', "*")):
            continue
        assert "isinstance" not in stripped or "Client" not in stripped


def test_a_converged_run_reads_its_preview_back_by_descriptor() -> None:
    """The read-back direction survives the loop: the same rule, the same digests."""
    client = a_client(
        validate=["run-validate-needs-repair.stdout", "run-validate-succeeded.stdout"]
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    run = converge(client, REQUEST, author)

    preview = run.artifact("preview")
    assert preview is not None and preview.data == recorded_bytes("preview.mp4")
    assert run.artifact("preflight_report") is not None
    assert run.artifact("compile_report") is not None


def test_every_envelope_of_every_attempt_reaches_the_audit_trail() -> None:
    """A repair loop that only reported its last pass would hide the run it actually had."""
    seen: list[str] = []
    client = a_client(
        validate=["run-validate-needs-repair.stdout", "run-validate-succeeded.stdout"]
    )
    author = RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())

    run = converge(client, REQUEST, author, on_envelope=lambda envelope: seen.append(envelope.raw))

    discovery = [envelope.raw for envelope in run.surface.envelopes]
    assert seen == discovery + [envelope.raw for envelope in run.envelopes]
    assert len(discovery) == len(CATEGORIES) + 1
    assert recorded("run-validate-needs-repair.stdout") in seen
    assert [envelope.command for envelope in run.envelopes] == [
        "run.init",
        "run.validate",
        "run.validate",
        "run.preflight",
        "run.record",
        "run.compile",
        "run.render",
    ]


def test_a_converged_run_never_reaches_the_network() -> None:
    """The sentinel is autouse, so this passing is the assertion. Recorded, and free."""
    client = a_client(
        validate=["run-validate-needs-repair.stdout", "run-validate-succeeded.stdout"]
    )

    run = converge(
        client, REQUEST, RepairingAuthor(a_catalog_following_plan(), a_repaired_plan())
    )

    assert run.rendered
