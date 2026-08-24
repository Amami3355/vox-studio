"""Driving one Run to a preview through however many refusals it takes.

`producer.py` holds the production sequence with the judgement taken out — one pass, and a
refusal ends it because a producer handed a single plan has nothing to repair with. This module
holds the same sequence with the judgement put back. It is written separately rather than as a
loop around `produce`, and the reason is not tidiness:

- **A Run is opened once.** `produce` opens one every time it is called, which is correct for
  what it does and would throw away the Take on every second attempt here. Convergence lives
  inside one Run, because the Take is the expensive thing in it.
- **Preflight is consulted, not merely called.** `produce` runs Preflight and reads whether the
  envelope succeeded, which is all a producer with no plan to repair with can do. Preflight
  does not refuse — the protocol publishes `risksBlockRecord: false` — so consulting it means
  reading the report it published and repairing on what it says, and that has to happen in
  between two of `produce`'s own steps.

Three things here are load-bearing.

**Nothing is repaired from the crew's own reading.** Every repair is authored against what
production published, gathered by `refusals.py` and handed to the author whole. `review`'s
findings still travel with the Run and still do not block anything; the compiler remains the
only authority on a plan.

**Take-preserving repair is enforced, not requested.** The protocol publishes exactly what a
Take survives — `takeRemainsReusableWhen: ordered Beat texts, segmentation and voice settings
are unchanged` — and exactly what to do instead: `preferredDurationRepair: reassign or merge
existing Beats before changing narration text`. Once a Take exists, a repair that rewrites Beat
text is not submitted. It is not submitted rather than submitted-and-regretted because the
plan's beats are the recording input: sending one would stale the Take, and the next `record`
would be a second synthesis dispatch against a `maxNewTakes` of one. The interface would refuse
that correctly, and the Take would still be gone.

**The budget comes from the Brief and nothing else.** `repair_budget` is the proof harness's
own rule, keyed on the duration the Brief asks for. A budget keyed on scenes or beats would let
an agent buy itself attempts by splitting its plan, and a budget keyed on a constant moves the
wall every time the Brief gets longer. Exhausting it is an outcome with the limit named, not a
loop that stops being interesting.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .client import Artifact, ProductionClient
from .envelopes import NEEDS_REPAIR, MalformedEnvelope, ResultEnvelope
from .planner import AuthoredPlan, Finding, PlanAuthor, author_plan, repair_plan
from .producer import READ_BACK, read_back_artifacts
from .refusals import Refusal, read_refusal
from .teaching_surface import TeachingSurface, read_teaching_surface

# How a converged Run ended. Three outcomes, and only one of them is a preview.
RENDERED = "rendered"
BUDGET_EXHAUSTED = "budget_exhausted"
STOPPED = "stopped"

# The assessment that means a scene is clear of a threshold across its whole estimate range.
# One of the three names `protocol.preflight.assessments` publishes; a test holds it to that
# list, so an assessment vocabulary that changes shows up here rather than in a paid Run.
MARGIN_CLEAR = "margin_clear"

# The duration a Brief asks for, in the Brief's own words. Briefs state it at the top — "a
# 20–30-second explainer", "a 110–130-second explainer" — and a range means its midpoint,
# which is what the proof scenarios record for the three Briefs that exist. Later numbers in
# a Brief are its content, not its length, which is why only the first match counts.
ASKS_FOR = re.compile(
    r"(?P<low>\d+)"
    r"(?:\s*(?:[-–—]|to)\s*(?P<high>\d+))?"
    r"\s*[-–—\s]*(?P<unit>seconds?|minutes?)\b",
    re.IGNORECASE,
)

# What a Brief that names no duration is budgeted as. The proof harness defaults the same way
# and to the same number, which is the short Brief's own length.
UNSTATED_SECONDS = 25


@dataclass(frozen=True, slots=True)
class RepairBudget:
    """How much converging on a Brief of a given length is allowed to cost.

    The four numbers are the proof harness's `limits` assertions, which is deliberate: the crew
    is judged against those sheets, so a crew working to a budget of its own would either fail
    them or make them meaningless. `cycles` is the published rule; the rest are the counts that
    rule implies, named the way the assertions name them.
    """

    cycles: int
    plan_versions: int
    preflight_calls: int
    post_record_plan_versions: int


@dataclass(frozen=True, slots=True)
class ConvergedRun:
    """One Run, from discovery through however many repairs it took, and how it ended."""

    surface: TeachingSurface
    run_id: str | None
    outcome: str
    budget: RepairBudget
    versions: tuple[AuthoredPlan, ...]
    submitted: tuple[Mapping[str, Any], ...]
    withheld: tuple[AuthoredPlan, ...]
    refusals: tuple[Refusal, ...]
    envelopes: tuple[ResultEnvelope, ...]
    artifacts: tuple[Artifact, ...]
    limit: str | None

    @property
    def rendered(self) -> bool:
        return self.outcome == RENDERED

    @property
    def authored(self) -> AuthoredPlan:
        """The last plan the author wrote, which is the one the Run stands on."""
        return self.versions[-1]

    @property
    def plan(self) -> Mapping[str, Any]:
        return self.authored.plan

    @property
    def instructions(self) -> str:
        return self.authored.instructions

    @property
    def findings(self) -> tuple[Finding, ...]:
        return self.authored.findings

    @property
    def refusal(self) -> Refusal | None:
        """The last thing production said that the crew had to act on."""
        return self.refusals[-1] if self.refusals else None

    def artifact(self, kind: str) -> Artifact | None:
        return next((item for item in self.artifacts if item.kind == kind), None)


def target_seconds(brief: Mapping[str, Any], unstated: int = UNSTATED_SECONDS) -> int:
    """The duration a Brief asks for, read out of the Brief.

    It is not a field. `productionRequestSchema` carries a Brief as an id and its text, so the
    length a Brief asks for exists only in the words it asks in — which is the right place for
    it to come from anyway, since the point of keying the budget on duration is that the Brief
    chose it and the agent did not.

    A Brief that names no duration is budgeted as the shortest one that exists rather than as
    unlimited, because an unbounded budget is the failure mode this whole idea is against.
    """
    found = ASKS_FOR.search(str(brief.get("text", "")))
    if found is None:
        return unstated
    low = int(found.group("low"))
    high = int(found.group("high")) if found.group("high") else low
    seconds = (low + high) // 2
    return seconds * 60 if found.group("unit").lower().startswith("minute") else seconds


def repair_budget(seconds: int) -> RepairBudget:
    """The proof harness's own budget rule, at a Brief's length.

    `2 + ceil(seconds / 60)` is `repairCycleBudget`, and the counts around it are the limits the
    assertion sheets hold a Run to: at most `cycles + 2` plan versions and validate calls, at
    most `cycles` Preflight calls, and at most two plan versions after a Take exists. Repeating
    the rule here rather than deriving it is the cost of the crew being a Python process that
    cannot import the sheet it is judged by; a test pins the three Briefs' numbers so the two
    cannot drift silently.
    """
    cycles = 2 + math.ceil(seconds / 60)
    return RepairBudget(
        cycles=cycles,
        plan_versions=cycles + 2,
        preflight_calls=cycles,
        post_record_plan_versions=2,
    )


def beat_shape(plan: Mapping[str, Any]) -> tuple[tuple[str, str], ...]:
    """The part of a plan a Take is bound to: its Beats' ids and text, in order.

    The protocol says a Take stays reusable while "ordered Beat texts, segmentation and voice
    settings are unchanged". Voice settings live in the request, which the crew never edits, so
    for a repair the whole question is this tuple. Everything else in a plan — which Beats a
    Section holds, which a Scene spans, its props and its events — is free.
    """
    return tuple(
        (str(beat.get("id", "")), str(beat.get("text", "")))
        for beat in plan.get("beats", ()) or ()
        if isinstance(beat, Mapping)
    )


def take_preserved(recorded: Mapping[str, Any], repaired: Mapping[str, Any]) -> bool:
    """Whether a repair leaves the Take that was recorded from `recorded` still usable."""
    return beat_shape(recorded) == beat_shape(repaired)


def preflight_risks(report: Mapping[str, Any]) -> tuple[str, ...]:
    """What Preflight published that is worth repairing before a Take is spent.

    Two things count. A plan check in the `error` regime is the compiler's own vocabulary, seen
    early. A scene that does not clear its *minimum* across the whole estimate range is the
    `BELOW_MIN_DURATION` refusal arriving after the money instead of before it.

    The *recommended* threshold deliberately does not count. Missing it publishes
    `SCENE_BELOW_RECOMMENDED_DURATION`, which is a warning about pacing that a plan may ship
    with, and treating a quality note as a reason to spend a repair cycle would spend the
    budget on the thing the budget exists to protect.

    Duration can be unavailable — a first Run has no calibration to estimate from. There is
    then nothing to consult about duration, and saying so by returning nothing is honest where
    guessing would not be.
    """
    risks: list[str] = []
    for finding in (report.get("planChecks") or {}).get("findings") or ():
        if isinstance(finding, Mapping) and finding.get("regime") == "error":
            risks.append(str(finding.get("code", "")))
    duration = report.get("duration") or {}
    if duration.get("status") == "available":
        for scene in duration.get("scenes") or ():
            if not isinstance(scene, Mapping):
                continue
            if (scene.get("minimum") or {}).get("assessment") != MARGIN_CLEAR:
                risks.append(str(scene.get("sceneId", "")))
    return tuple(risks)


def converge(
    client: ProductionClient,
    request: Mapping[str, Any],
    author: PlanAuthor,
    *,
    budget: RepairBudget | None = None,
    on_envelope: Callable[[ResultEnvelope], None] | None = None,
    read_back: Sequence[str] = READ_BACK,
) -> ConvergedRun:
    """Discovery, authoring, and one Run driven until it renders or the budget is gone.

    `on_envelope` sees every envelope in the order it arrived, refusals included, so an audit
    trail records what production said across the whole convergence rather than only the pass
    that happened to succeed.

    Nothing raises on a refusal. A Run that ends refused, stopped or out of budget comes back
    with the material that ended it, because that is what an operator has to read.
    """
    surface = read_teaching_surface(client, on_envelope)
    brief = request.get("brief", {})
    allowed = budget if budget is not None else repair_budget(target_seconds(brief))

    announce = on_envelope if on_envelope is not None else lambda _: None
    envelopes: list[ResultEnvelope] = []
    versions: list[AuthoredPlan] = [author_plan(surface, brief, author)]
    submitted: list[Mapping[str, Any]] = []
    withheld: list[AuthoredPlan] = []
    refusals: list[Refusal] = []
    recorded: Mapping[str, Any] | None = None
    validates = 0
    preflights = 0
    after_take = 0

    def step(envelope: ResultEnvelope) -> ResultEnvelope:
        envelopes.append(envelope)
        announce(envelope)
        return envelope

    def ended(
        outcome: str,
        run: str | None,
        limit: str | None = None,
        artifacts: tuple[Artifact, ...] = (),
    ) -> ConvergedRun:
        return ConvergedRun(
            surface=surface,
            run_id=run,
            outcome=outcome,
            budget=allowed,
            versions=tuple(versions),
            submitted=tuple(submitted),
            withheld=tuple(withheld),
            refusals=tuple(refusals),
            envelopes=tuple(envelopes),
            artifacts=artifacts,
            limit=limit,
        )

    opened = step(client.init(request))
    if not opened.succeeded:
        refusals.append(read_refusal(client, None, opened, surface))
        return ended(STOPPED, None)
    if opened.run is None:
        raise MalformedEnvelope("run init succeeded and named no Run.")
    run_id = opened.run.id

    def repaired_against(refusal: Refusal) -> str | None:
        """Asks for a repair, and keeps asking while one arrives that would cost the Take.

        Returns the budget line that ran out, or None once a usable repair is in hand. A
        withheld repair is still charged to the post-record budget: the model wrote a version,
        and the sheets count what was authored rather than what survived the crew's reading.
        That is also what makes this terminate — before a Take nothing can be withheld, and
        after one every ask moves the budget whether or not the answer was submitted.
        """
        nonlocal after_take
        refusals.append(refusal)
        while True:
            if len(versions) >= allowed.plan_versions:
                return "plan_versions"
            if recorded is not None and after_take >= allowed.post_record_plan_versions:
                return "post_record_plan_versions"
            proposed = repair_plan(surface, brief, versions[-1].plan, refusal, author)
            if recorded is not None:
                after_take += 1
            if recorded is None or take_preserved(recorded, proposed.plan):
                versions.append(proposed)
                return None
            withheld.append(proposed)

    while True:
        if validates >= allowed.plan_versions:
            return ended(BUDGET_EXHAUSTED, run_id, "validate_calls")
        plan = versions[-1].plan
        validated = step(client.validate(run_id, plan))
        validates += 1
        submitted.append(plan)
        if validated.outcome == NEEDS_REPAIR:
            spent = repaired_against(read_refusal(client, run_id, validated, surface))
            if spent is not None:
                return ended(BUDGET_EXHAUSTED, run_id, spent)
            continue
        if not validated.succeeded:
            refusals.append(read_refusal(client, run_id, validated, surface))
            return ended(STOPPED, run_id)

        if preflights >= allowed.preflight_calls:
            return ended(BUDGET_EXHAUSTED, run_id, "preflight_calls")
        preflighted = step(client.preflight(run_id))
        preflights += 1
        if not preflighted.succeeded:
            refusals.append(read_refusal(client, run_id, preflighted, surface))
            return ended(STOPPED, run_id)
        advisory = read_refusal(client, run_id, preflighted, surface, advisory=True)
        if advisory.report is not None and preflight_risks(advisory.report):
            spent = repaired_against(advisory)
            if spent is not None:
                return ended(BUDGET_EXHAUSTED, run_id, spent)
            continue

        took = step(client.record(run_id))
        if not took.succeeded:
            # A paused Run is the operator's, not the crew's: `maxNewTakes` is exhausted or a
            # replacement grant is required, and both are authorisations the crew may not give
            # itself. It stops holding everything production said, which is what an operator
            # needs to decide with.
            refusals.append(read_refusal(client, run_id, took, surface))
            return ended(STOPPED, run_id)
        recorded = plan

        compiled = step(client.compile(run_id))
        if compiled.outcome == NEEDS_REPAIR:
            spent = repaired_against(read_refusal(client, run_id, compiled, surface))
            if spent is not None:
                return ended(BUDGET_EXHAUSTED, run_id, spent)
            continue
        if not compiled.succeeded:
            refusals.append(read_refusal(client, run_id, compiled, surface))
            return ended(STOPPED, run_id)

        rendered = step(client.render(run_id))
        if not rendered.succeeded:
            refusals.append(read_refusal(client, run_id, rendered, surface))
            return ended(STOPPED, run_id)

        # The read-back is the producer's own rule — by descriptor, through the client, latest
        # publisher of a kind wins — and a Run that recompiled published two compile reports.
        # Writing it out a second time here is how the two would drift apart.
        published = read_back_artifacts(client, run_id, envelopes, read_back)
        return ended(RENDERED, run_id, artifacts=published)
