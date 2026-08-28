"""What a Run leaves behind, so that it can be read long after the crew has gone.

A crew Run and a scripted proof run are the same claim made two ways, so this writes the same
kind of bundle: `commands.jsonl` in issue order, `agent-transcript.jsonl` beside it, the Run's
artifacts, an assertion evaluation and a hash index over the lot. The names are the proof
bundles' names and they mean what they mean there. Inventing a second vocabulary for the same
thing would make the two unreadable side by side, which is the one thing the ticket asks for.

Four decisions are load-bearing.

**Assembling is separate from writing, and only writing knows a directory exists.** `assemble`
takes a `ConvergedRun` and returns bytes keyed by the name each one goes under; `write_bundle`
takes those bytes and a root it was handed. ADR-0015's rule is that the crew never learns where
production put a Run — and it does not here: every artifact in the bundle arrived through
`fetch_artifact`, by the descriptor an envelope published. Where the *evidence* goes is a
different question, because the work root is the crew's own disk in both topologies while the
Run's disk is only the crew's today. So the seam sits between the value and the directory, and
the caller supplies the directory.

**The ordered spine is `commands.jsonl`, and everything else hangs off it by digest.** A
`ConvergedRun` records which versions were authored and which refusals arrived, but not which
refusal a withheld version answered — that interleaving is not kept, and a transcript that
implied it would be evidence of something nobody observed. So the transcript groups by kind and
anchors each refusal to the envelope's digest, which is what makes the order recoverable from
the file that does keep it.

**Instructions go in by digest, not by body.** They are the preamble and then the contracts,
and the contracts are already in the bundle verbatim — `commands.jsonl` carries the discovery
envelopes whole. Writing them again, once per authored version, would make the largest thing in
the bundle its most repeated one, and a digest is what a reader needs to prove which text an
author was given.

**An assertion the Run could not measure says so.** The sheet's third outcome exists because a
run that measures nothing must not pass; `not-evidenced` is what a paused Run reports for the
compile it never reached. The crew evaluates the assertions it observed and no others: the
scenario families are the harness's, the media and isolation families are measured by
instruments the crew does not hold, and ticket 12 scores the whole sheet from the harness side.
That the two agree is what ticket 12 checks; nothing here can check it, because the sheet is
TypeScript and this is a Python process — the same trade `repair_budget` took, taken again with
its eyes open.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any

from .context import tokens
from .converge import MARGIN_CLEAR, RENDERED, ConvergedRun
from .teaching_surface import TeachingSurface
from .planner import scan_for_leaks

# The files a bundle carries, under the names the proof bundles carry them under.
SUMMARY = "SUMMARY.md"
ENVIRONMENT = "environment.json"
COMMANDS = "commands.jsonl"
TRANSCRIPT = "agent-transcript.jsonl"
ASSERTIONS = "assertions.json"
HASH_INDEX = "hash-index.json"
ARTIFACTS = "artifacts"

# The three outcomes an assertion can have, and the aggregate rule over them. `not-evidenced` is
# not a pass and not a failure: nothing was found wrong and nothing was shown right.
PASS = "pass"
FAIL = "fail"
NOT_EVIDENCED = "not-evidenced"

# Who wrote a transcript record. `production` is used for the material production published and
# the crew only gathered, which is the distinction the whole crew is built on.
CREW = "vox-crew"
PRODUCTION = "production"
SYSTEM = "system"

# What the assertion sheet expects a Run to have discovered. Restated here rather than derived
# from what this Run happened to read, because an expectation taken from the observation is not
# an expectation.
CATEGORIES = ("catalog", "checks", "language", "plan", "protocol")

# The two structural facts that put a prefix cache out of reach, held in one sentence because
# the bundle publishes them twice — once as `prefixCache.reason` and once in the non-claims. Two
# copies of a fact are two things to keep in step, and the drift would be silent: everything that
# says why the number is not a saving reads this.
NO_CACHE_BECAUSE = (
    "A fresh session is opened for every ask, and a context cache begins on a session's "
    "second turn at the earliest, so no turn of this Run could be served from one."
)


def prefix_cache() -> dict[str, Any]:
    """Why a prefix cache is out of reach, published beside the number.

    An operator meets `repeatedPrefixChars` in the bundle and nowhere else, and a bundle that
    left the reason at the code would leave them to infer one — the inference being "eligible,
    not yet confirmed", which is the reading this whole field exists to stop. `reachable` is
    false rather than null because this is structural: it follows from the session model, so the
    crew can assert it without an instrument. The rejection of session reuse travels with it so
    that a later reader does not read the false as a defect and clear it by changing the session
    model.

    Built per call rather than held as a module constant: `assemble` is documented pure, and a
    dict handed out by reference is process state that one caller could edit from under the next.
    """
    return {
        "reachable": False,
        "reason": (
            f"{NO_CACHE_BECAUSE} Reusing one session across a Run is what would put a cache in "
            "reach, and it is rejected: rebuilding the whole prompt each turn is what keeps the "
            "prefix identical and successive measurements comparable. Recorded as ADR-0017."
        ),
    }

# What a crew bundle does not evidence, in the sheet's own family names. Stated rather than
# omitted: a reader who cannot tell "not claimed" from "not written down" has to assume the
# generous reading, and review decision 1 exists to stop exactly that.
NON_CLAIMS = (
    "Isolation is not evidenced. The crew process is not sandboxed in this phase, so "
    "code-blindness is convention here and not enforcement.",
    "The media families are not evidenced. Nothing here inspects the preview's streams; the "
    "preview is carried by descriptor and judged elsewhere.",
    "The scenario families are not evaluated. A scenario is the harness's concept and the crew "
    "holds a Brief, so scoring one here would be the crew judging itself against a sheet it "
    "cannot read.",
    "There is no human verdict. A crew bundle is machine evidence and the watch-and-listen "
    "verdict is a person's, recorded where the proofs record it.",
    "No prefix cache is claimed, and none is reachable. Every turn was authored against one "
    "identical prefix, which is a comparability property and not a saving: the whole prefix is "
    "transmitted every turn, and `context.repeatedPrefixChars` counts what the turns after the "
    f"first spent repeating it. {NO_CACHE_BECAUSE} `context.prefixCache.reachable` is false for "
    "that reason and not for want of an instrument.",
)


class BundleInvalid(RuntimeError):
    """A bundle that does not hold together. Raised with the proofs' own code for the failure."""


class EvidenceLeaked(RuntimeError):
    """The crew was about to write repository knowledge into its own work root.

    Refused rather than sanitised, for the reason `InstructionsLeaked` is: a bundle that had a
    marker quietly removed would pass the scan and be the wrong bundle. This one fires late —
    at the end of a Run rather than before a prompt — which is why it names what it found.
    """


@dataclass(frozen=True, slots=True)
class EvidenceBundle:
    """A bundle as bytes, keyed by the name each file goes under, with the verdict it derived."""

    files: Mapping[str, bytes]
    verdict: str


def machine_verdict(assertions: Sequence[Mapping[str, Any]]) -> str:
    """The worst outcome present, with `fail` above `not-evidenced`.

    An empty sheet is a failure, because a sheet that asserts nothing has proved nothing. The
    rule is the sheet's own and is written out here for the same reason `repair_budget` is.
    """
    outcomes = {str(assertion.get("outcome")) for assertion in assertions}
    if not assertions or FAIL in outcomes:
        return FAIL
    return NOT_EVIDENCED if NOT_EVIDENCED in outcomes else PASS


def assemble(run: ConvergedRun, *, executed_at: str | None = None) -> EvidenceBundle:
    """Everything one Run leaves behind, as the bytes it leaves behind.

    It holds no client, opens nothing and joins no path. Every artifact it carries was already
    fetched by descriptor before it got here, which is what makes "captured by retrieval, never
    by scanning" a property of the Run rather than a promise of this module.

    The one thing it does not read off the Run is the clock: `executed_at` defaults to now, so
    two calls on one Run differ in that field alone. Pass it to get the same bytes twice.
    """
    commands = _commands(run)
    transcript = _transcript(run)
    assertions = _assertions(run, commands=commands, transcript=transcript)
    verdict = machine_verdict(assertions)

    authored = {
        ENVIRONMENT: _json(_environment(run, executed_at)),
        COMMANDS: _json_lines(commands),
        TRANSCRIPT: _json_lines(transcript),
        ASSERTIONS: _json({"machineVerdict": verdict, "assertions": assertions}),
        SUMMARY: _summary(run, verdict).encode("utf-8"),
    }
    _refuse_if_leaked(authored)

    files = {
        **authored,
        **{f"{ARTIFACTS}/{artifact.kind}": artifact.data for artifact in run.artifacts},
    }
    return EvidenceBundle(files={**files, HASH_INDEX: _json(_index(files))}, verdict=verdict)


def verify(files: Mapping[str, bytes]) -> str:
    """Reads a bundle back and answers whether it still says what it said.

    Nothing is trusted that can be re-derived: the digests are recomputed, the verdict is
    re-derived from the assertions that are supposed to support it, and every assertion's
    evidence is looked for among the files actually present. What survives all three is a
    bundle an auditor can read without the crew, the client or the Run being anywhere.

    The failure codes are the proofs' own. The same defect in a crew bundle and in a proof
    bundle is the same defect, and it should not have two names.
    """
    index = _document(files, HASH_INDEX)
    carried = {name: data for name, data in files.items() if name != HASH_INDEX}
    if sorted(index) != sorted(carried):
        raise BundleInvalid("PROOF_HASH_INDEX_INCOMPLETE")
    for name, data in carried.items():
        if index[name] != sha256(data).hexdigest():
            raise BundleInvalid(f"PROOF_HASH_MISMATCH:{name}")

    assertions = _document(files, ASSERTIONS)
    listed = assertions.get("assertions")
    if not isinstance(listed, list) or not listed:
        raise BundleInvalid("PROOF_ASSERTIONS_ABSENT")
    for assertion in listed:
        evidence = assertion.get("evidence")
        if (
            not assertion.get("id")
            or not isinstance(evidence, list)
            or not evidence
            or not isinstance(assertion.get("pass"), bool)
            or assertion.get("outcome") not in (PASS, FAIL, NOT_EVIDENCED)
            or assertion["pass"] != (assertion["outcome"] == PASS)
        ):
            raise BundleInvalid("PROOF_ASSERTION_MALFORMED")
        for name in evidence:
            if name not in files:
                raise BundleInvalid(
                    f"PROOF_ASSERTION_EVIDENCE_MISSING:{assertion['id']}:{name}"
                )

    derived = machine_verdict(listed)
    if assertions.get("machineVerdict") != derived:
        raise BundleInvalid("PROOF_MACHINE_VERDICT_MISMATCH")
    if not files.get(SUMMARY, b"").strip():
        raise BundleInvalid("PROOF_SUMMARY_ABSENT")
    return derived


# -- the crew's own material, assembled ------------------------------------------------------


def _commands(run: ConvergedRun) -> list[dict[str, Any]]:
    """Every envelope the crew received, in arrival order, with the bytes production wrote.

    Discovery first. A crew Run begins before its Run does — the contract index and the five
    projections are commands production answered, and they are the ones that decide what the
    plan was authored against. `ConvergedRun.envelopes` starts at `run.init` because that is
    where the loop starts; the surface kept the rest, so the two together are the whole trail
    and neither is a copy of the other.

    The command and the outcome are lifted out beside the envelope the way the proof bundles
    lift `argv` and `exitCode` out beside the stdout they came from — the file reads as a
    sequence without re-parsing every line, and nothing in it has to be believed, because the
    envelope is right there whole.
    """
    return [
        {
            "ordinal": ordinal,
            "actor": PRODUCTION,
            "command": envelope.command,
            "outcome": envelope.outcome,
            "sha256": _digest(envelope.raw),
            "envelope": envelope.raw,
        }
        for ordinal, envelope in enumerate(
            (*run.surface.envelopes, *run.envelopes), start=1
        )
    ]


def _transcript(run: ConvergedRun) -> list[dict[str, Any]]:
    """The Brief, every plan version authored, every refusal gathered, and how it ended."""
    records: list[dict[str, Any]] = [{"actor": SYSTEM, "kind": "task", "brief": dict(run.brief)}]
    pointing = _pointing_actions(run.surface)
    submitted = [(version, "submitted") for version in run.versions]
    withheld = [(version, "withheld") for version in run.withheld]
    for number, (version, disposition) in enumerate(submitted + withheld, start=1):
        records.append(
            {
                "actor": CREW,
                "kind": "plan",
                "version": number,
                "disposition": disposition,
                "sha256": _digest(_compact(version.plan)),
                "instructionsSha256": _digest(version.instructions),
                "plan": version.plan,
                "findings": [
                    {
                        "code": finding.code,
                        "where": finding.where,
                        "detail": finding.detail,
                        "means": finding.means,
                        "repair": finding.repair,
                    }
                    for finding in version.findings
                ],
                "deixis": _deixis(version.plan, pointing),
                "reviewCalls": version.review_calls,
                "reviewedWhileDrafting": list(version.reviewed),
            }
        )
    for refusal in run.refusals:
        records.append(
            {
                "actor": PRODUCTION,
                "kind": "refusal",
                "command": refusal.envelope.command,
                "outcome": refusal.outcome,
                "advisory": refusal.advisory,
                "envelopeSha256": _digest(refusal.envelope.raw),
                "codes": list(refusal.codes),
                "report": refusal.report,
            }
        )
    records.append(
        {
            "actor": CREW,
            "kind": "terminal",
            "outcome": run.outcome,
            "limit": run.limit,
            "degradations": list(run.degradations),
            "decision": [
                {"command": command.command, "args": list(command.args), "reason": command.reason}
                for command in run.decision
            ],
        }
    )
    return [{"ordinal": ordinal, **record} for ordinal, record in enumerate(records, start=1)]


def _pointing_actions(surface: TeachingSurface) -> dict[str, set[str]]:
    """Which actions each capability publishes as pointing gestures, read from the catalog.

    Read rather than listed, for the reason the rule itself reads it: a capability that ships a
    new deictic action is counted on the day it lands, and a hand-kept list here would be the
    copy that goes stale while looking right.
    """
    catalog = surface.contract("catalog")
    return {
        str(capability["id"]): {
            str(action["id"])
            for action in capability.get("actions", ())
            if isinstance(action, Mapping) and "id" in action and action.get("deicticFields")
        }
        for capability in catalog.get("capabilities", ())
        if isinstance(capability, Mapping) and "id" in capability
    }


def _deixis(plan: Mapping[str, Any], pointing: Mapping[str, set[str]]) -> dict[str, int]:
    """Whether the author pointed at anything, as numbers rather than as a plan to open.

    "Did this Run's author reach for the word anchor" is the question the whole deixis effort
    turns on, and before this it was answerable only by reading every event of every scene. A
    reader comparing two Runs had to do it twice. These counts make the comparison a
    subtraction, which is what a before-and-after measurement over fixture Runs needs.

    `wordAnchors` counts events cut on a spoken word and `boundaryAnchors` those cut on a beat
    edge, so the two sum to the events the plan placed. `pointingEvents` is the narrower count
    that matters: events using an action the catalog declares deictic. It is deliberately not
    the same number as `wordAnchors`, and the gap between them is itself a finding — an author
    may write a word anchor on a verb that points at nothing, which is legal and is not the
    gesture.

    `scenesThatPointed` is counted per scene rather than per event because the rule that asks
    for the gesture is satisfied by one: a scene that points once is done, and counting events
    would make a chart with four highlights look four times better than one with a single
    well-chosen one.
    """
    word = 0
    boundary = 0
    pointing_events = 0
    scenes = 0
    pointed = 0

    for section in plan.get("sections", ()) or ():
        if not isinstance(section, Mapping):
            continue
        for scene in section.get("scenes", ()) or ():
            if not isinstance(scene, Mapping):
                continue
            scenes += 1
            deictic = pointing.get(str(scene.get("component", "")), set())
            here = 0
            for event in scene.get("events", ()) or ():
                if not isinstance(event, Mapping):
                    continue
                at = event.get("at")
                if isinstance(at, str):
                    if ".word:" in at:
                        word += 1
                    else:
                        boundary += 1
                if str(event.get("action", "")) in deictic:
                    here += 1
            pointing_events += here
            pointed += 1 if here else 0

    return {
        "scenes": scenes,
        "wordAnchors": word,
        "boundaryAnchors": boundary,
        "pointingEvents": pointing_events,
        "scenesThatPointed": pointed,
    }


def _context(run: ConvergedRun) -> dict[str, Any]:
    """What the Run put in front of a model, and what the budget allowed it to.

    Characters are the measurement and tokens are the conversion, both reported: the crew can
    count the first exactly on every Run and the second is what a model is billed in, so a
    bundle carrying only one of them would either be unauditable or be an estimate presented
    as a count.

    `distinctChars` is what actually reached a model — every turn's prompt in full, and the only
    one of the three that totals what was transmitted. `sentChars` is the counterfactual beside
    it: the same Run priced with the identical prefix charged once, which is not what happened.
    It is published so that `repeatedPrefixChars` — the difference, and the prefix the turns
    after the first really did re-send — can be read against something. None of them is a
    saving, and `prefixCache` says why one is not available to be had — a
    reader who meets a null here reads "not confirmed yet" and goes looking for the confirmation,
    which is a search with no end, so the block states the structural fact instead.

    `asks` and `modelCalls` differ when an author held a tool: one ask, answered over several
    calls, each re-sending the prefix. Both are published because `distinctChars` is otherwise
    unreadable — a reader seeing one ask against three prefixes would have no way to tell a
    tool-using turn from an accounting fault, and would be right to suspect the second.
    """
    spend = run.spend
    return {
        "asks": spend.asks_made,
        "modelCalls": spend.model_calls,
        "onePrefix": spend.one_prefix,
        "residentChars": spend.resident_chars,
        "freshChars": spend.fresh_chars,
        "returnedChars": spend.returned_chars,
        "distinctChars": spend.distinct_chars,
        "distinctTokens": tokens(spend.distinct_chars),
        "sentChars": spend.sent_chars,
        "sentTokens": tokens(spend.sent_chars),
        "repeatedPrefixChars": spend.repeated_prefix_chars,
        "prefixCache": prefix_cache(),
        "budget": {
            "residentChars": run.context_budget.resident_chars,
            "freshChars": run.context_budget.fresh_chars,
            "modelCalls": run.context_budget.model_calls,
        },
        "overrun": spend.overrun(run.context_budget),
    }


def _environment(run: ConvergedRun, executed_at: str | None) -> dict[str, Any]:
    """What the Run was, and what it did not measure about itself.

    `sandboxEvidence: null` is the settled answer rather than an omission — review decision 1
    took it deliberately, and a bundle that left the field out would read as a bundle that
    forgot to ask.
    """
    quota = run.quota
    return {
        "executedAt": executed_at or datetime.now(timezone.utc).isoformat(),
        "agent": CREW,
        "runId": run.run_id,
        "briefId": run.brief.get("id"),
        "outcome": run.outcome,
        "limit": run.limit,
        "contractCategories": list(run.surface.categories),
        "budget": {
            "cycles": run.budget.cycles,
            "planVersions": run.budget.plan_versions,
            "validateCalls": run.budget.validate_calls,
            "preflightCalls": run.budget.preflight_calls,
            "postRecordPlanVersions": run.budget.post_record_plan_versions,
        },
        "context": _context(run),
        "quota": (
            None
            if quota is None
            else {
                "disposition": quota.disposition,
                "takeId": quota.take_id,
                "newTakesUsed": quota.new_takes_used,
                "maxNewTakes": quota.max_new_takes,
            }
        ),
        "degradations": list(run.degradations),
        "sandboxEvidence": None,
        "claimEligible": False,
        "claimIneligibleReason": "crew_isolation_not_evidenced",
    }


def _summary(run: ConvergedRun, verdict: str) -> str:
    """The page a person opens first, and the non-claims they have to read before believing it.

    A paused Run gets the decision it is waiting on, in production's own words — the command it
    named and the reason it gave — because that is the whole difference between a pause and a
    stop, and an operator reading this is the one who has to act on it.
    """
    ended = f"{run.outcome}{f' ({run.limit})' if run.limit else ''}"
    sections = [
        f"# Crew run {run.run_id} evidence\n",
        f"- Run: {run.run_id}\n"
        f"- Brief: {run.brief.get('id')}\n"
        f"- Outcome: {ended}\n"
        f"- Machine verdict: {verdict}\n"
        f"- Plan versions authored: {len(run.versions) + len(run.withheld)} "
        f"({len(run.withheld)} withheld)\n"
        f"- Synthesis dispatches: {run.dispatches}\n"
        f"- Context: {run.spend.as_sentence()}\n",
    ]
    if run.decision:
        sections.append(
            "## Waiting on a human\n\n"
            + "".join(f"- `{item.command}` — {item.reason}\n" for item in run.decision)
        )
    sections.append(
        "## Explicit non-claims\n\n" + "".join(f"- {claim}\n" for claim in NON_CLAIMS)
    )
    return "\n".join(sections)


# -- the assertions the crew observed ---------------------------------------------------------


def _assertions(
    run: ConvergedRun,
    *,
    commands: Sequence[Mapping[str, Any]],
    transcript: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """The sheet's assertions, over what this Run actually observed.

    Only those. An assertion the crew has no instrument for is left to the harness rather than
    answered from a fallback — that fallback is the exact defect the sheet's third outcome was
    added to stop, and it would be worse coming from the party being judged.
    """
    budget = run.budget
    compile_report = _body(run, "compile_report")
    preflight_report = _body(run, "preflight_report")
    quota = run.quota
    compiled = [f"{ARTIFACTS}/compile_report"]
    preflighted = [f"{ARTIFACTS}/preflight_report"]

    items = [
        _item(
            "contracts.all-categories",
            list(CATEGORIES),
            sorted(run.surface.categories),
            [COMMANDS],
        ),
        _item(
            "limits.plan-versions",
            f"<={budget.plan_versions}",
            len(run.versions) + len(run.withheld),
            [TRANSCRIPT],
            _between(1, budget.plan_versions),
        ),
        _item(
            "limits.validate-calls",
            f"<={budget.validate_calls}",
            _called(run, "run.validate"),
            [COMMANDS],
            _between(1, budget.validate_calls),
        ),
        _item(
            "limits.preflight-calls",
            f"<={budget.preflight_calls}",
            _called(run, "run.preflight"),
            [COMMANDS],
            _between(1, budget.preflight_calls),
        ),
        _item(
            "limits.post-record-plan-versions",
            f"<={budget.post_record_plan_versions}",
            run.post_record_versions,
            [TRANSCRIPT],
            _between(0, budget.post_record_plan_versions),
        ),
        _item("network.one-provider-dispatch", 1, run.dispatches, [COMMANDS]),
        (
            _item("record.one-take-used", 1, quota.new_takes_used, [COMMANDS])
            if quota is not None
            else _unmeasured("record.one-take-used", 1, [COMMANDS])
        ),
        _item("run.rendered", RENDERED, _stage(run), [COMMANDS]),
    ]
    if compile_report is None:
        items += [
            _unmeasured("compile.green", True, [COMMANDS]),
            _unmeasured("compile.zero-errors", 0, [COMMANDS]),
        ]
    else:
        items += [
            _item("compile.green", True, compile_report.get("ok") is True, compiled),
            _item(
                "compile.zero-errors", 0, len(compile_report.get("errors") or ()), compiled
            ),
        ]
    if preflight_report is None:
        items += [
            _unmeasured("preflight.advisory-wording", True, [COMMANDS]),
            _unmeasured("preflight.minimum-risk-cleared", True, [COMMANDS]),
        ]
    else:
        items += [
            _item(
                "preflight.advisory-wording", True, _advisory(preflight_report), preflighted
            ),
            _item(
                "preflight.minimum-risk-cleared",
                True,
                _minimum_cleared(preflight_report),
                preflighted,
            ),
        ]
    return items + [
        _item("evidence.agent-transcript", ">0", len(transcript), [TRANSCRIPT], _above_zero),
        _item("evidence.command-transcript", ">0", len(commands), [COMMANDS], _above_zero),
    ]


def _item(
    name: str,
    expected: Any,
    observed: Any,
    evidence: Sequence[str],
    predicate: Callable[[Any], bool] | None = None,
) -> dict[str, Any]:
    """One assertion, evaluated. `pass` and `outcome` are two views of one answer."""
    passed = predicate(observed) if predicate is not None else observed == expected
    return {
        "id": name,
        "expected": expected,
        "observed": observed,
        "outcome": PASS if passed else FAIL,
        "pass": passed,
        "evidence": list(evidence),
    }


def _unmeasured(name: str, expected: Any, evidence: Sequence[str]) -> dict[str, Any]:
    """An assertion this Run had no material for, written down as the word rather than a gap.

    The evidence named is `commands.jsonl` rather than the artifact that is missing, and it is
    real evidence rather than a placeholder: the command log is what shows the Run never reached
    the stage that would have published the report, which is the whole claim being made. Naming
    the absent artifact instead would point an auditor at a file the bundle does not carry, and
    both this and the proofs' verifier require every named file to be present.
    """
    return {
        "id": name,
        "expected": expected,
        "observed": NOT_EVIDENCED,
        "outcome": NOT_EVIDENCED,
        "pass": False,
        "evidence": list(evidence),
    }


def _between(low: int, high: int) -> Callable[[Any], bool]:
    return lambda value: isinstance(value, int) and low <= value <= high


def _above_zero(value: Any) -> bool:
    return isinstance(value, int) and value > 0


def _called(run: ConvergedRun, command: str) -> int:
    return sum(1 for envelope in run.envelopes if envelope.command == command)


def _stage(run: ConvergedRun) -> str | None:
    """The stage production last said the Run was at, which is how far it actually got."""
    return next(
        (
            envelope.run.stage
            for envelope in reversed(run.envelopes)
            if envelope.run is not None
        ),
        None,
    )


def _body(run: ConvergedRun, kind: str) -> Mapping[str, Any] | None:
    artifact = run.artifact(kind)
    if artifact is None:
        return None
    body = artifact.json()
    return body if isinstance(body, Mapping) else None


def _advisory(report: Mapping[str, Any]) -> bool:
    """Preflight saying what it is. The compiler is the only authority on physical time."""
    return report.get("authority") == "advisory" and any(
        "advisory" in str(limitation) for limitation in report.get("limitations") or ()
    )


def _minimum_cleared(report: Mapping[str, Any]) -> bool:
    """Every scene clear of its *minimum* across the whole estimate range.

    The recommended threshold deliberately does not count here either: missing it is a pacing
    warning a plan may ship with, and the sheet scores the minimum for the same reason
    `preflight_risks` repairs on it.
    """
    scenes = (report.get("duration") or {}).get("scenes") or ()
    return bool(scenes) and all(
        isinstance(scene, Mapping)
        and (scene.get("minimum") or {}).get("assessment") == MARGIN_CLEAR
        for scene in scenes
    )


# -- bytes, digests, and the one thing that reads a leak ---------------------------------------


def _digest(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()


def _compact(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def _json(value: Any) -> bytes:
    """A JSON file, framed the way the proof bundles frame theirs: indented, one trailing line."""
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def _json_lines(values: Sequence[Any]) -> bytes:
    return ("".join(f"{_compact(value)}\n" for value in values)).encode("utf-8")


def _document(files: Mapping[str, bytes], name: str) -> Mapping[str, Any]:
    try:
        parsed = json.loads(files[name].decode("utf-8"))
    except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as unreadable:
        raise BundleInvalid(f"PROOF_BUNDLE_UNREADABLE:{name}") from unreadable
    if not isinstance(parsed, Mapping):
        raise BundleInvalid(f"PROOF_BUNDLE_UNREADABLE:{name}")
    return parsed


def _index(files: Mapping[str, bytes]) -> dict[str, str]:
    return {name: sha256(files[name]).hexdigest() for name in sorted(files)}


def _refuse_if_leaked(authored: Mapping[str, bytes]) -> None:
    """Scans what the crew wrote, before it is written where the proofs' scan will read it.

    The bundle lands in the work root, and the leak scan there reads every file it finds — so a
    marker in a transcript would fail `leaks.agent-readable-files` at the end of a paid Run,
    after the money and too late to do anything about. The full scan applies rather than the
    marker-only one: a transcript is assembled from the crew's own repository-side material,
    which is exactly the material `scan_for_leaks` guards.

    The artifacts are not scanned. They are production's bytes, read back by descriptor, and
    they already sit in the Run the proofs scan them in; scanning the copy would be the crew
    auditing production rather than itself.
    """
    for name, data in authored.items():
        scan = scan_for_leaks(data.decode("utf-8"))
        if not scan.ok:
            raise EvidenceLeaked(f"{name} would leak: {', '.join(scan.violations)}")


# -- everything below here is the part that knows a directory exists ---------------------------


def write_bundle(root: Path | str, bundle: EvidenceBundle) -> None:
    """Writes a bundle under a root the caller chose, and refuses to write anywhere else.

    The crew does not compute this root. It is the work root's, an operator's or a driver's,
    and everything this function knows about it is that the bundle goes inside it — which is
    the whole of "evidence is written inside the work root and nowhere else" that belongs to
    code rather than to the caller.

    An occupied root is refused rather than merged into. The proofs copy a staged bundle with
    `errorOnExist`, and for the same reason: evidence that can be written over one file at a
    time is a directory whose hash index and whose contents came from two different Runs.

    Every name is resolved and checked before anything is written, so a bundle that would have
    escaped leaves nothing behind at all. A root that is itself a link is refused before that:
    resolving one would move the whole bundle to wherever it points while every name still sat
    correctly inside the resolved base, which is the one way left to write outside the work root.
    """
    given = Path(root)
    if given.is_symlink():
        raise BundleInvalid(f"{given.name!r} is a link, and evidence is not written through one.")
    base = given.resolve()
    if any(base.rglob("*")):
        raise BundleInvalid(f"{base.name!r} already holds a bundle, and evidence is not merged.")
    targets: dict[Path, bytes] = {}
    for name, data in bundle.files.items():
        target = (base / name).resolve()
        if base not in target.parents:
            raise BundleInvalid(f"{name!r} would be written outside the bundle root.")
        targets[target] = data
    for target, data in targets.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def read_bundle(root: Path | str) -> dict[str, bytes]:
    """Reads a written bundle back as the bytes it was written as, keyed the same way.

    A link is refused rather than followed, which is what the proofs' `walk` does and for the
    same reason: a link hashes as whatever it points at, so a bundle whose `commands.jsonl` is
    a link to a file outside the root verifies perfectly while evidencing a Run nobody audited.
    Refusing the read is the only place this can be caught — by the time `verify` has bytes,
    the bytes are honest and it is the directory that lied.
    """
    base = Path(root).resolve()
    read: dict[str, bytes] = {}
    for path in sorted(base.rglob("*")):
        if path.is_symlink():
            raise BundleInvalid(
                f"{path.relative_to(base).as_posix()!r} is a link, and evidence is not followed."
            )
        if path.is_file():
            read[path.relative_to(base).as_posix()] = path.read_bytes()
    return read
