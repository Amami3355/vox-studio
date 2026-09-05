"""One command that runs the crew headless against a bootstrapped work root.

Point it at a work root built by `pnpm --filter @vox/production bootstrap:workroot`, with the
production service already listening, and it converges on the Brief that work root carries:
discover the contracts, author a plan, repair it against whatever production refuses, Preflight,
record, compile, render — and leave an evidence bundle beside the Run either way.

    vox-crew --work-root C:\\vox-proof-workroots\\crew

**The Brief's file name is not a flag.** A bootstrapped work root is the launcher and
`request.json` and nothing else, and that invariant is what the isolation assertion reads. A
command that took the Brief's name as an argument would be a command that could be pointed at a
work root nobody bootstrapped.

**Which author it holds is the whole difference between a free run and a billed one.** With no
`--plan`, the crew authors through a model and needs that runtime's credential in its
environment. With one, the plan is handed in and the model is never reached — every other part
of the crew is the same code either way, because `converge` takes a `PlanAuthor` and cannot tell
which one it has. That is what makes the deterministic end-to-end run a proof of the live path
rather than a rehearsal of it. `--model` chooses which model the live author asks, for one
invocation, so a run that wants a stronger model than the pinned default does not move the pin.

The split between the two streams is deliberate and worth keeping as the crew grows. Stdout
carries production's envelopes and nothing else, in the order they arrived, byte for byte, so
a run redirected to a file is a record of what the interface said. Everything the crew has to
say about them goes to stderr.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any

from .client import ProductionClient, ProductionClientError
from .context import RESIDENT_CHARS_ALLOWED, ContextBudgetExceeded, tokens
from .converge import RENDERED, converge
from .envelopes import MalformedEnvelope, ResultEnvelope
from .evidence import BundleInvalid, EvidenceLeaked, assemble, write_bundle
from .http_client import KEY_VARIABLE, HttpProductionClient
from .local_client import DEFAULT_LAUNCHER, LocalProductionClient
from .planner import (
    AdkPlanAuthor,
    HandedPlanAuthor,
    InstructionsLeaked,
    PlanAuthor,
    PlanNotAuthored,
    PlanNotRepairable,
    cache_prefix,
)
from .teaching_surface import DiscoveryRefused, read_teaching_surface

REQUEST = "request.json"
EVIDENCE = "evidence"


@dataclass(frozen=True, slots=True)
class Arguments:
    work_root: Path
    launcher: list[str]
    plan: Path | None
    evidence: Path
    discovery_only: bool
    model: str | None
    service_address: str | None

    @property
    def request(self) -> Path:
        return self.work_root / REQUEST


def parse_arguments(argv: Sequence[str] | None = None) -> Arguments:
    parser = argparse.ArgumentParser(
        prog="vox-crew",
        description="Converge on the Brief a bootstrapped work root carries.",
    )
    parser.add_argument(
        "--work-root",
        required=True,
        type=Path,
        help="The bootstrapped work root: the launcher and the Brief's request, nothing else.",
    )
    parser.add_argument(
        "--plan",
        default=None,
        metavar="FILE",
        help=(
            "Hand the crew a plan instead of asking a model for one, named relative to the "
            "work root. The Run is then reproducible and free, and it is not the crew authoring."
        ),
    )
    parser.add_argument(
        "--evidence",
        default=EVIDENCE,
        metavar="DIR",
        help=(
            "Where the Run's evidence bundle is written, relative to the work root. Refused "
            f"rather than merged into if it already holds one. Default: {EVIDENCE}"
        ),
    )
    parser.add_argument(
        "--discovery-only",
        action="store_true",
        help="Read the teaching surface and stop, without opening a Run or writing anything.",
    )
    parser.add_argument(
        "--model",
        default=None,
        metavar="NAME",
        help=(
            "Author the plan on this model instead of the author's pinned default. A pinned "
            "name, never an alias: a Run's bundle has to be able to say which model wrote its "
            "plan. Meaningless with --plan, and refused there rather than ignored."
        ),
    )
    parser.add_argument(
        "--launcher",
        action="append",
        default=None,
        metavar="WORD",
        help=(
            "Override the launcher command, one word per flag. Development only; the default "
            "is the launcher in the work root."
        ),
    )
    parser.add_argument(
        "--service-address",
        default=None,
        metavar="HOST:PORT",
        help=(
            "Reach production over the network at this address instead of spawning a launcher "
            "on this machine. The address is a forwarded local port and the signing key is "
            f"read from {KEY_VARIABLE} at each request, never from a flag: a key in argv is a "
            "key in the process table. The Brief is still read from the work root, and the "
            "evidence bundle is still written there."
        ),
    )
    parsed = parser.parse_args(argv)
    # A handed plan never reaches a model, so a model named alongside one is a
    # misunderstanding of which author the invocation is asking for. Accepting it silently
    # would let a run be launched believing it chose an author it never had.
    if parsed.plan is not None and parsed.model is not None:
        parser.error("--model asks for an author a handed --plan never reaches.")
    # The rule the pinned default is held to, applied to a model an invocation names: a Run's
    # bundle has to be able to say which model wrote its plan, and a floating alias cannot.
    # `latest` is the whole rule because it is the alias convention — a `-preview` or `-exp`
    # name is unstable but it still names one model, which is what a bundle records.
    if parsed.model is not None and "latest" in parsed.model:
        parser.error("--model needs a pinned name; an alias cannot tell a bundle what authored a plan.")
    # A launcher is the local client's whole mechanism and the network client has none, so an
    # invocation naming both is asking for two different clients. Refused rather than resolved
    # by precedence: a run that silently spawned a launcher after being handed an address would
    # produce its Run on the operator's disk, which is the one property this phase exists to
    # move off it.
    if parsed.service_address is not None and parsed.launcher is not None:
        parser.error("--launcher names a client --service-address does not reach.")
    work_root = parsed.work_root
    return Arguments(
        work_root=work_root,
        launcher=parsed.launcher or [str(work_root / DEFAULT_LAUNCHER)],
        plan=None if parsed.plan is None else work_root / parsed.plan,
        evidence=work_root / parsed.evidence,
        discovery_only=parsed.discovery_only,
        model=parsed.model,
        service_address=parsed.service_address,
    )


def author_for(arguments: Arguments) -> PlanAuthor:
    """The author the invocation asks for, built without being asked anything yet.

    A public seam for the same reason `AdkPlanAuthor.agent` is one: on a machine holding no
    model credential this is the furthest the live path can be followed, and a test that could
    only reach it through a whole convergence could not follow it at all.

    An invocation that names no model asks for none, rather than restating the author's pin
    here: the pinned default and the test that keeps it served both live at the author, and a
    second copy of the name would be the one nobody updates when a family is retired.
    """
    if arguments.plan is None:
        if arguments.model is None:
            return AdkPlanAuthor()
        return AdkPlanAuthor(model=arguments.model)
    return HandedPlanAuthor(json.loads(arguments.plan.read_text(encoding="utf-8")))


def _verbatim(stream: IO[str]) -> IO[str]:
    """Stops the platform rewriting the envelopes on the way out.

    Windows text streams default to a legacy code page and translate newlines, either of which
    can make stdout a faithful rendering of the envelopes rather than the envelopes. Nothing
    else here is allowed to change them, so this is not allowed to either.
    """
    reconfigure = getattr(stream, "reconfigure", None)
    if reconfigure is not None:
        try:
            reconfigure(encoding="utf-8", newline="")
        except (ValueError, OSError):
            pass
    return stream


def _missing(arguments: Arguments, client: ProductionClient | None) -> str | None:
    """What the invocation names and the disk does not have, before anything is spawned.

    The work root is needed for both clients and for different reasons. The local client is
    launched out of it; the network client never opens it, but the Brief is still read from it
    and the evidence bundle is still written into it — which is what ticket 09 means by the
    crew staying local. So what a network invocation needs is a directory carrying a Brief,
    and not a bootstrapped one: there is no launcher in that path to bootstrap.
    """
    if client is None and not arguments.work_root.is_dir():
        return f"no work root at {arguments.work_root}"
    if not arguments.discovery_only and not arguments.request.is_file():
        if arguments.service_address is not None:
            return f"no {REQUEST} in {arguments.work_root}: there is no Brief to submit"
        return f"no {REQUEST} in {arguments.work_root}: it is not a bootstrapped work root"
    if arguments.plan is not None and not arguments.plan.is_file():
        return f"no plan at {arguments.plan}"
    return None


def _discover(client: ProductionClient, show: Any, err: IO[str], work_root: Path) -> int:
    """The diagnostic: what does the boundary teach, is it there at all, and what will it cost?

    The prefix is assembled here as well as counted. It is the one measurement that can be
    taken without opening a Run or reaching a model, and it is the term that dominates every
    Run's budget — so a catalog that has outgrown the allowance is answerable from a diagnostic
    rather than from a convergence.
    """
    surface = read_teaching_surface(client, show)
    held = sum(len(envelope.raw) for envelope in surface.envelopes)
    resident = cache_prefix(surface).chars
    err.write(
        f"vox-crew: read {len(surface.categories)} contract projections "
        f"({', '.join(surface.categories)}), {held} bytes held in context and none written to "
        f"{work_root}.\n"
        f"vox-crew: they assemble to {resident:,} characters (~{tokens(resident):,} tokens) of "
        f"instructions, resident for a whole Run against an allowance of "
        f"{RESIDENT_CHARS_ALLOWED:,}.\n"
    )
    return 0


def main(
    argv: Sequence[str] | None = None,
    *,
    client: ProductionClient | None = None,
    out: IO[str] | None = None,
    err: IO[str] | None = None,
) -> int:
    arguments = parse_arguments(argv)
    out = _verbatim(out if out is not None else sys.stdout)
    err = err if err is not None else sys.stderr

    absent = _missing(arguments, client)
    if absent is not None:
        err.write(f"vox-crew: {absent}\n")
        return 2

    if client is None:
        client = (
            HttpProductionClient(arguments.service_address)
            if arguments.service_address is not None
            else LocalProductionClient(arguments.work_root, launcher_command=arguments.launcher)
        )

    def show(envelope: ResultEnvelope) -> None:
        out.write(envelope.raw)
        out.flush()

    try:
        if arguments.discovery_only:
            return _discover(client, show, err, arguments.work_root)
        request = json.loads(arguments.request.read_text(encoding="utf-8"))
        run = converge(client, request, author_for(arguments), on_envelope=show)
    except DiscoveryRefused as refused:
        err.write(f"vox-crew: {refused}\n")
        return 1
    except PlanNotRepairable as unrepairable:
        # The Run is real and refused, and there is no `ConvergedRun` to write a bundle from:
        # the author raised where a repaired plan would have been returned. What production
        # said is already on stdout, which is the record that matters.
        err.write(f"vox-crew: {unrepairable}\n")
        return 1
    except (ContextBudgetExceeded, InstructionsLeaked, PlanNotAuthored) as unusable:
        # Three findings about the crew's own prompt rather than about the Run: it leaks, it
        # does not fit the budget, or what came back is not a plan. None leaves a Run to write
        # a bundle from, and all three are the operator's to act on.
        err.write(f"vox-crew: {unusable}\n")
        return 1
    except (ProductionClientError, MalformedEnvelope) as unreachable:
        err.write(f"vox-crew: {unreachable}\n")
        return 1

    try:
        write_bundle(arguments.evidence, assemble(run))
    except (BundleInvalid, EvidenceLeaked) as refused_bundle:
        err.write(f"vox-crew: the bundle was not written: {refused_bundle}\n")
        return 1

    err.write(
        f"vox-crew: Run {run.run_id} ended {run.outcome}"
        f"{f' at {run.limit}' if run.limit else ''}, "
        f"{len(run.envelopes)} envelopes, {len(run.artifacts)} artifacts read back, "
        f"evidence in {arguments.evidence}.\n"
        f"vox-crew: {run.spend.as_sentence()}.\n"
    )
    return 0 if run.outcome == RENDERED else 1


if __name__ == "__main__":
    raise SystemExit(main())
