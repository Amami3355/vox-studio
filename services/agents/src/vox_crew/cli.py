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
rather than a rehearsal of it.

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
from .converge import RENDERED, converge
from .envelopes import MalformedEnvelope, ResultEnvelope
from .evidence import BundleInvalid, EvidenceLeaked, assemble, write_bundle
from .local_client import DEFAULT_LAUNCHER, LocalProductionClient
from .planner import (
    AdkPlanAuthor,
    HandedPlanAuthor,
    InstructionsLeaked,
    PlanAuthor,
    PlanNotAuthored,
    PlanNotRepairable,
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
        "--launcher",
        action="append",
        default=None,
        metavar="WORD",
        help=(
            "Override the launcher command, one word per flag. Development only; the default "
            "is the launcher in the work root."
        ),
    )
    parsed = parser.parse_args(argv)
    work_root = parsed.work_root
    return Arguments(
        work_root=work_root,
        launcher=parsed.launcher or [str(work_root / DEFAULT_LAUNCHER)],
        plan=None if parsed.plan is None else work_root / parsed.plan,
        evidence=work_root / parsed.evidence,
        discovery_only=parsed.discovery_only,
    )


def author_for(arguments: Arguments) -> PlanAuthor:
    """The author the invocation asks for, built without being asked anything yet.

    A public seam for the same reason `AdkPlanAuthor.agent` is one: on a machine holding no
    model credential this is the furthest the live path can be followed, and a test that could
    only reach it through a whole convergence could not follow it at all.
    """
    if arguments.plan is None:
        return AdkPlanAuthor()
    return HandedPlanAuthor(json.loads(arguments.plan.read_text(encoding="utf-8")))


def _verbatim(stream: IO[str]) -> IO[str]:
    """Stops the platform rewriting the envelopes on the way out.

    Text streams translate newlines on Windows, which would make stdout a faithful rendering
    of the envelopes rather than the envelopes. Nothing else here is allowed to change them,
    so this is not allowed to either.
    """
    reconfigure = getattr(stream, "reconfigure", None)
    if reconfigure is not None:
        try:
            reconfigure(newline="")
        except (ValueError, OSError):
            pass
    return stream


def _missing(arguments: Arguments, client: ProductionClient | None) -> str | None:
    """What the invocation names and the disk does not have, before anything is spawned."""
    if client is None and not arguments.work_root.is_dir():
        return f"no work root at {arguments.work_root}"
    if not arguments.discovery_only and not arguments.request.is_file():
        return f"no {REQUEST} in {arguments.work_root}: it is not a bootstrapped work root"
    if arguments.plan is not None and not arguments.plan.is_file():
        return f"no plan at {arguments.plan}"
    return None


def _discover(client: ProductionClient, show: Any, err: IO[str], work_root: Path) -> int:
    """The diagnostic: what does the boundary teach, and is it there at all?"""
    surface = read_teaching_surface(client, show)
    held = sum(len(envelope.raw) for envelope in surface.envelopes)
    err.write(
        f"vox-crew: read {len(surface.categories)} contract projections "
        f"({', '.join(surface.categories)}), {held} bytes held in context and none written to "
        f"{work_root}.\n"
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
        client = LocalProductionClient(arguments.work_root, launcher_command=arguments.launcher)

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
    except (InstructionsLeaked, PlanNotAuthored) as unusable:
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
    )
    return 0 if run.outcome == RENDERED else 1


if __name__ == "__main__":
    raise SystemExit(main())
