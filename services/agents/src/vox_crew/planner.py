"""Authoring a VideoPlan from the teaching surface.

This is where a model enters the loop. Everything before it was the crew learning what the
interface publishes; this module turns that into a prompt, asks for a plan, reads what comes
back, and hands it to the sequence `producer.py` already holds.

Four properties in it are load-bearing.

**The instructions are assembled, not written.** They are built from the categories the
contract index published and the bodies those categories carry, so a category the contract
adds is a category the planner teaches with no edit here, and a capability the catalog gains
is one the model can reach for. The only prose of the crew's own is a short framing preamble,
and it speaks the vocabulary the `language` category publishes rather than the repository's.

**No repository vocabulary reaches a model.** `scan_for_leaks` is the proofs' leak-scan
discipline applied to the text of a prompt instead of the contents of a work root, and
`author_plan` runs it as a gate rather than a report: a prompt that leaks raises before an
author is asked anything. The crew is code-blind by convention in this phase, and a prompt is
the easiest place to lose that without noticing.

**What comes back is read in the compiler's own words.** `review` reports findings whose
codes, `means` and `repair` are the ones the published checks contract carries — the crew
names a defect the way the interface names it and does not invent a second vocabulary for the
same thing. The findings do not stop a plan being submitted: the compiler is the only
authority on a plan, and a crew that refused to submit on its own reading would put its
opinion above the interface's. They travel with the Run instead, for the repair loop and the
evidence bundle to read.

**A repair is authored, not composed.** `repair_plan` is `author_plan` with what production
said placed after the same instructions, and it runs the same leak gate over the whole text.
The crew writes no prose about a refusal — `refusals.py` gathers the envelope, the report and
the published `means` and `repair` for the codes in it, and the author reads those. Rebuilding
the instructions rather than growing them keeps the catalog one identical prefix across the
whole loop, which is what the contract budget depends on.

The live implementation of the author is the only thing here that needs the ADK framework, and
it imports it when it is built rather than when this module is. That is what keeps a bare
`pytest` run free of a network install.
"""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .client import ProductionClient
from .envelopes import ResultEnvelope
from .producer import READ_BACK, ProducedRun, produce
from .refusals import Refusal
from .teaching_surface import TeachingSurface, read_teaching_surface


class InstructionsLeaked(RuntimeError):
    """Instructions carried repository vocabulary, so they were not sent.

    Carries the violations the scan found. This is a stop rather than a warning: the crew's
    code-blindness is convention in this phase, and the one place it can be lost silently is
    a prompt.
    """


class PlanNotAuthored(RuntimeError):
    """An author answered with something that is not a plan object."""


# What must never appear in a prompt. The repository-side entries mirror the markers the
# proofs scan a work root for; the crew-side ones are this project's own module and class
# names, which are exactly the knowledge an agent is not supposed to have.
#
# Every entry here names something on *this side* of the boundary. Nothing the command surface
# publishes about itself belongs in this list, however filesystem-shaped it looks: the protocol
# contract tells an agent that a plan is submitted as `plan.json`, so scanning for that string
# would fail the crew on its own teaching surface. A test holds the list to that rule by
# scanning every published contract and requiring it to pass.
LEAK_MARKERS: tuple[str, ...] = (
    "sourcesContent",
    "sourceMappingURL",
    "ProductionCommandService",
    "node_modules",
    "packages/production",
    "packages\\production",
    "packages/video",
    "packages\\video",
    "services/agents",
    "services\\agents",
    "ELEVENLABS_API_KEY",
    "VOX_GRANT_KEY",
    "VOX_RUN_HMAC_KEY",
    "GOOGLE_API_KEY",
    "vox_crew",
    "LocalProductionClient",
    "ProductionClient",
    "local_client",
    "teaching_surface",
    "pnpm",
    "vitest",
    ".venv",
    "conftest",
)

# A source file named in a prompt is implementation knowledge whatever the file is called.
LEAK_EXTENSIONS: tuple[str, ...] = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".map")

# Keys that would mean the agent wrote physical time. The compiler is the only writer of it,
# so any of these in an authored plan is a defect regardless of the value beside it.
PHYSICAL_TIME = (
    "frame",
    "duration",
    "safearea",
    "safe_area",
    "timing",
    "fps",
    "second",
    "millisecond",
    "msec",
    "timestamp",
)

# What a resolved reference looks like. An asset requirement is a subject in natural language;
# any of these means the agent resolved it itself instead of describing what it needs.
#
# A bare forward slash is deliberately not one of them. "high/low water" and "before/after" are
# things a subject says, and a check that refused them would train the next author away from
# writing English rather than away from writing paths.
RESOLVED_REFERENCE = re.compile(
    r"^\s*\w+://"  # a URI
    r"|^\s*data:"  # an inline binary
    r"|^\s*[a-z]:[\\/]"  # an absolute path
    r"|^\s*[\\/]"
    r"|\\"  # a Windows separator, which prose does not contain
    r"|\.(?:jpg|jpeg|png|webp|svg|gif|mp4|mov|pdf)\b",  # a file
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class LeakScan:
    """What a scan over a prompt found. `ok` is the acceptance criterion."""

    violations: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return not self.violations


@dataclass(frozen=True, slots=True)
class Finding:
    """One thing the crew can see about a plan before the compiler is asked.

    `code`, `means` and `repair` are the interface's own, read from the published checks
    contract. `where` and `detail` are the crew's, because only the crew knows which scene it
    was looking at.
    """

    code: str
    where: str
    detail: str
    means: str
    repair: str


@dataclass(frozen=True, slots=True)
class AuthoredPlan:
    """A plan a model wrote, the prompt it was written from, and what the crew can see in it."""

    plan: Mapping[str, Any]
    instructions: str
    findings: tuple[Finding, ...]


@dataclass(frozen=True, slots=True)
class AuthoredRun:
    """One Run, from discovery through authoring to whatever production made of the plan."""

    surface: TeachingSurface
    authored: AuthoredPlan
    produced: ProducedRun

    @property
    def plan(self) -> Mapping[str, Any]:
        return self.authored.plan

    @property
    def instructions(self) -> str:
        return self.authored.instructions

    @property
    def findings(self) -> tuple[Finding, ...]:
        return self.authored.findings


class PlanAuthor(ABC):
    """Whatever turns instructions and a Brief into a VideoPlan.

    Payload-shaped in both directions, and holding no client, no path and no opinion about the
    production sequence: a live implementation talks to a model, a scripted one answers from
    what it was given, and nothing above this interface can tell which it has. That is
    ADR-0015's rule about the deployment seam applied to the model seam, for the same reason —
    an interface that leaked the implementation would have to be unpicked to swap it.
    """

    @abstractmethod
    def author(self, instructions: str, brief: Mapping[str, Any]) -> Mapping[str, Any]:
        """Answers with a VideoPlan for the Brief, authored against the instructions."""

    @abstractmethod
    def repair(
        self,
        instructions: str,
        brief: Mapping[str, Any],
        plan: Mapping[str, Any],
        refusal: Refusal,
    ) -> Mapping[str, Any]:
        """Answers with a repaired VideoPlan for the plan production would not take.

        A second method rather than a longer `author`, because a repair is a function of four
        things and authoring is a function of two: an author asked to repair without the plan
        it wrote and what was said about it would be authoring again from scratch, which is
        the one thing a repair may not be. Both are payload-shaped for the same reason —
        `Refusal` carries envelopes and report bodies, and holds no client and no path.
        """


def _preamble() -> str:
    """The crew's only prose, in the vocabulary the `language` category publishes.

    It says what the model is for and what it may not write, and nothing about how the crew is
    built. Every noun in it — Brief, Beat, Section, SceneInstance, capability, anchor — is a
    term the contract defines, which is what keeps it scannable.
    """
    return (
        "You are the producer on a video production. You are given a Brief and the contract "
        "the production interface publishes about itself, below. Author a VideoPlan for the "
        "Brief and answer with that plan as JSON and nothing else.\n"
        "\n"
        "What you write is semantics. Beats carry their own voice-over text. Sections "
        "partition the Beats and hold the persistent elements and their placements. Each "
        "SceneInstance names a capability the catalog publishes and spans the Beats it plays "
        "over.\n"
        "\n"
        "You do not write physical time. No frames, no durations, no safe areas, no seconds: "
        "every moment is an anchor in one of the published forms. Capability, action, layout "
        "and anchor names come from the catalog below, never from memory — if the catalog "
        "does not publish it, it does not exist. Asset requirements are a subject in natural "
        "language with a treatment and an orientation, never a file, a URL or an image.\n"
    )


def instructions(surface: TeachingSurface) -> str:
    """Assembles the prompt from the categories the index published, in the index's order.

    The bodies go in whole. They are what the plan is authored against, and a summary of a
    catalog is a description of capabilities the model then cannot name correctly. They go in
    compact, the way the envelopes themselves are framed: the catalog is the largest thing in
    this prompt by a wide margin and indenting it buys a model nothing it cannot already read.
    """
    parts = [_preamble()]
    for category in surface.categories:
        parts.append(
            f"\n## {category}\n\n{surface.summary(category)}\n\n"
            "```json\n"
            + json.dumps(surface.contract(category), separators=(",", ":"), ensure_ascii=False)
            + "\n```\n"
        )
    return "".join(parts)


def _markers(lowered: str) -> list[str]:
    """Every marker the text names. Case-insensitive, and the half both scans share."""
    return [f"marker:{marker}" for marker in LEAK_MARKERS if marker.lower() in lowered]


def scan_for_leaks(text: str) -> LeakScan:
    """The proofs' leak-scan discipline, over a prompt instead of a work root.

    Case-insensitive, because a marker that only matched one casing would be a scan that
    passed on the thing it exists to catch.
    """
    lowered = text.lower()
    named = r"\b[\w.-]+(?:" + "|".join(re.escape(item) for item in LEAK_EXTENSIONS) + r")\b"
    violations = _markers(lowered)
    violations += [f"source-file:{match}" for match in re.findall(named, lowered)]
    if re.search(r"\b[a-z]:[\\/]", lowered):
        violations.append("absolute-path")
    return LeakScan(tuple(dict.fromkeys(violations)))


def scan_message_for_leaks(*parts: Any) -> LeakScan:
    """The scan over the other half of a prompt: the Brief, and the plan handed back with it.

    `scan_for_leaks` guards the instructions, which the crew assembles out of repository-side
    material and which are therefore where a leak would originate. The task message is not
    that material — a Brief is prose an operator wrote, and a plan is the model's own previous
    answer returned unedited — so only the markers run over it.

    The file-shaped and absolute-path heuristics deliberately do not. They read English as
    evidence, and a Brief that says "Node.js" is not a leak; refusing one would train this
    project's operators away from writing Briefs rather than away from leaking. The markers
    are a different matter: `VOX_GRANT_KEY` or a `packages/production` path can reach a Brief
    by accident, and this is the last place before a model sees it.
    """
    lowered = json.dumps(parts, ensure_ascii=False, default=str).lower()
    return LeakScan(tuple(dict.fromkeys(_markers(lowered))))


def _walk(value: Any, where: str) -> Iterator[tuple[str, str]]:
    """Every key in a plan, with the path that reached it."""
    if isinstance(value, Mapping):
        for key, item in value.items():
            yield where, str(key)
            yield from _walk(item, f"{where}.{key}")
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for index, item in enumerate(value):
            yield from _walk(item, f"{where}[{index}]")


def _anchor_pattern(time: Mapping[str, Any]) -> re.Pattern[str]:
    """Builds the anchor reader from the forms the catalog publishes.

    The edge names and the word prefix are taken from the form strings and the offset tokens
    from `offsets`, so the crew reads the anchors the contract currently describes rather than
    the ones it described when this was written. A form this cannot parse is left out, which
    a test catches by holding every published example to the pattern.
    """
    edges: set[str] = set()
    words = False
    for form in time.get("forms", ()):
        tail = str(form.get("form", "")).split(".", 1)[-1] if isinstance(form, Mapping) else ""
        if tail.startswith("word:"):
            words = True
        else:
            edges.update(part for part in tail.split("|") if part.isalpha())
    offsets = "|".join(re.escape(str(token)) for token in time.get("offsets", ()))
    alternatives = []
    if edges:
        edge = "|".join(sorted(re.escape(name) for name in edges))
        alternatives.append(f"(?:{edge})" + (f"(?:[+-](?:{offsets}))?" if offsets else ""))
    if words:
        alternatives.append(r"word:\S.*")
    return re.compile(r"^(?P<beat>[^.]+)\.(?:" + "|".join(alternatives) + r")$")


def review(plan: Mapping[str, Any], surface: TeachingSurface) -> tuple[Finding, ...]:
    """Reads an authored plan against the catalog it was supposed to be authored from.

    This is not a second compiler and does not try to be one — it covers what the instructions
    are responsible for teaching, which is the part a Run should not have to be spent
    discovering. Everything else is the compiler's to say.
    """
    catalog = surface.contract("catalog")
    published = surface.contract("checks").get("errors", {})
    capabilities = {
        str(item["id"]): item
        for item in catalog.get("capabilities", ())
        if isinstance(item, Mapping) and "id" in item
    }
    anchor = _anchor_pattern(catalog.get("time", {}))
    scene_beat = str(catalog.get("time", {}).get("sceneBeatId", "scene"))
    findings: list[Finding] = []

    def report(code: str, where: str, detail: str) -> None:
        meaning = published.get(code, {})
        findings.append(
            Finding(
                code=code,
                where=where,
                detail=detail,
                means=str(meaning.get("means", "")),
                repair=str(meaning.get("repair", "")),
            )
        )

    for where, key in _walk(plan, "plan"):
        lowered = key.lower()
        if any(word in lowered for word in PHYSICAL_TIME):
            report("MALFORMED_PLAN", f"{where}.{key}", f"{key} is physical time, not semantics.")

    for section in plan.get("sections", ()) or ():
        if not isinstance(section, Mapping):
            continue
        at = f"plan.sections[{section.get('id', '?')}]"
        for element in section.get("persistent", ()) or ():
            if isinstance(element, Mapping):
                _read_asset(element.get("assetRequirement"), f"{at}.persistent", report)
                _read_anchors(
                    element.get("placements", ()),
                    anchor,
                    scene_beat,
                    section.get("spansBeats", ()) or (),
                    f"{at}.persistent",
                    report,
                )
        for scene in section.get("scenes", ()) or ():
            if not isinstance(scene, Mapping):
                continue
            here = f"{at}.scenes[{scene.get('id', '?')}]"
            component = str(scene.get("component", ""))
            capability = capabilities.get(component)
            if capability is None:
                report(
                    "UNKNOWN_CAPABILITY",
                    f"{here}.component",
                    f"{component!r} is not a capability the catalog publishes.",
                )
                continue
            props = scene.get("props")
            if isinstance(props, Mapping):
                _read_asset(props.get("assetRequirement"), f"{here}.props", report)
            actions = {
                str(action["id"])
                for action in capability.get("actions", ())
                if isinstance(action, Mapping) and "id" in action
            }
            spans = scene.get("spansBeats", ()) or ()
            for index, event in enumerate(scene.get("events", ()) or ()):
                if not isinstance(event, Mapping):
                    continue
                named = str(event.get("action", ""))
                if named not in actions:
                    report(
                        "UNKNOWN_ACTION",
                        f"{here}.events[{index}].action",
                        f"{named!r} is not an action {component} publishes.",
                    )
            _read_anchors(
                scene.get("events", ()) or (),
                anchor,
                scene_beat,
                spans,
                f"{here}.events",
                report,
            )

    return tuple(findings)


def _read_anchors(
    items: Any,
    anchor: re.Pattern[str],
    scene_beat: str,
    spans: Any,
    where: str,
    report: Callable[[str, str, str], None],
) -> None:
    """Holds every `at` to a published form, and to a beat its scene actually spans."""
    reachable = {str(beat) for beat in spans} | {scene_beat}
    for index, item in enumerate(items or ()):
        if not isinstance(item, Mapping) or "at" not in item:
            continue
        at = item["at"]
        if not isinstance(at, str):
            report(
                "MALFORMED_PLAN",
                f"{where}[{index}].at",
                f"{at!r} is physical time, not an anchor.",
            )
            continue
        match = anchor.match(at)
        if match is None:
            report(
                "UNKNOWN_ANCHOR",
                f"{where}[{index}].at",
                f"{at!r} is not one of the forms catalog.time publishes.",
            )
        elif match.group("beat") not in reachable:
            report(
                "UNKNOWN_ANCHOR",
                f"{where}[{index}].at",
                f"{at!r} names a beat outside the ones its scene spans.",
            )


def _read_asset(
    requirement: Any, where: str, report: Callable[[str, str, str], None]
) -> None:
    """An asset requirement says what is needed, never which file would satisfy it."""
    if not isinstance(requirement, Mapping):
        return
    subject = requirement.get("subject")
    if isinstance(subject, str) and RESOLVED_REFERENCE.search(subject):
        report(
            "MALFORMED_PLAN",
            f"{where}.assetRequirement.subject",
            f"{subject!r} is a resolved reference, not a subject.",
        )


def _refuse_if_leaked(text: str, what: str, *parts: Any) -> None:
    """Refuses to send a prompt that carries repository vocabulary, in either half.

    Raised rather than scrubbed. A prompt that had to be edited on its way out is a prompt
    whose builder is wrong, and editing it here would hide that from whoever reads the run.
    """
    found = scan_for_leaks(text).violations + scan_message_for_leaks(*parts).violations
    scan = LeakScan(tuple(dict.fromkeys(found)))
    if not scan.ok:
        raise InstructionsLeaked(
            f"The {what} carry repository vocabulary and were not sent: "
            + ", ".join(scan.violations)
        )


def _as_plan(answered: Any, verb: str) -> Mapping[str, Any]:
    """What an author said, once it is known to be a plan object and not something else."""
    if not isinstance(answered, Mapping):
        raise PlanNotAuthored(f"An author {verb} with {type(answered).__name__}, not a plan.")
    return answered


def author_plan(
    surface: TeachingSurface, brief: Mapping[str, Any], author: PlanAuthor
) -> AuthoredPlan:
    """Builds the instructions, scans them, asks for a plan, and reads what came back."""
    text = instructions(surface)
    _refuse_if_leaked(text, "instructions", brief)

    plan = _as_plan(author.author(text, brief), "answered")
    return AuthoredPlan(plan=plan, instructions=text, findings=review(plan, surface))


def repair_plan(
    surface: TeachingSurface,
    brief: Mapping[str, Any],
    plan: Mapping[str, Any],
    refusal: Refusal,
    author: PlanAuthor,
) -> AuthoredPlan:
    """`author_plan` again, with what production said in front of the instructions.

    Deliberately the same shape and the same gate. The scan runs over the whole text, not only
    over the part `author_plan` built, because the refusal is new text reaching a model and a
    prompt is where code-blindness is lost quietly — that argument does not weaken because the
    new text came from the service.

    The authoring instructions are rebuilt rather than appended to a previous repair's, so the
    catalog stays one identical prefix across the whole loop. That is what makes the contract
    budget survive a repair: the largest thing in the prompt is sent once and cached, and only
    the refusal after it differs from cycle to cycle.
    """
    text = instructions(surface) + refusal.as_text()
    _refuse_if_leaked(text, "repair instructions", brief, plan)

    repaired = _as_plan(author.repair(text, brief, plan, refusal), "repaired")
    return AuthoredPlan(plan=repaired, instructions=text, findings=review(repaired, surface))


def plan_and_produce(
    client: ProductionClient,
    request: Mapping[str, Any],
    author: PlanAuthor,
    *,
    on_envelope: Callable[[ResultEnvelope], None] | None = None,
    read_back: Sequence[str] = READ_BACK,
) -> AuthoredRun:
    """Discovery, authoring, then the sequence `produce` already holds.

    A refusal is a successful outcome here: it comes back on `produced.refusal` with the
    report the repair loop is built from, and nothing raises.
    """
    surface = read_teaching_surface(client, on_envelope)
    authored = author_plan(surface, request.get("brief", {}), author)
    produced = produce(
        client, request, authored.plan, on_envelope=on_envelope, read_back=read_back
    )
    return AuthoredRun(surface=surface, authored=authored, produced=produced)


class AdkPlanAuthor(PlanAuthor):
    """The live author: a model, reached through the ADK framework.

    The framework and the model client are imported when one of these is built rather than
    when this module is loaded, which is what lets the crew's tests — and a bare `pytest` —
    run with neither installed. Nothing else in the crew imports them at all.

    Its credential comes from the environment the runtime was given and is never held here,
    read, or written anywhere the crew can reach.
    """

    def __init__(
        self,
        *,
        model: str = "gemini-2.5-pro",
        name: str = "producer",
        app_name: str = "vox-crew",
    ) -> None:
        from google.adk.agents import LlmAgent  # noqa: PLC0415

        self._llm_agent = LlmAgent
        self._model = model
        self._name = name
        self._app_name = app_name

    def agent(self, instructions: str) -> Any:
        """The agent that would be asked, built but not run.

        Exposed because building it is the furthest a machine with no model credential can
        follow this path, and a seam that can only be exercised with a key is one that is
        never exercised.
        """
        return self._llm_agent(
            name=self._name,
            model=self._model,
            description="Authors a VideoPlan for a Brief from the published contract.",
            instruction=instructions,
        )

    def author(self, instructions: str, brief: Mapping[str, Any]) -> Mapping[str, Any]:
        return self._ask(instructions, brief)

    def repair(
        self,
        instructions: str,
        brief: Mapping[str, Any],
        plan: Mapping[str, Any],
        refusal: Refusal,
    ) -> Mapping[str, Any]:
        """The same ask, with the refused plan beside the Brief in the message.

        The refusal itself is already in the instructions — `repair_plan` put it there, after
        the catalog, so the prefix a repair is authored against is the prefix the first
        authoring used. Nothing is composed here: the two keys below are the interface's own
        nouns, and the plan is the model's own previous answer handed back unedited.
        """
        return self._ask(instructions, {"brief": brief, "plan": plan})

    def _ask(self, instructions: str, message: Mapping[str, Any]) -> Mapping[str, Any]:
        import asyncio  # noqa: PLC0415

        from google.adk.runners import InMemoryRunner  # noqa: PLC0415
        from google.genai import types  # noqa: PLC0415

        runner = InMemoryRunner(agent=self.agent(instructions), app_name=self._app_name)
        session = asyncio.run(
            runner.session_service.create_session(app_name=self._app_name, user_id=self._name)
        )
        answered = [
            part.text
            for event in runner.run(
                user_id=self._name,
                session_id=session.id,
                new_message=types.Content(
                    role="user", parts=[types.Part(text=json.dumps(message, ensure_ascii=False))]
                ),
            )
            if event.content
            for part in (event.content.parts or ())
            if part.text
        ]
        return _plan_from(("".join(answered)).strip())


def _plan_from(answer: str) -> Mapping[str, Any]:
    """The plan out of a model's answer, whether or not it arrived in a fence."""
    fenced = re.search(r"```(?:json)?\s*(.+?)```", answer, re.DOTALL)
    body = fenced.group(1) if fenced else answer
    try:
        plan = json.loads(body)
    except json.JSONDecodeError as error:
        raise PlanNotAuthored(
            f"An author answered with something that is not JSON: {error}"
        ) from error
    return _as_plan(plan, "answered")
