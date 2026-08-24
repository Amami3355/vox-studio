"""What production said about a plan, gathered without being restated.

A refusal is the teaching surface at its sharpest. `run.validate` and `run.compile` answer
`needs_repair` with a report, a set of published codes and the `next` command they suggest, and
the checks contract carries a `means` and a `repair` for every one of those codes. That is
already an instruction to an author. A crew that summarised it into prose of its own would be
putting a paraphrase in front of the model where the interface's own words were available, and
would go stale the first time a code's `repair` was reworded.

So nothing here explains a refusal. It gathers one:

- the envelope, with `raw` kept, because the bytes are what the model is shown;
- the report the envelope published, fetched by its descriptor through the client, never by
  joining a Run root to a path;
- the published `means` and `repair` for exactly the codes that report named, and no others;
- what the protocol category publishes about repair and about Preflight, which is where the
  rule that a Take survives a repair is written down.

The crew's only prose is the four headings that separate them.

**Preflight is carried here too, and it does not refuse.** `risksBlockRecord` is false and the
envelope succeeds, so calling this a refusal is a stretch of the word — but a scene Preflight
assesses as `point_below` is the compiler's `BELOW_MIN_DURATION` seen early enough to be free,
and the material is the same material in the same vocabulary. It is carried as a refusal with
`advisory` set, rather than as a second shape a repair has to know about.
"""

from __future__ import annotations

import json
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .client import ProductionClient
from .envelopes import ResultEnvelope
from .teaching_surface import TeachingSurface

# The reports a refusing or advising command publishes. A command publishes at most one of
# them, and it is the body the codes live in — an envelope's `data.report` is only the summary.
REPORT_KINDS = ("validation_report", "compile_report", "preflight_report")

# What the protocol category publishes that a repair is authored against. All three are read
# whole: `repair` is where `takeRemainsReusableWhen` and `preferredDurationRepair` are written,
# `preflight` is where the assessment vocabulary and its authority are, and `recording` is
# where the quota rules a repair has to survive are — that a matching Take is reuse without
# quota, and that redispatching an identical input needs a grant the crew does not hold. A
# repair authored after a Take exists is authored against all three at once.
GUIDANCE = ("repair", "preflight", "recording")


def _codes(value: Any) -> Iterator[str]:
    """Every `code` a report names, wherever it names it.

    Walked rather than read out of `errors` and `warnings` by name, because the three report
    shapes put their findings in different places and a reader that knew all three would be a
    third copy of the contract.
    """
    if isinstance(value, Mapping):
        named = value.get("code")
        if isinstance(named, str):
            yield named
        for item in value.values():
            yield from _codes(item)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for item in value:
            yield from _codes(item)


def _compact(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


@dataclass(frozen=True, slots=True)
class Refusal:
    """One thing production said about a plan, in the words production said it in."""

    envelope: ResultEnvelope
    report: Mapping[str, Any] | None
    checks: Mapping[str, Mapping[str, Any]]
    guidance: Mapping[str, Any]
    advisory: bool = False

    @property
    def command(self) -> str | None:
        return self.envelope.command

    @property
    def outcome(self) -> str:
        return self.envelope.outcome

    @property
    def codes(self) -> tuple[str, ...]:
        """The codes the report named, in the order it named them, without repeats."""
        return tuple(dict.fromkeys(_codes(self.report))) if self.report is not None else ()

    def as_text(self) -> str:
        """The material an author repairs from, assembled and not rewritten.

        Everything below a heading is something the interface published: the envelope byte for
        byte, the report body it named, the checks entries for the codes in it, and the
        protocol's own paragraphs about repair. The headings are the crew's, and they label
        rather than summarise — a heading that said what a refusal meant would be the
        paraphrase this module exists to avoid. The one full sentence of the crew's own says
        what to answer with, which is the only thing an envelope does not already say.
        """
        opening = (
            "Preflight assessed the plan you authored before anything was spent on it. It is "
            "advisory and it did not stop the Run."
            if self.advisory
            else "Production refused the plan you authored. Repair it and answer with the "
            "whole repaired plan as JSON and nothing else."
        )
        def section(heading: str, body: str) -> str:
            return f"\n## {heading}\n\n```json\n{body}\n```\n"

        parts = [
            f"\n## What production said\n\n{opening}\n",
            section("The envelope it wrote", self.envelope.raw.strip()),
        ]
        if self.report is not None:
            parts.append(section("The report it published", _compact(self.report)))
        if self.checks:
            parts.append(
                section(
                    "What the contract publishes about the codes in that report",
                    _compact(self.checks),
                )
            )
        if self.guidance:
            parts.append(
                section("What the contract publishes about repair", _compact(self.guidance))
            )
        return "".join(parts)


def _report(
    client: ProductionClient, run_id: str | None, envelope: ResultEnvelope
) -> Mapping[str, Any] | None:
    """The report body an envelope published, read back the only way the crew may read one.

    By descriptor, through the client, so the digest is checked and no Run root is ever joined
    to a path. An envelope that published no report — a `failed` one carries an error and
    nothing else — leaves this None rather than inventing an empty report.
    """
    if run_id is None:
        return None
    descriptor = next((item for item in envelope.artifacts if item.kind in REPORT_KINDS), None)
    if descriptor is None:
        return None
    body = client.fetch_artifact(run_id, descriptor).json()
    return body if isinstance(body, Mapping) else None


def read_refusal(
    client: ProductionClient,
    run_id: str | None,
    envelope: ResultEnvelope,
    surface: TeachingSurface,
    *,
    advisory: bool = False,
) -> Refusal:
    """Gathers everything published about one refusal, and nothing the crew thought of.

    The checks entries are narrowed to the codes the report actually named. Handing an author
    the whole checks contract again would be handing it something it already has — the
    instructions carry every category — where the useful thing is which of them applies here.
    """
    report = _report(client, run_id, envelope)
    published = surface.contract("checks") if "checks" in surface.categories else {}
    entries: dict[str, Mapping[str, Any]] = {}
    for regime in ("errors", "warnings"):
        for code, meaning in (published.get(regime) or {}).items():
            entries[str(code)] = meaning
    protocol = surface.contract("protocol") if "protocol" in surface.categories else {}
    named = tuple(dict.fromkeys(_codes(report))) if report is not None else ()
    return Refusal(
        envelope=envelope,
        report=report,
        checks={code: entries[code] for code in named if code in entries},
        guidance={key: protocol[key] for key in GUIDANCE if key in protocol},
        advisory=advisory,
    )
