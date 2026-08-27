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

**The context budget is the second wall, and it is read the same way.** `context.py` measures
what a Run puts in front of a model; the instructions are assembled once, here, and every turn
below is authored against that one object. A Run that would pass what it is budgeted ends
`budget_exhausted` with `context.py`'s own line named, rather than overrunning quietly and
being discovered on an invoice. The one exception is a prefix that does not fit before any turn
has happened, which is refused outright — see `ContextBudgetExceeded`.

**The recording quota is read, never kept.** `protocol.recording` publishes the whole rule set
this loop obeys — `run.record` is the only network command, a verified matching Take is `reuse
without quota`, an identical input redispatched needs a `replacement grant required`, and an
exhausted budget is `paused before network`. Every one of those is enforced on production's
side and reported on its envelopes, which publish `newTakesUsed` and `maxNewTakes` beside the
disposition. So the crew's answer to "how much of the quota is gone" is production's answer,
read off what it published rather than counted alongside it. A pause is where that leaves the
crew nothing to do: an authorisation is a human's, so the Run ends and the decision is handed
over in the words the envelope used.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .client import Artifact, ProductionClient
from .context import (
    ContextBudget,
    ContextBudgetExceeded,
    ContextSpend,
    context_budget as default_context_budget,
)
from .envelopes import (
    NEEDS_REPAIR,
    PAUSED as PAUSED_BEFORE_NETWORK,
    MalformedEnvelope,
    NextCommand,
    ResultEnvelope,
)
from .planner import (
    AuthoredPlan,
    Finding,
    PlanAuthor,
    author_plan,
    authoring_ask,
    cache_prefix,
    repair_ask,
    repair_plan,
)
from .producer import READ_BACK, read_back_artifacts
from .refusals import Refusal, read_refusal
from .teaching_surface import TeachingSurface, read_teaching_surface

# How a converged Run ended. Four outcomes, and only one of them is a preview. `paused` is
# production's own word for the ending it wrote, kept rather than translated: a paused Run is
# a decision waiting on a human, and calling it `stopped` alongside a crash would put the one
# ending an operator has to act on under the same name as the one they cannot.
#
# It is *defined from* the envelope outcome rather than spelled the same by hand, because these
# are two different questions — how one command answered, and how a whole Run ended — that
# agree on this one word. Written twice they could stop agreeing silently.
RENDERED = "rendered"
BUDGET_EXHAUSTED = "budget_exhausted"
PAUSED = PAUSED_BEFORE_NETWORK
STOPPED = "stopped"

# The budget lines a Run can exhaust, named the way `RepairBudget` names its fields and the way
# the assertion sheets name their limits. Constants rather than literals at the return sites:
# `limit` is read by whoever audits the Run, and a typo in one of five string literals would be
# a Run that ended for a reason nothing else in the repo knows.
VALIDATE_CALLS = "validate_calls"
PLAN_VERSIONS = "plan_versions"
PREFLIGHT_CALLS = "preflight_calls"
POST_RECORD_PLAN_VERSIONS = "post_record_plan_versions"
NEW_TAKES = "new_takes"
# The context lines are `context.py`'s own — `resident_chars` and `fresh_chars` — passed
# through as `limit` rather than restated here, so a Run that ended on one names it the way the
# module that measured it names it.

# The dispositions `run.record` publishes, split by what they cost. The three names are the
# protocol's own enum; the split is `recording.verifiedMatchingTake` — "reuse without quota" —
# which is the sentence that makes `reused` the free one and the other two a provider call.
REUSED = "reused"
DISPATCHED = ("recorded", "replacement_recorded")

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
    validate_calls: int
    preflight_calls: int
    post_record_plan_versions: int


@dataclass(frozen=True, slots=True)
class RecordingQuota:
    """What one `run.record` published: where the quota stands, and which Take it spent on.

    Not a Take. `CONTEXT.md` reserves that word for the recording itself — its `TimedBeat[]`,
    its audio and the alignment both were derived from — and none of those are here; `take_id`
    is a reference to one, not the thing. What is here is production's own `quota`, the name
    the Run checkpoint gives these two numbers on the other side of the boundary.

    All four fields are the envelope's, none of them the crew's. `maxNewTakes` reaches
    production in the request and comes back on every record envelope beside the spend, so a
    crew that tracked the quota in parallel would be keeping a second number to be wrong with
    — the same reason `repair_budget` reads the Brief instead of being told its length.
    """

    disposition: str
    take_id: str
    new_takes_used: int
    max_new_takes: int

    @property
    def dispatched(self) -> bool:
        """Whether binding the Take cost a synthesis dispatch, or reused one already paid for."""
        return self.disposition in DISPATCHED

    @property
    def within_quota(self) -> bool:
        return self.new_takes_used <= self.max_new_takes


def quota_read(envelope: ResultEnvelope) -> RecordingQuota | None:
    """The quota a record envelope published, or None where it published none.

    A paused or failed `run.record` carries `data: null` — there is no Take and no spend to
    read — and every other command publishes no quota at all. Both leave this None rather than
    inventing zeroes, because a zero here would be the crew answering a question production
    declined to answer.
    """
    data = envelope.data
    if envelope.command != "run.record" or not isinstance(data, Mapping):
        return None
    if not {"disposition", "takeId", "newTakesUsed", "maxNewTakes"} <= set(data):
        return None
    return RecordingQuota(
        disposition=str(data["disposition"]),
        take_id=str(data["takeId"]),
        new_takes_used=int(data["newTakesUsed"]),
        max_new_takes=int(data["maxNewTakes"]),
    )


class BriefUnnamed(RuntimeError):
    """A Run whose request does not carry the Brief it answered, asked to name it anyway."""


def spend_of(
    versions: Sequence[AuthoredPlan], withheld: Sequence[AuthoredPlan]
) -> ContextSpend:
    """What a set of authored versions cost to ask for.

    Derived rather than accumulated, for the reason `quota_readings` is: every ask the crew
    made left an `AuthoredPlan` behind, so a running total kept beside them would be a second
    account of the same thing and the one that could disagree. Withheld versions count — the
    model wrote them and they were paid for, which is the rule `limits.plan-versions` is
    already read under.

    A function rather than a `ConvergedRun` property alone, because the loop has to read the
    same number mid-flight, and a gate that computed it a second way would be a gate that could
    allow a turn the finished bundle then reports as an overrun.
    """
    return ContextSpend(tuple(version.ask for version in (*versions, *withheld)))


@dataclass(frozen=True, slots=True)
class ConvergedRun:
    """One Run, from discovery through however many repairs it took, and how it ended."""

    surface: TeachingSurface
    request: Mapping[str, Any]
    run_id: str | None
    outcome: str
    budget: RepairBudget
    context_budget: ContextBudget
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
    def brief(self) -> Mapping[str, Any]:
        """The Brief this Run answered. A Run that cannot name one cannot be audited.

        Refused rather than answered with `{}`, for the reason `_as_plan` refuses: the evidence
        bundle reads this property into a transcript, and an empty Brief written there would be
        the crew recording that it answered one. `productionRequestSchema` requires a Brief, so
        a request that reaches here without one never came back from `run.init`.
        """
        brief = self.request.get("brief")
        if not isinstance(brief, Mapping):
            raise BriefUnnamed(
                f"The Run's request carries {type(brief).__name__}, not the Brief it answered."
            )
        return brief

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

    @property
    def paused(self) -> bool:
        return self.outcome == PAUSED

    @property
    def spend(self) -> ContextSpend:
        """What this Run put in front of a model, derived from the versions it authored."""
        return spend_of(self.versions, self.withheld)

    @property
    def quota_readings(self) -> tuple[RecordingQuota, ...]:
        """Every quota production published across the Run, in the order it published them.

        Derived rather than accumulated. The envelopes are already the record of what the Run
        cost, so a field beside them would be a second account of the same thing and the one
        that could disagree.
        """
        return tuple(
            read for read in (quota_read(item) for item in self.envelopes) if read is not None
        )

    @property
    def dispatches(self) -> int:
        """How many synthesis dispatches this Run spent. On a compliant plan, one."""
        return sum(1 for read in self.quota_readings if read.dispatched)

    @property
    def post_record_versions(self) -> int:
        """How many plan versions were authored after a Take existed.

        Derived from the envelopes for the same reason the quota is: `converge` counts these
        while it runs, and a second count kept beside the envelopes would be the one that could
        disagree. Every withheld version is one of them — nothing is withheld before a Take
        exists — and a submitted one is post-record when the `run.validate` that carried it came
        after the `run.record` that bound the Take.
        """
        bound = next(
            (
                index
                for index, envelope in enumerate(self.envelopes)
                if envelope.command == "run.record" and envelope.succeeded
            ),
            None,
        )
        if bound is None:
            return len(self.withheld)
        return len(self.withheld) + sum(
            1 for envelope in self.envelopes[bound + 1 :] if envelope.command == "run.validate"
        )

    @property
    def quota(self) -> RecordingQuota | None:
        """Where the recording budget stood when production last said."""
        return self.quota_readings[-1] if self.quota_readings else None

    @property
    def decision(self) -> tuple[NextCommand, ...]:
        """What a paused Run is waiting on a human for, in the words production asked in.

        The envelope's `next` already names the command an operator would run and carries the
        reason as its text — budget exhausted, or a replacement grant required — and that
        reason is the only thing separating the two pauses. So surfacing the decision is
        handing those over. A sentence of the crew's own here would be a paraphrase standing
        where the interface's words were, which is the rule `refusals.py` exists to keep.
        """
        refusal = self.refusal
        return refusal.envelope.next if self.paused and refusal is not None else ()

    @property
    def degradations(self) -> tuple[str, ...]:
        """The warnings the finished compile published, in the codes it published them under.

        A preview carrying placeholders is an honest intermediate state, and the compiler says
        so: `ASSET_PLACEHOLDER` is in the checks contract's `warnings` block, so it rides a
        green compile and never reaches the loop as a refusal. Accepting it visibly is the
        difference between that and ignoring it — so the finished Run reports every warning
        its compile report named, and repairs none of them.

        Every warning, not the placeholder alone: a crew reporting only the code it was asked
        about would hide the next one, and the `warnings` block is the whole list of things a
        Run may ship with.
        """
        report = self.artifact("compile_report")
        if report is None:
            return ()
        body = report.json()
        if not isinstance(body, Mapping):
            return ()
        return tuple(
            str(warning.get("code", ""))
            for warning in body.get("warnings") or ()
            if isinstance(warning, Mapping)
        )

    def artifact(self, kind: str) -> Artifact | None:
        return next((item for item in self.artifacts if item.kind == kind), None)


def target_seconds(brief: Mapping[str, Any]) -> int:
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
        return UNSTATED_SECONDS
    low = int(found.group("low"))
    high = int(found.group("high")) if found.group("high") else low
    seconds = (low + high) // 2
    return seconds * 60 if found.group("unit").lower().startswith("minute") else seconds


def repair_budget(seconds: int) -> RepairBudget:
    """The proof harness's own budget rule, at a Brief's length.

    `2 + ceil(seconds / 60)` is `repairCycleBudget`, and the counts around it are the limits the
    assertion sheets hold a Run to: at most `cycles + 2` plan versions and validate calls, at
    most `cycles` Preflight calls, and at most two plan versions after a Take exists. The first
    two are the same number and are still two fields, because they are two assertions and the
    sheet is free to move one without the other.

    Repeating the rule here rather than deriving it is the cost of the crew being a Python
    process that cannot import the sheet it is judged by; a test pins the three Briefs' numbers
    so the two cannot drift silently.
    """
    cycles = 2 + math.ceil(seconds / 60)
    return RepairBudget(
        cycles=cycles,
        plan_versions=cycles + 2,
        validate_calls=cycles + 2,
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
    context_budget: ContextBudget | None = None,
    on_envelope: Callable[[ResultEnvelope], None] | None = None,
    read_back: Sequence[str] = READ_BACK,
) -> ConvergedRun:
    """Discovery, authoring, and one Run driven until it renders or a budget is gone.

    `on_envelope` sees every envelope in the order it arrived, refusals included, so an audit
    trail records what production said across the whole convergence rather than only the pass
    that happened to succeed.

    Two budgets, and both end a Run the same way. `budget` is how many times production may be
    asked; `context` is how much text may be put in front of a model, defaulting to what the
    first allows — a Run budgeted more repair cycles is a Run allowed more turns to send fresh
    text in. Passing the context budget rather than deriving it twice keeps the two in step.

    Nothing raises on a refusal. A Run that ends refused, stopped, paused or out of budget
    comes back with the material that ended it, because that is what an operator has to read —
    and a paused one comes back with the decision it is waiting on them for.
    """
    surface = read_teaching_surface(client, on_envelope)
    brief = request.get("brief", {})
    allowed = budget if budget is not None else repair_budget(target_seconds(brief))
    allowed_context = (
        context_budget
        if context_budget is not None
        else default_context_budget(allowed.plan_versions)
    )

    # Assembled once, here, and read by every turn below. This is the whole of the caching, and
    # it is this process's own: not a store the crew keeps and not a provider's, but the fact
    # that there is one object to send and nothing downstream can build a second. It is still
    # sent in full every turn.
    #
    # The author is asked whether it can review a draft, because the answer belongs in the
    # prefix: instructions that name a tool an author does not hold describe a capability that
    # will never answer. Asked once, here, for the same reason the prefix is built once.
    prefix = cache_prefix(surface, drafts_reviewable=author.reviews_drafts)
    # The first turn priced before it is asked for, through the same reader the loop uses
    # below. Written as a comparison here instead, it would be the budget rule stated twice —
    # and the gate that allowed a turn the finished bundle then reports as an overrun.
    #
    # Refused before a Run is opened, rather than ended as one. A prefix that does not fit is a
    # fact about the crew's own prompt and is true of every turn a Run would take, so there is
    # nothing a Run could be spent to discover — the same argument `InstructionsLeaked` is
    # raised on, and the same place in the sequence.
    priced = ContextSpend((authoring_ask(prefix, brief),))
    unaffordable = priced.overrun(allowed_context)
    if unaffordable is not None:
        raise ContextBudgetExceeded(
            f"The first ask does not fit this Run's context budget ({unaffordable}): "
            f"{priced.resident_chars} characters of instructions against "
            f"{allowed_context.resident_chars}, and {priced.fresh_chars} of Brief against "
            f"{allowed_context.fresh_chars}. Nothing was asked."
        )

    announce = on_envelope if on_envelope is not None else lambda _: None
    envelopes: list[ResultEnvelope] = []
    versions: list[AuthoredPlan] = [author_plan(prefix, brief, author)]
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

    def ended(outcome: str, run: str | None, limit: str | None = None) -> ConvergedRun:
        """The Run, with what it published read back, however it ended.

        The read-back is the producer's own rule — by descriptor, through the client, latest
        publisher of a kind wins — and it runs on all four endings rather than on the preview
        alone. A Run that paused after Preflight is holding a report production wrote for it,
        and an ending that dropped it would leave an audit empty for exactly the outcomes an
        operator has to act on. Which artifacts exist is then the Run's answer rather than the
        ending's: a Run that never compiled has no compile report and says so by not carrying
        one.

        Nothing is caught here. A descriptor that cannot be read back or does not hash to what
        it claimed is a defect on every path, and a failure path that quietly tolerated one
        would be the path where it went unnoticed.
        """
        return ConvergedRun(
            surface=surface,
            request=request,
            run_id=run,
            outcome=outcome,
            budget=allowed,
            context_budget=allowed_context,
            versions=tuple(versions),
            submitted=tuple(submitted),
            withheld=tuple(withheld),
            refusals=tuple(refusals),
            envelopes=tuple(envelopes),
            artifacts=(
                read_back_artifacts(client, run, envelopes, read_back) if run is not None else ()
            ),
            limit=limit,
        )

    opened = step(client.init(request))
    if not opened.succeeded:
        refusals.append(read_refusal(client, None, opened, surface))
        return ended(STOPPED, None)
    if opened.run is None:
        raise MalformedEnvelope("run init succeeded and named no Run.")
    run_id = opened.run.id

    def gather(envelope: ResultEnvelope, *, advisory: bool = False) -> Refusal:
        """Everything production published about one envelope, read back through the client.

        Bound to the Run rather than handed the same three arguments nine times: the client,
        the Run id and the surface do not change across a convergence, and only the envelope
        does. The one refusal that cannot use this is the one before a Run exists.
        """
        return read_refusal(client, run_id, envelope, surface, advisory=advisory)

    def stopped_at(envelope: ResultEnvelope) -> ConvergedRun:
        """The Run ends holding what production last said, which is what an operator reads."""
        refusals.append(gather(envelope))
        return ended(STOPPED, run_id)

    def repaired_against(refusal: Refusal) -> ConvergedRun | None:
        """Asks for a repair, and keeps asking while one arrives that would cost the Take.

        Returns the ended Run where a budget line ran out, or None once a usable repair is in
        hand. A withheld repair is still charged: the model wrote a version, and the sheets
        count what was authored rather than what survived the crew's reading. That is also what
        makes this terminate — before a Take nothing can be withheld, and after one every ask
        moves the budget whether or not the answer was submitted.

        Both counts are read against `plan_versions` for that same reason. `limits.plan-versions`
        counts versions the model authored, so one the crew read and declined to submit has
        already been paid for; a gate over `versions` alone would let every withheld repair buy
        one more ask than the sheet allows.
        """
        nonlocal after_take
        refusals.append(refusal)
        while True:
            if len(versions) + len(withheld) >= allowed.plan_versions:
                return ended(BUDGET_EXHAUSTED, run_id, PLAN_VERSIONS)
            if recorded is not None and after_take >= allowed.post_record_plan_versions:
                return ended(BUDGET_EXHAUSTED, run_id, POST_RECORD_PLAN_VERSIONS)
            # What the Run has spent, plus what the next turn *will* cost, read before it is
            # asked for. Every term of a repair is known in advance — the refusal is gathered
            # and the plan is written — so the turn that would cross the line is the turn that
            # is refused, rather than the one after it. A budget consulted once the money is
            # gone is a report, not a budget.
            spent = spend_of(versions, withheld)
            next_ask = repair_ask(prefix, brief, versions[-1].plan, refusal)
            passed = ContextSpend((*spent.asks, next_ask)).overrun(allowed_context)
            if passed is not None:
                return ended(BUDGET_EXHAUSTED, run_id, passed)
            proposed = repair_plan(prefix, brief, versions[-1].plan, refusal, author)
            if recorded is not None:
                after_take += 1
            if recorded is None or take_preserved(recorded, proposed.plan):
                versions.append(proposed)
                return None
            withheld.append(proposed)

    while True:
        if validates >= allowed.validate_calls:
            return ended(BUDGET_EXHAUSTED, run_id, VALIDATE_CALLS)
        plan = versions[-1].plan
        validated = step(client.validate(run_id, plan))
        validates += 1
        submitted.append(plan)
        if validated.outcome == NEEDS_REPAIR:
            exhausted = repaired_against(gather(validated))
            if exhausted is not None:
                return exhausted
            continue
        if not validated.succeeded:
            return stopped_at(validated)

        if preflights >= allowed.preflight_calls:
            return ended(BUDGET_EXHAUSTED, run_id, PREFLIGHT_CALLS)
        preflighted = step(client.preflight(run_id))
        preflights += 1
        if not preflighted.succeeded:
            return stopped_at(preflighted)
        advisory = gather(preflighted, advisory=True)
        if advisory.report is not None and preflight_risks(advisory.report):
            exhausted = repaired_against(advisory)
            if exhausted is not None:
                return exhausted
            continue

        # No `replacement_authorisation`, ever. The protocol publishes `identicalInputRedispatch:
        # replacement grant required`, and a grant is an operator's signature over a recording
        # input. The crew holds none, so its whole side of that rule is that this call has one
        # argument — which is stronger than deciding each time whether to send one.
        took = step(client.record(run_id))
        if took.outcome == PAUSED_BEFORE_NETWORK:
            # The Run is the operator's now. Production pauses before the network for exactly
            # two reasons — the budget is gone, or an identical input needs a grant — and both
            # are authorisations the crew may not give itself. It stops holding everything
            # production said, and `decision` hands over the command and the reason it named.
            refusals.append(gather(took))
            return ended(PAUSED, run_id)
        if not took.succeeded:
            return stopped_at(took)
        bound = quota_read(took)
        if bound is not None and (
            not bound.within_quota or (bound.dispatched and recorded is not None)
        ):
            # The backstop under take-preserving repair, at the one place two independently
            # derived rules have to agree. Nothing should reach it: a repair that would stale
            # the Take is withheld above, and the interface enforces `maxNewTakes` on its own
            # side. A dispatch arriving where a rebinding was expected — or a spend past the
            # cap production itself named — means those two rules have parted company and a
            # Take was bought that nothing intended. Carrying on would mean converging inside
            # a quota the crew can no longer account for, so the Run ends with the line named.
            return ended(BUDGET_EXHAUSTED, run_id, NEW_TAKES)
        recorded = plan

        compiled = step(client.compile(run_id))
        if compiled.outcome == NEEDS_REPAIR:
            exhausted = repaired_against(gather(compiled))
            if exhausted is not None:
                return exhausted
            continue
        if not compiled.succeeded:
            return stopped_at(compiled)

        rendered = step(client.render(run_id))
        if not rendered.succeeded:
            return stopped_at(rendered)

        return ended(RENDERED, run_id)
