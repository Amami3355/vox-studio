"""The first ticket where a model is in the loop, tested without one.

Three things are under test here and none of them is a model's judgement.

**The instructions.** They are assembled from what the contract index published and nothing
else, so a category the contract adds is a category the planner teaches, and no repository
vocabulary reaches a prompt. That last part is asserted by a scan rather than reviewed.

**The review.** What comes back from an author is read against the same catalog the
instructions were built from, in the compiler's own published vocabulary — a plan that writes
a frame or names a capability the catalog does not publish is a finding before a Run is spent
on it.

**The seam.** `PlanAuthor` is an interface with a live implementation and a scripted one, and
nothing above it knows which it is holding. That is `client.py`'s discipline applied to the
model, and it is what a scripted author lets us drive a whole Run for zero tokens.
"""

from __future__ import annotations

import inspect
import json
import re
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pytest
from conftest import recorded, recorded_bytes
from test_complete_run import REQUEST, a_complete_run, client_for, refused_at_validation, verbs
from vox_crew.context import Ask
from vox_crew.envelopes import parse_envelope
from vox_crew.planner import (
    AdkPlanAuthor,
    AuthoredRun,
    DraftReview,
    Finding,
    HandedPlanAuthor,
    InstructionsLeaked,
    PlanAuthor,
    PlanNotRepairable,
    _anchor_pattern,
    anchor_forms,
    author_plan,
    authoring_ask,
    cache_prefix,
    instructions,
    plan_and_produce,
    published_errors,
    review,
    scan_for_leaks,
    scan_message_for_leaks,
)
from vox_crew.refusals import Refusal
from vox_crew.teaching_surface import TeachingSurface

CATEGORIES = ("language", "plan", "catalog", "checks", "protocol")

# The two plans the deixis rule was measured on, read from where the compiler's own suite
# reads them.
#
# **This is a deliberate exception to the boundary `pyproject.toml` states**, and it is
# narrow enough to name exactly. That header says the two halves share only the vox.exe
# boundary, and `vox_crew` still shares nothing: it imports no repository module, and
# nothing under `src/` knows these paths exist. What crosses here is two JSON documents,
# read by tests, in the one case where reading the same bytes is the property under test.
#
# The crew and the compiler each implement `DEICTIC_OPPORTUNITY_MISSED` — they must, since
# `pyproject.toml` forbids shared code and the catalog publishes the check vocabulary but
# not the rule. The only assertion worth making about two implementations of one rule is
# that they agree *on the same input*. A copy in `fixtures/` would drift, and the agreement
# test would quietly become two tests that each check an implementation against itself.
# `fixtures/` is also not the place for it: that directory is what the interface records
# into, and a hand-placed plan there would be the first thing in it the recorder does not
# own.
_REPO = Path(__file__).resolve().parents[3]
VERTICAL_SLICE = _REPO / "packages/video/src/plans/vertical-slice.plan.json"
DECLINED_GESTURES = _REPO / "packages/video/tests/fixtures/declined-gestures.plan.json"


def a_refusal() -> Refusal:
    """What production said about a plan, assembled the way `read_refusal` assembles it.

    Built here rather than driven out of a client because this module tests the author seam and
    not the read-back: what an author is handed is a payload, and `Refusal` is one. The bodies
    are the recorded ones, so `codes` names what the compiler actually named.
    """
    return Refusal(
        envelope=parse_envelope(recorded("run-validate-needs-repair.stdout")),
        report=json.loads(recorded_bytes("validation-report.json")),
        checks={},
        guidance={},
    )


def stdout_for(category: str) -> str:
    """The projection as the service wrote it.

    All five are recorded for the planner, where discovery needed only one. Discovery was
    indifferent to what a projection carried; the prompt is made of it, and the leak scan over
    that prompt only means something against the bodies the build actually publishes.
    """
    return recorded(f"contract-show-{category}.stdout")


def a_teaching_surface(categories: tuple[str, ...] = CATEGORIES) -> TeachingSurface:
    """The surface as discovery would have assembled it, without driving a client for it."""
    index = parse_envelope(recorded("contract-index.stdout"))
    return TeachingSurface(
        index=index,
        projections={name: parse_envelope(stdout_for(name)) for name in categories},
        summaries={
            str(entry["id"]): str(entry["summary"])
            for entry in (index.data or {})["categories"]
            if str(entry["id"]) in categories
        },
    )


SURFACE = a_teaching_surface()
CATALOG = SURFACE.contract("catalog")
CAPABILITIES = {str(item["id"]): item for item in CATALOG["capabilities"]}


def a_catalog_following_plan() -> dict[str, Any]:
    """A plan of the shape ticket 07 asks an agent for: semantics, and no physical time.

    Every capability, action and anchor in it is read out of the recorded catalog rather than
    remembered, which is the same discipline the plan itself is held to.
    """
    return {
        "beats": [
            {"id": "b1", "text": "Four coastal towns measured the same tide differently."},
            {"id": "b2", "text": "Only one of them was reading the gauge at high water."},
        ],
        "sections": [
            {
                "id": "the-readings",
                "spansBeats": ["b1", "b2"],
                "scenes": [
                    {
                        "id": "readings-compared",
                        "component": "bar_chart",
                        "spansBeats": ["b1", "b2"],
                        "props": {
                            "title": "Tide readings by town",
                            "data": [
                                {"label": "Helios Bay", "value": 4.1},
                                {"label": "Northbridge", "value": 3.6},
                                {"label": "Kestrel Point", "value": 3.9},
                                {"label": "Larkmouth", "value": 2.2},
                            ],
                            "unit": "m",
                        },
                        "events": [
                            {"at": "b1.start", "action": "showBaseline"},
                            {"at": "b1.end", "action": "revealAll"},
                            {
                                "at": "b2.word:gauge",
                                "action": "highlightBar",
                                "payload": {"label": "Larkmouth"},
                            },
                        ],
                    }
                ],
            }
        ],
    }


class ScriptedPlanAuthor(PlanAuthor):
    """A second implementation of the seam, holding a model no more than it holds a path.

    It answers with a plan it was handed and keeps what it was asked, so a test can drive a
    whole Run and then assert about the instructions the model would have been given.
    """

    def __init__(self, plan: dict[str, Any]) -> None:
        self._plan = plan
        self.asked: list[tuple[str, Any]] = []
        self.offered: list[Any] = []

    def author(self, instructions: str, brief: Any, *, check: Any = None) -> dict[str, Any]:
        self.asked.append((instructions, brief))
        self.offered.append(check)
        return self._plan

    def repair(
        self, instructions: str, brief: Any, plan: Any, refusal: Any, *, check: Any = None
    ) -> dict[str, Any]:
        """Nothing in this ticket repairs, and the assertions below say so by failing here.

        The seam has two methods because a repair is a function of four things; an author that
        answered a refusal with the plan that was refused would converge on nothing. The loop
        that does repair, and the second implementation that answers one, are ticket 08's.
        """
        raise AssertionError("Ticket 07 authors. It does not repair.")


# --- The instructions ------------------------------------------------------------------


def test_the_instructions_teach_every_category_the_index_published() -> None:
    text = instructions(SURFACE)

    for category in CATEGORIES:
        assert category in text
        assert SURFACE.summary(category) in text


def test_a_category_the_contract_adds_is_a_category_the_instructions_teach() -> None:
    """The categories come from the index, not from a list here — the same rule discovery has."""
    smaller = a_teaching_surface(("catalog", "plan"))

    text = instructions(smaller)

    assert "catalog" in text and "plan" in text
    assert "protocol" not in text.replace("protocolVersion", "")


def test_the_instructions_carry_the_catalog_the_plan_is_authored_against() -> None:
    """Capability and action names have to be in front of the model, or it writes from memory."""
    text = instructions(SURFACE)

    assert "bar_chart" in text and "image_context" in text
    assert "highlightBar" in text and "revealImage" in text
    assert CATALOG["time"]["rule"] in text


def test_the_instructions_pass_a_leak_scan() -> None:
    """The acceptance criterion, run over the thing that actually reaches the model.

    Every projection in this surface is the one the build publishes, which is the only version
    of this assertion worth making: most of the prompt is contract, and a scan over a stand-in
    would be a scan over text nobody sends.
    """
    scan = scan_for_leaks(instructions(SURFACE))

    assert scan.violations == ()
    assert scan.ok


@pytest.mark.parametrize("category", CATEGORIES)
def test_nothing_the_interface_publishes_is_treated_as_a_leak(category: str) -> None:
    """The rule the marker list is held to.

    A contract the interface hands an agent is not a leak however filesystem-shaped it reads —
    the protocol category tells an agent a plan is submitted as `plan.json`. A marker that
    matched published text would fail the crew on its own teaching surface, so the list may
    only name things on this side of the boundary.
    """
    scan = scan_for_leaks(json.dumps(SURFACE.contract(category), ensure_ascii=False))

    assert scan.violations == ()


@pytest.mark.parametrize(
    "leaked",
    [
        "packages/production/src/contracts/handlers.ts",
        "packages\\production\\src",
        "the LocalProductionClient stages it",
        "vox_crew.producer drives the sequence",
        "see handlers.ts for the dispatcher",
        "node_modules",
        "ELEVENLABS_API_KEY",
        "VOX_RUN_HMAC_KEY",
        "run `pnpm --filter @vox/production service`",
        "services/agents/tests/fixtures",
    ],
)
def test_the_leak_scan_catches_repository_vocabulary(leaked: str) -> None:
    scan = scan_for_leaks(f"Author a plan for the Brief. {leaked}\n")

    assert not scan.ok
    assert scan.violations


def test_the_message_beside_the_instructions_is_scanned_too() -> None:
    """A prompt is both halves. A secret reaching a model in a Brief is still a leak."""
    assert not scan_message_for_leaks({"id": "b", "text": "Use VOX_GRANT_KEY."}).ok
    assert not scan_message_for_leaks({"id": "b", "text": "See packages/production."}).ok


def test_the_message_scan_reads_a_brief_as_prose_and_not_as_a_work_root() -> None:
    """The half of the scan that reads English as evidence does not run over a Brief.

    `scan_for_leaks` guards text the crew assembled from repository-side material, where a
    file-shaped word is evidence. A Brief is prose an operator wrote: refusing one for saying
    "Node.js" would train this project's operators away from writing Briefs.
    """
    brief = {"id": "b", "text": "A 30-second explainer on Node.js adoption at 3.5s a beat."}

    assert scan_message_for_leaks(brief).ok
    assert not scan_for_leaks(brief["text"]).ok


def test_a_brief_that_carries_a_secret_never_reaches_an_author() -> None:
    """The gate is the same gate: nothing is scrubbed, and the author is not asked."""
    author = ScriptedPlanAuthor(a_catalog_following_plan())

    with pytest.raises(InstructionsLeaked):
        author_plan(cache_prefix(SURFACE), {"id": "b", "text": "Read ELEVENLABS_API_KEY first."}, author)

    assert author.asked == []


def test_instructions_that_leak_never_reach_an_author(monkeypatch) -> None:
    """A prompt is not reviewed on its way out, so the scan is a gate rather than a report."""
    monkeypatch.setattr(
        "vox_crew.planner._preamble",
        lambda **_: "Author from C:/Users/x/vox-studio/packages/production.",
    )
    author = ScriptedPlanAuthor(a_catalog_following_plan())

    with pytest.raises(InstructionsLeaked):
        author_plan(cache_prefix(SURFACE), {"id": "b", "text": "t"}, author)

    assert author.asked == []


# --- The review ------------------------------------------------------------------------


def test_a_plan_that_follows_the_catalog_has_nothing_to_report() -> None:
    assert review(a_catalog_following_plan(), SURFACE) == ()


def test_every_finding_speaks_the_compilers_own_published_vocabulary() -> None:
    """The crew names a defect the way the interface names it, and does not invent words.

    `means` and `repair` are read out of the published checks contract rather than written
    here, which is the same reason the prompts never re-explain a refusal.
    """
    published = SURFACE.contract("checks")["errors"]
    plan = a_catalog_following_plan()
    plan["sections"][0]["scenes"][0]["component"] = "pie_chart"

    findings = review(plan, SURFACE)

    assert findings
    for finding in findings:
        assert finding.code in published
        assert finding.means == published[finding.code]["means"]
        assert finding.repair == published[finding.code]["repair"]


@pytest.mark.parametrize(
    ("where", "value"),
    [
        ("durationFrames", 210),
        ("startFrame", 12),
        ("safeArea", {"top": 80}),
        ("seconds", 7),
    ],
)
def test_a_plan_that_writes_physical_time_is_a_finding(where: str, value: Any) -> None:
    """The compiler is the only writer of physical time. An agent that writes a frame is a bug."""
    plan = a_catalog_following_plan()
    plan["sections"][0]["scenes"][0][where] = value

    findings = review(plan, SURFACE)

    assert [finding.code for finding in findings] == ["MALFORMED_PLAN"]
    assert where in findings[0].where


def test_an_anchor_that_names_a_frame_is_a_finding() -> None:
    plan = a_catalog_following_plan()
    plan["sections"][0]["scenes"][0]["events"][0]["at"] = 90

    findings = review(plan, SURFACE)

    assert "MALFORMED_PLAN" in [finding.code for finding in findings]


def test_a_capability_the_catalog_does_not_publish_is_a_finding() -> None:
    plan = a_catalog_following_plan()
    plan["sections"][0]["scenes"][0]["component"] = "sankey_diagram"

    findings = review(plan, SURFACE)

    assert [finding.code for finding in findings] == ["UNKNOWN_CAPABILITY"]
    assert "sankey_diagram" in findings[0].detail


def test_an_action_the_capability_does_not_publish_is_a_finding() -> None:
    """Actions belong to a capability, so an action borrowed from another one is unknown here."""
    plan = a_catalog_following_plan()
    borrowed = CAPABILITIES["image_context"]["actions"][0]["id"]
    plan["sections"][0]["scenes"][0]["events"][0]["action"] = borrowed

    findings = review(plan, SURFACE)

    assert [finding.code for finding in findings] == ["UNKNOWN_ACTION"]
    assert borrowed in findings[0].detail


@pytest.mark.parametrize("anchor", ["b1.middle", "b1.start+halfway", "b9.start", "b1", "b1.end++long"])
def test_an_anchor_outside_the_published_forms_is_a_finding(anchor: str) -> None:
    plan = a_catalog_following_plan()
    plan["sections"][0]["scenes"][0]["events"][0]["at"] = anchor

    findings = review(plan, SURFACE)

    assert [finding.code for finding in findings] == ["UNKNOWN_ANCHOR"]


def test_every_anchor_the_catalog_gives_as_an_example_is_one_the_crew_accepts() -> None:
    """The guard on the anchor reader: a form the contract adds shows up here, not in a Run."""
    plan = a_catalog_following_plan()
    scene = plan["sections"][0]["scenes"][0]

    for form in CATALOG["time"]["forms"]:
        for example in form["examples"]:
            scene["events"] = [{"at": example, "action": "showBaseline"}]
            beat = example.split(".", 1)[0]
            scene["spansBeats"] = ["b1", "b2"] if beat == "scene" else [beat]
            plan["beats"] = [{"id": beat, "text": "A beat that speaks a word."}] if beat != "scene" else plan["beats"]
            assert review(plan, SURFACE) == (), f"{example} was refused"


def test_a_form_entry_that_is_not_an_object_widens_no_grammar() -> None:
    """ADR-0009: the reader takes its edge names from what the contract publishes as a form.

    A form entry published as a bare string rather than an object is one the crew cannot read.
    Taking its tail as an edge name anyway would let a contract widen the accepted grammar by
    malforming an entry, which is the one way the anchor reader is not allowed to grow. It is
    reported as unread instead — a hole the census names, not a licence.
    """
    published = {**CATALOG["time"], "forms": [*CATALOG["time"]["forms"], "<beatId>.middle"]}

    assert _anchor_pattern(published).pattern == _anchor_pattern(CATALOG["time"]).pattern
    assert _anchor_pattern(published).match("b1.middle") is None
    assert [(form.form, form.reader is None) for form in anchor_forms(published)][-1] == (
        "<beatId>.middle",
        True,
    )


def test_an_asset_requirement_that_names_a_resolved_reference_is_a_finding() -> None:
    """Assets stay semantic: a subject, a treatment and an orientation, never a file."""
    plan = a_catalog_following_plan()
    plan["sections"][0]["scenes"][0]["component"] = "image_context"
    plan["sections"][0]["scenes"][0]["events"] = []
    plan["sections"][0]["scenes"][0]["props"] = {
        "headline": "The gauge at high water",
        "assetRequirement": {
            "type": "image",
            "subject": "https://example.invalid/gauge.jpg",
            "treatment": "photo",
            "orientation": "landscape",
        },
    }

    findings = review(plan, SURFACE)

    assert [finding.code for finding in findings] == ["MALFORMED_PLAN"]
    assert "subject" in findings[0].where


@pytest.mark.parametrize(
    "subject",
    [
        "A tide gauge on a harbour wall at high water",
        "The high/low water marks on one post",
        "A before/after of the same jetty",
        "Larkmouth harbour at dawn, wide",
    ],
)
def test_a_subject_that_reads_as_english_is_not_taken_for_a_reference(subject: str) -> None:
    """A check that refused prose would teach the next author away from writing English."""
    plan = a_catalog_following_plan()
    scene = plan["sections"][0]["scenes"][0]
    scene["component"] = "image_context"
    scene["events"] = []
    scene["props"] = {
        "headline": "The readings",
        "assetRequirement": {
            "type": "image",
            "subject": subject,
            "treatment": "photo",
            "orientation": "landscape",
        },
    }

    assert review(plan, SURFACE) == ()


def test_no_field_the_catalog_publishes_reads_as_physical_time() -> None:
    """The guard on the physical-time reader.

    It matches on substrings, so a capability that gains a prop like `revealDuration` would
    turn every plan using it into a finding. That shows up here rather than in a Run.
    """
    from vox_crew.planner import PHYSICAL_TIME

    authorable: set[str] = set()
    for capability in CATALOG["capabilities"]:
        schema = capability.get("propsSchema") or {}
        for name, field in (schema.get("properties") or {}).items():
            authorable.add(name)
            items = field.get("items") if isinstance(field, dict) else None
            if isinstance(items, dict):
                authorable.update((items.get("properties") or {}).keys())
        for action in capability.get("actions", ()):
            payload = action.get("payloadSchema") or {}
            authorable.update((payload.get("properties") or {}).keys())

    assert authorable
    flagged = [name for name in authorable if any(word in name.lower() for word in PHYSICAL_TIME)]
    assert flagged == []


def test_a_semantic_asset_requirement_is_accepted() -> None:
    plan = a_catalog_following_plan()
    scene = plan["sections"][0]["scenes"][0]
    scene["component"] = "image_context"
    scene["events"] = []
    scene["props"] = {
        "headline": "The gauge at high water",
        "assetRequirement": {
            "type": "image",
            "subject": "A tide gauge on a harbour wall at high water",
            "treatment": "photo",
            "orientation": "landscape",
        },
    }

    assert review(plan, SURFACE) == ()


# --- The draft review, as a tool ---------------------------------------------------------


def test_a_draft_is_read_in_the_same_words_a_finished_plan_is() -> None:
    """The tool is the existing reading reached a turn earlier, not a second opinion.

    Asserted as an equality rather than by matching codes, because the value of the tool is
    precisely that an author sees what the crew sees. Two readings that agreed today and drifted
    later would be the defect this shape exists to make impossible.
    """
    plan = a_catalog_following_plan()
    plan["sections"][0]["scenes"][0]["durationInFrames"] = 210
    meter = DraftReview(SURFACE)

    answer = meter.tool()(json.dumps(plan))

    assert answer["clean"] is False
    assert [finding["code"] for finding in answer["findings"]] == [
        finding.code for finding in review(plan, SURFACE)
    ]
    assert answer["findings"] == [asdict(finding) for finding in review(plan, SURFACE)]


def test_a_finding_reaches_the_author_with_the_repair_the_contract_publishes() -> None:
    """A code alone would tell an author it was wrong without telling it what to write."""
    plan = a_catalog_following_plan()
    plan["sections"][0]["scenes"][0]["component"] = "no_such_capability"

    answer = DraftReview(SURFACE).tool()(json.dumps(plan))

    (finding,) = answer["findings"]
    assert finding["code"] == "UNKNOWN_CAPABILITY"
    assert finding["means"] and finding["repair"]
    assert finding["where"].startswith("plan.sections")


def test_a_clean_draft_comes_back_clean_and_says_nothing_more() -> None:
    """`clean` is a reading that found nothing. The wording of that is the contract's job."""
    answer = DraftReview(SURFACE).tool()(json.dumps(a_catalog_following_plan()))

    assert answer == {"findings": [], "clean": True}


def test_a_draft_that_is_not_a_plan_is_a_finding_rather_than_a_crash() -> None:
    """An author mid-draft is exactly who sends malformed JSON, and it must survive.

    Raising inside a tool would end the turn — the author would lose the draft it was holding
    over a defect it was one call away from being told about.
    """
    answer = DraftReview(SURFACE).tool()("{not json at all")

    assert answer["clean"] is False
    (finding,) = answer["findings"]
    assert finding["code"] == "MALFORMED_PLAN"


def test_a_draft_arriving_in_a_fence_is_read_rather_than_refused() -> None:
    """Models fence JSON. `_plan_from` already knew that, and the tool reads through it too."""
    fenced = "```json\n" + json.dumps(a_catalog_following_plan()) + "\n```"

    assert DraftReview(SURFACE).tool()(fenced) == {"findings": [], "clean": True}


def test_a_draft_that_does_not_parse_is_refused_with_the_contract_the_registry_publishes(
) -> None:
    """The one case where the author most needs the repair, and it was the case it never got.

    `MALFORMED_PLAN` is published with a `means` and a `repair` like every other code, and the
    tool was building it by hand with both blank — while its own docstring, which the model
    reads, promised them. A code with its contract stripped off is what the crew refuses to
    accept from the interface; it must not hand one to an author either.
    """
    answer = DraftReview(SURFACE).tool()("this is not a plan")
    finding = answer["findings"][0]
    published = published_errors(SURFACE)["MALFORMED_PLAN"]

    assert answer["clean"] is False
    assert finding["code"] == "MALFORMED_PLAN"
    assert finding["means"] == published["means"] != ""
    assert finding["repair"] == published["repair"] != ""


def test_an_author_offered_no_tool_is_handed_none_and_still_meters_zero() -> None:
    """One meter shape for every turn: an author that cannot call the tool reads zero.

    The alternative was an optional meter, and four call sites each asking whether they held
    one. Zero is the same answer an author that could call the tool and did not gives, and no
    caller has to tell those apart.
    """
    withheld = DraftReview(SURFACE, offered=False)

    assert withheld.check() is None
    assert withheld.model_calls == 1
    assert withheld.calls == 0
    assert DraftReview(SURFACE, offered=True).check() is not None


def test_the_tool_meters_what_it_cost_because_nothing_else_can_see_it() -> None:
    """Every call is another model call re-sending the prefix, counted where it happens."""
    meter = DraftReview(SURFACE)
    tool = meter.tool()

    assert meter.model_calls == 1
    tool(json.dumps(a_catalog_following_plan()))
    tool(json.dumps(a_catalog_following_plan()))

    assert meter.calls == 2
    assert meter.model_calls == 3
    assert meter.returned_chars > 0


def test_a_turn_that_used_a_tool_is_priced_over_every_call_it_made() -> None:
    """The accounting a bundle reports. An ask is not a model call once a tool is held.

    The prefix and the message beside it are both re-sent on every call, so both multiply. A
    tool's answer is not: it appears only in the calls after the one that asked for it, so it
    is charged apart from the two that repeat.
    """
    quiet = Ask(resident=1000, fresh=50)
    talkative = Ask(resident=1000, fresh=50, model_calls=3, returned=200)

    assert quiet.chars == 1050
    assert talkative.chars == 3350


def test_the_instructions_name_the_tool_only_to_an_author_that_holds_one() -> None:
    """Telling a scripted author to call a tool describes something that never answers.

    It also keeps a scripted Run's prefix the prefix it has always been, which is what lets the
    recorded context measurements stay comparable across a change that added a tool.
    """
    without = instructions(SURFACE)
    with_tool = instructions(SURFACE, drafts_reviewable=True)

    assert "review_draft" not in without
    assert "review_draft" in with_tool
    assert without in with_tool or len(with_tool) > len(without)


def test_an_author_that_reviews_drafts_is_offered_the_tool_and_one_that_does_not_is_not() -> None:
    """`author_plan` offers what the author said it could use, and nothing more."""
    author = ScriptedPlanAuthor(a_catalog_following_plan())

    author_plan(cache_prefix(SURFACE), REQUEST["brief"], author)

    assert author.offered == [None]

    author.reviews_drafts = True
    author_plan(cache_prefix(SURFACE), REQUEST["brief"], author)

    assert callable(author.offered[1])


def test_an_ask_records_the_tool_calls_the_author_actually_made() -> None:
    """What the turn cost, not what it was quoted. The quote is a floor once a tool is held."""

    class ReviewingAuthor(ScriptedPlanAuthor):
        reviews_drafts = True

        def author(self, instructions: str, brief: Any, *, check: Any = None) -> dict[str, Any]:
            assert check is not None
            check(json.dumps(self._plan))
            check(json.dumps(self._plan))
            return super().author(instructions, brief, check=check)

    prefix = cache_prefix(SURFACE, drafts_reviewable=True)
    quoted = authoring_ask(prefix, REQUEST["brief"])

    authored = author_plan(prefix, REQUEST["brief"], ReviewingAuthor(a_catalog_following_plan()))

    assert authored.ask.model_calls == 3
    assert authored.ask.fresh == quoted.fresh, "the message beside the prefix did not grow"
    assert authored.ask.returned > 0, "what the tool handed back is charged on its own line"
    assert authored.ask.chars > quoted.chars


def test_what_the_author_was_shown_while_drafting_is_kept_beside_what_it_settled_on() -> None:
    """The pair that answers whether holding the tool changed the plan or only cost turns.

    Driven with an author that is shown a defect and then answers with the plan repaired, which
    is the case worth being able to see: the code is in `reviewed` and gone from `findings`, and
    nothing else in the bundle could tell you that happened.
    """

    class RepairingWhileDrafting(ScriptedPlanAuthor):
        reviews_drafts = True

        def author(self, instructions: str, brief: Any, *, check: Any = None) -> dict[str, Any]:
            broken = a_catalog_following_plan()
            broken["sections"][0]["scenes"][0]["component"] = "no_such_capability"
            check(json.dumps(broken))
            return self._plan

    authored = author_plan(
        cache_prefix(SURFACE, drafts_reviewable=True),
        REQUEST["brief"],
        RepairingWhileDrafting(a_catalog_following_plan()),
    )

    assert authored.reviewed == ("UNKNOWN_CAPABILITY",)
    assert authored.findings == ()


def test_an_author_holding_no_tool_was_shown_nothing_and_says_so() -> None:
    """Empty rather than absent. Nothing was shown to anyone, which is a fact worth recording."""
    author = ScriptedPlanAuthor(a_catalog_following_plan())

    authored = author_plan(cache_prefix(SURFACE), REQUEST["brief"], author)

    assert authored.reviewed == ()
    assert authored.review_calls == 0


def test_a_clean_tool_call_is_told_apart_from_never_having_called_it() -> None:
    """Observed on the first run that held the tool: no codes, but the tool was used.

    `reviewed` is empty in both cases, so the count is the only thing that separates an author
    that asked and was told nothing was wrong from one that never asked at all. Those are
    opposite readings of the same run.
    """

    class AsksAndIsToldNothing(ScriptedPlanAuthor):
        reviews_drafts = True

        def author(self, instructions: str, brief: Any, *, check: Any = None) -> dict[str, Any]:
            check(json.dumps(self._plan))
            return self._plan

    authored = author_plan(
        cache_prefix(SURFACE, drafts_reviewable=True),
        REQUEST["brief"],
        AsksAndIsToldNothing(a_catalog_following_plan()),
    )

    assert authored.reviewed == ()
    assert authored.review_calls == 1


def test_an_author_that_called_no_tool_is_priced_exactly_as_it_always_was() -> None:
    """The change costs a scripted Run nothing, which is what keeps old measurements readable."""
    prefix = cache_prefix(SURFACE)
    author = ScriptedPlanAuthor(a_catalog_following_plan())

    authored = author_plan(prefix, REQUEST["brief"], author)

    assert authored.ask == authoring_ask(prefix, REQUEST["brief"])
    assert authored.ask.model_calls == 1


# --- The seam --------------------------------------------------------------------------


def test_an_author_is_handed_instructions_a_brief_and_the_tools_it_was_offered() -> None:
    """The model's seam carries payloads and tools, and nothing that locates anything.

    **ADR-0016 is where this rule lives.** It was payloads only until a draft could be
    reviewed, and the widening to callables was recorded in this docstring — which a review
    correctly called the wrong home, since a rule that has to be reconstructed from a test is
    a rule that will be broken by someone who never found it.

    What the rule was actually protecting is unchanged and is what this test asserts: nothing
    here names a path, a root, a directory, a file or a client, so an author still cannot tell
    where it is running or reach the production sequence sideways. A tool that wanted a work
    root would fail this exactly as it always would have.
    """
    signature = inspect.signature(PlanAuthor.author)

    assert list(signature.parameters) == ["self", "instructions", "brief", "check"]
    for parameter in signature.parameters.values():
        assert not any(
            word in parameter.name.lower() for word in ("path", "root", "dir", "file", "client")
        )
        assert "Path" not in str(parameter.annotation)


def test_a_tool_is_offered_to_an_author_and_never_required_of_one() -> None:
    """An author written before tools existed is still an implementation of this seam.

    Keyword-only with a default is what makes that true, and it is the reason `HandedPlanAuthor`
    needs no opinion about tools to keep working. A positional `check` would make every existing
    implementation invalid at once, which is the kind of break a defaulted keyword exists to
    avoid.
    """
    for method in (PlanAuthor.author, PlanAuthor.repair):
        check = inspect.signature(method).parameters["check"]

        assert check.kind is inspect.Parameter.KEYWORD_ONLY
        assert check.default is None


def test_nothing_above_the_seam_knows_which_author_it_is_holding() -> None:
    """The same rule ADR-0015 puts on the client, applied to the model."""
    import vox_crew.planner as planner

    source = inspect.getsource(planner)
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith(("def ", "class ", "#", '"', "*")):
            continue
        assert "isinstance" not in stripped or "PlanAuthor" not in stripped


def test_the_live_author_is_not_imported_until_one_is_built() -> None:
    """A bare `pytest` run needs no framework install, which is what the extra is for."""
    source = inspect.getsource(sys.modules["vox_crew.planner"])
    module_level = [line for line in source.splitlines() if line.startswith("from ") or line.startswith("import ")]

    assert not any("google" in line for line in module_level)


def test_the_live_author_builds_its_agent_from_the_instructions_it_was_given() -> None:
    """As far as a keyless machine can go: the agent is built, and never asked anything."""
    google_adk = pytest.importorskip("google.adk")
    assert google_adk
    text = instructions(SURFACE)

    agent = AdkPlanAuthor(model="gemini-3.1-flash-lite").agent(text)

    assert agent.instruction == text
    # Deliberately not the default, so this reads the model through rather than past it.
    assert agent.model == "gemini-3.1-flash-lite"


def test_the_live_author_binds_the_draft_review_onto_the_agent_it_builds() -> None:
    """The binding itself, as far as a keyless machine can follow it.

    This is the assertion the whole change turns on: the tools existed and were reachable by
    nothing. Building the agent is where that stops being true, and it is the last step before
    a credential is needed — so it is the last thing that can be proved for free.
    """
    pytest.importorskip("google.adk")
    from google.adk.tools import FunctionTool

    tool = DraftReview(SURFACE).tool()

    agent = AdkPlanAuthor(model="gemini-3.1-flash-lite").agent(instructions(SURFACE), tool)

    (held,) = agent.tools
    assert held is tool

    # What the framework makes of it, which is what the model is actually shown. Built directly
    # rather than through the agent's own `canonical_tools`, which is a coroutine: awaiting one
    # needs an event loop, and an event loop on Windows opens a socket pair that this suite's
    # network sentinel refuses — correctly, and for a reason worth more than this assertion.
    declared = FunctionTool(func=held)

    assert declared.name == "review_draft"
    assert "draft VideoPlan" in (declared.description or "")


def test_the_live_author_offered_no_tool_builds_an_agent_holding_none() -> None:
    """A tool nobody offered is not a tool the agent invents."""
    pytest.importorskip("google.adk")

    agent = AdkPlanAuthor(model="gemini-3.1-flash-lite").agent(instructions(SURFACE))

    assert list(agent.tools) == []


def test_the_live_author_says_it_reviews_drafts_and_the_scripted_ones_do_not() -> None:
    """What the prefix is built from. An author that cannot call a tool is not told to."""
    assert AdkPlanAuthor.reviews_drafts is True
    assert HandedPlanAuthor.reviews_drafts is False
    assert PlanAuthor.reviews_drafts is False


def test_the_tool_a_model_reads_carries_no_repository_vocabulary() -> None:
    """The tool's docstring is prompt text, so it is held to the gate the instructions are.

    The framework builds the declaration a model sees out of the function's name, signature and
    docstring. That text reaches a model without passing through `instructions`, which is
    exactly how a leak gets somewhere nothing scans it.
    """
    tool = DraftReview(SURFACE).tool()

    assert scan_for_leaks(tool.__doc__ or "").ok
    assert scan_for_leaks(tool.__name__).ok


def test_the_live_author_pins_a_model_that_is_still_served() -> None:
    """The default is a pin, and a rotted pin fails at the first turn of a paid run.

    Google retires a family to new callers while `models.list()` still returns it, so the
    catalogue cannot answer this and neither can a test without a credential. What a keyless
    machine *can* do is refuse to hold a name from a family already known to be retired, which
    is the failure that actually happened rather than a hypothetical one.
    """
    retired_families = ("gemini-1.", "gemini-2.")

    default = AdkPlanAuthor.__init__.__kwdefaults__["model"]

    assert not default.startswith(retired_families), f"{default} is retired to new callers"
    assert "latest" not in default, "an alias cannot tell a bundle which model authored a plan"


def test_a_handed_plan_is_answered_as_the_plan_it_was_handed() -> None:
    """The third implementation of the seam, and the only one that ships.

    A machine with no model credential can still drive every part of the crew that is not the
    model, and that is what the end-to-end test is: the convergence, the producer, the read-back
    and the bundle, with the one non-deterministic party replaced by a plan an operator wrote.
    """
    plan = a_catalog_following_plan()

    answered = HandedPlanAuthor(plan).author(instructions(SURFACE), REQUEST["brief"])

    assert answered == plan


def test_a_handed_plan_refuses_to_answer_a_refusal_rather_than_resubmitting_itself() -> None:
    """A repair is the one thing a handed plan cannot be.

    Answering with the plan that was just refused would spend the whole repair budget arriving
    at the same refusal and end the Run as `budget-exhausted`, which reads in a bundle as a
    crew that tried and failed rather than as an operator who handed it an unservable plan.
    """
    author = HandedPlanAuthor(a_catalog_following_plan())
    refusal = a_refusal()

    with pytest.raises(PlanNotRepairable) as refused:
        author.repair(instructions(SURFACE), REQUEST["brief"], a_catalog_following_plan(), refusal)

    # The refusal it could not answer is named in what it raises, in production's own codes, so
    # a bundle reading the failure says which refusal ended the Run rather than that one did.
    assert ", ".join(refusal.codes) in str(refused.value)


# --- A Run, authored -------------------------------------------------------------------


def test_an_authored_plan_carries_a_brief_from_a_fresh_run_to_a_rendered_preview(
    work_root, launcher
) -> None:
    """Discovery, authoring and the whole production sequence, for zero tokens."""
    responses = {
        "production contract index": {"stdout": recorded("contract-index.stdout")},
        **{
            f"production contract show {name}": {"stdout": stdout_for(name)}
            for name in CATEGORIES
        },
        **a_complete_run(),
    }
    client = client_for(work_root, launcher, responses)
    author = ScriptedPlanAuthor(a_catalog_following_plan())

    run = plan_and_produce(client, REQUEST, author)

    assert isinstance(run, AuthoredRun)
    assert run.produced.rendered
    assert run.findings == ()
    assert run.plan == a_catalog_following_plan()
    assert verbs(client)[:2] == ["production contract index", "production contract show"]
    assert verbs(client)[-6:] == [
        "production run init",
        "production run validate",
        "production run preflight",
        "production run record",
        "production run compile",
        "production run render",
    ]


def test_the_author_is_asked_with_the_brief_the_request_carried(work_root, launcher) -> None:
    responses = {
        "production contract index": {"stdout": recorded("contract-index.stdout")},
        **{
            f"production contract show {name}": {"stdout": stdout_for(name)}
            for name in CATEGORIES
        },
        **a_complete_run(),
    }
    client = client_for(work_root, launcher, responses)
    author = ScriptedPlanAuthor(a_catalog_following_plan())

    run = plan_and_produce(client, REQUEST, author)

    assert len(author.asked) == 1
    asked_with, brief = author.asked[0]
    assert brief == REQUEST["brief"]
    assert asked_with == run.instructions
    assert scan_for_leaks(asked_with).ok


def test_the_plan_that_was_authored_is_the_plan_that_was_submitted(work_root, launcher) -> None:
    """Nothing between the model and the compiler edits what the model wrote."""
    responses = {
        "production contract index": {"stdout": recorded("contract-index.stdout")},
        **{
            f"production contract show {name}": {"stdout": stdout_for(name)}
            for name in CATEGORIES
        },
        **a_complete_run(),
    }
    client = client_for(work_root, launcher, responses)
    author = ScriptedPlanAuthor(a_catalog_following_plan())

    run = plan_and_produce(client, REQUEST, author)

    staged = next(work_root.glob("run-*/plan.json"))
    assert json.loads(staged.read_text(encoding="utf-8")) == run.plan


def test_a_refused_plan_comes_back_intact_and_nothing_crashes(work_root, launcher) -> None:
    """Refusal is a successful outcome for this ticket. Converging on it is the next one."""
    responses = {
        "production contract index": {"stdout": recorded("contract-index.stdout")},
        **{
            f"production contract show {name}": {"stdout": stdout_for(name)}
            for name in CATEGORIES
        },
        **refused_at_validation(),
    }
    client = client_for(work_root, launcher, responses)
    author = ScriptedPlanAuthor(a_catalog_following_plan())

    run = plan_and_produce(client, REQUEST, author)

    assert run.produced.refusal is not None
    assert run.produced.refusal.outcome == "needs_repair"
    assert run.produced.refusal.raw == recorded("run-validate-needs-repair.stdout")
    assert not run.produced.rendered
    assert run.plan == a_catalog_following_plan()


def test_a_plan_with_findings_is_still_submitted(work_root, launcher) -> None:
    """The compiler is the only authority on a plan.

    A crew that refused to submit on its own reading would put its opinion above the
    interface's, which is the coupling the whole design is arranged to avoid. The findings
    travel with the Run instead, for the repair loop and the evidence bundle to read.
    """
    responses = {
        "production contract index": {"stdout": recorded("contract-index.stdout")},
        **{
            f"production contract show {name}": {"stdout": stdout_for(name)}
            for name in CATEGORIES
        },
        **a_complete_run(),
    }
    client = client_for(work_root, launcher, responses)
    plan = a_catalog_following_plan()
    plan["sections"][0]["scenes"][0]["durationFrames"] = 210
    author = ScriptedPlanAuthor(plan)

    run = plan_and_produce(client, REQUEST, author)

    assert [finding.code for finding in run.findings] == ["MALFORMED_PLAN"]
    assert run.produced.rendered
    assert "production run validate" in verbs(client)


def test_the_planner_never_learns_where_a_run_lives() -> None:
    for function in (author_plan, plan_and_produce, instructions, review):
        for parameter in inspect.signature(function).parameters.values():
            assert not any(
                word in parameter.name.lower() for word in ("path", "root", "dir", "file", "cwd")
            ), f"{function.__name__} takes a path-shaped parameter {parameter.name!r}"
            assert "Path" not in str(parameter.annotation)


def test_a_run_the_crew_authored_never_reaches_the_network(work_root, launcher) -> None:
    """The sentinel is autouse, so this passing is the assertion. Recorded, and free."""
    responses = {
        "production contract index": {"stdout": recorded("contract-index.stdout")},
        **{
            f"production contract show {name}": {"stdout": stdout_for(name)}
            for name in CATEGORIES
        },
        **a_complete_run(),
    }
    client = client_for(work_root, launcher, responses)

    run = plan_and_produce(client, REQUEST, ScriptedPlanAuthor(a_catalog_following_plan()))

    assert run.produced.artifact("preview").data == recorded_bytes("preview.mp4")


# --- The gesture that was available and not taken -----------------------------------------


def a_plan_that_declines_the_gesture() -> dict[str, Any]:
    """The catalog-following plan, with its one pointing event traded for an annotation.

    Derived from `a_catalog_following_plan` rather than written beside it, so the two differ in
    exactly the thing under test. `annotate` names the same bar in the same payload and declares
    no deictic field, which is the trade the measurement found the author making every time it
    had the choice.

    The beat is rewritten to *say* the town, and that is not incidental. The shared plan speaks
    none of its own labels, so the rule is correctly silent on it whichever action it uses —
    there is no gesture to decline when the narration never names the thing. Saying it is what
    creates the opportunity this plan then declines.
    """
    plan = a_catalog_following_plan()
    plan["beats"][1]["text"] = "Only Larkmouth was reading the gauge at high water."
    plan["sections"][0]["scenes"][0]["events"][2] = {
        "at": "b2.start",
        "action": "annotate",
        "payload": {"label": "Larkmouth", "text": "the only one at high water"},
    }
    return plan


def declined(findings: tuple[Finding, ...]) -> tuple[Finding, ...]:
    return tuple(f for f in findings if f.code == "DEICTIC_OPPORTUNITY_MISSED")


def test_a_scene_that_could_have_pointed_and_did_not_is_a_finding() -> None:
    """The reading the author can act on while it still costs a tool call rather than a Run.

    Until this, the crew could tell an author that its plan was wrong and never that its plan
    was *poorer than it needed to be*. Every event of the Run that provoked the rule was legal.
    """
    found = declined(review(a_plan_that_declines_the_gesture(), SURFACE))

    assert len(found) == 1
    assert "readings-compared" in found[0].where


def test_a_declined_gesture_names_the_anchors_the_author_could_have_written() -> None:
    """A finding that says "you could have pointed" and stops is a research task.

    The anchors go in `detail` because `detail` is the crew's own field — `means` and `repair`
    belong to the interface and are the same sentence for every plan, while which words *this*
    beat speaks is the only part that makes the finding a substitution.
    """
    found = declined(review(a_plan_that_declines_the_gesture(), SURFACE))

    assert "b2.word:Larkmouth" in found[0].detail


def test_a_declined_gesture_carries_the_contract_the_registry_publishes_for_a_warning() -> None:
    """The half that made this a change to `review` rather than a rule bolted beside it.

    Every finding the crew reports carries the interface's own `means` and `repair`, read from
    the published checks contract. This is the first one whose code lives in the registry's
    **warnings** rather than its errors, and a lookup that only ever read `errors` would have
    handed the author a code with its contract stripped off — the exact thing the crew refuses
    to accept from the interface.
    """
    published = SURFACE.contract("checks")["warnings"]
    found = declined(review(a_plan_that_declines_the_gesture(), SURFACE))

    assert found[0].means == published["DEICTIC_OPPORTUNITY_MISSED"]["means"]
    assert found[0].repair == published["DEICTIC_OPPORTUNITY_MISSED"]["repair"]


def test_a_plan_that_points_once_is_not_pushed_to_point_again() -> None:
    """`a_catalog_following_plan` highlights a bar, and its other two events reveal.

    The rule is per SceneInstance and satisfied by one gesture, so a scene that points is done.
    Judging per event would push the author to point at every label in a chart, which is a
    different defect and a worse one.
    """
    assert declined(review(a_catalog_following_plan(), SURFACE)) == ()


def test_a_scene_whose_props_name_nothing_spoken_is_not_asked_to_invent_a_gesture() -> None:
    """The condition that keeps the rule off prose.

    Nothing in these labels is a word either beat says, so there was no gesture to decline.
    Reporting one would be asking the author to point at something the material does not carry.
    """
    plan = a_plan_that_declines_the_gesture()
    plan["sections"][0]["scenes"][0]["props"]["data"] = [
        {"label": "Ashford", "value": 4.1},
        {"label": "Windermere", "value": 3.6},
    ]
    plan["sections"][0]["scenes"][0]["events"][2]["payload"]["label"] = "Ashford"
    assert "Ashford" not in json.dumps(plan["beats"])

    assert declined(review(plan, SURFACE)) == ()


def test_the_crew_reads_the_same_plans_the_compiler_does_and_reaches_the_same_verdict() -> None:
    """The assertion that keeps two implementations of one rule honest.

    Not a second copy of the fixture: this is the same file `packages/video`'s validation suite
    asserts against, which is what makes "the same plans" literally true. Two copies would let
    the rules drift and leave this test asserting that each agrees with itself.

    A pre-submission reading that disagreed with the compiler is worse than no reading at all —
    the author would repair against one rule and be judged by the other.
    """
    plan = json.loads(DECLINED_GESTURES.read_text(encoding="utf-8"))

    where = [finding.where for finding in declined(review(plan, SURFACE))]

    assert len(where) == 3
    for scene in ("scene-timeline", "scene-line", "scene-bar"):
        assert any(scene in one for one in where), scene


def test_the_shipped_reference_plan_is_as_quiet_for_the_crew_as_for_the_compiler() -> None:
    """The falsification, on the other plan of the pair.

    A rule that fires on the plan the repository ships is a rule whose findings nobody can read.
    """
    plan = json.loads(VERTICAL_SLICE.read_text(encoding="utf-8"))

    assert declined(review(plan, SURFACE)) == ()


def test_an_author_holding_the_tool_is_told_a_word_anchor_can_be_checked_first() -> None:
    """The asymmetry closed from the other end.

    Declining the gesture now costs the author a warning; this is what stops attempting it
    being a gamble. A word anchor risks two refusals — the word must be in the Beat exactly
    once, and it must land on the value the payload names — and both are readable from the
    plan alone, so both are answerable before the plan is submitted.
    """
    text = instructions(SURFACE, drafts_reviewable=True)

    assert "word anchor" in text


def test_an_author_holding_no_tool_is_told_nothing_about_checking_one() -> None:
    """The preamble sentence goes where the tool is, and nowhere else.

    Stated narrowly on purpose, because the obvious wider claim is false. Ticket 17 asks that
    "a scripted Run's instruction prefix is byte-identical to what it was", and after this
    change it is not: the same ticket rewrites the action descriptions, and those *are* the
    prefix — it grew by about 2.2 KB, which is why the contract fixtures had to be re-recorded.
    What the ticket was protecting is the half it could protect, and that is what this asserts:
    the scripted prefix is a byte-identical *prefix of* the tool-holding one, so the tool prose
    is appended and never woven into the paragraphs a scripted author reads, and the contract
    half is identical between the two. Prose woven in rather than appended would fail here and
    pass the test next door.
    """
    without = instructions(SURFACE, drafts_reviewable=False)
    with_tool = instructions(SURFACE, drafts_reviewable=True)

    preamble_without, marker, contract_without = without.partition("\n## ")
    preamble_with, _, contract_with = with_tool.partition("\n## ")

    assert marker, "the instructions no longer separate the preamble from the categories"
    assert contract_without == contract_with
    assert preamble_with.startswith(preamble_without)
    assert "word anchor" not in preamble_without
