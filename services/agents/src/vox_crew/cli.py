"""One command that runs the crew headless against a bootstrapped work root.

Today it runs the tracer bullet: reach the production boundary, read the teaching surface, and
show it. Authoring and converging exist above it and are driven from the tests, because both
need a model credential the crew is never given; what this command proves is the path, not the
thinking. Wiring it to a live author is the work of the ticket that gives the crew a Brief to
run end to end.

The split between the two streams is deliberate and worth keeping as the crew grows. Stdout
carries production's envelopes and nothing else, in the order they arrived, byte for byte, so
a run redirected to a file is a record of what the interface said. Everything the crew has to
say about them goes to stderr.

Point it at a work root built by `pnpm --filter @vox/production bootstrap:workroot`, with the
production service already listening:

    vox-crew --work-root C:\\vox-proof-workroots\\crew
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import IO

from .client import ProductionClient, ProductionClientError
from .envelopes import MalformedEnvelope, ResultEnvelope
from .local_client import DEFAULT_LAUNCHER, LocalProductionClient
from .teaching_surface import DiscoveryRefused, read_teaching_surface


@dataclass(frozen=True, slots=True)
class Arguments:
    work_root: Path
    launcher: list[str]


def parse_arguments(argv: Sequence[str] | None = None) -> Arguments:
    parser = argparse.ArgumentParser(
        prog="vox-crew",
        description="Read the production teaching surface from inside a work root.",
    )
    parser.add_argument(
        "--work-root",
        required=True,
        type=Path,
        help="The bootstrapped work root: the launcher and the Brief's request, nothing else.",
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
    )


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

    if client is None:
        if not arguments.work_root.is_dir():
            err.write(f"vox-crew: no work root at {arguments.work_root}\n")
            return 2
        client = LocalProductionClient(arguments.work_root, launcher_command=arguments.launcher)

    def show(envelope: ResultEnvelope) -> None:
        out.write(envelope.raw)
        out.flush()

    try:
        surface = read_teaching_surface(client, show)
    except DiscoveryRefused as refused:
        err.write(f"vox-crew: {refused}\n")
        return 1
    except (ProductionClientError, MalformedEnvelope) as unreachable:
        err.write(f"vox-crew: {unreachable}\n")
        return 1

    held = sum(len(envelope.raw) for envelope in surface.envelopes)
    err.write(
        f"vox-crew: read {len(surface.categories)} contract projections "
        f"({', '.join(surface.categories)}), {held} bytes held in context and none written to "
        f"{arguments.work_root}.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
