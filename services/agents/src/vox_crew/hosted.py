"""Operator entry point on the isolated crew host.

The probe reads real signed Production contracts/status without spending. The run command
assembles the existing crew with a separately mounted operator policy and persistent checkpoints.
systemd starts explicit attempts; it must never retry an interrupted paid attempt automatically.
Browser admission and recovery reconciliation belong to the subsequent Studio milestone.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import uuid4

from .crew_contract import BriefKind, CrewTerminal, Rendered
from .crew_run import brief_from, build_crew, read_policy, read_recordings
from .crew_state import FileCrewStateStore
from .http_client import HttpProductionClient
from .teaching_surface import read_teaching_surface
from .visual_planner import PublishedCatalog, PublishedShapeValidators


def persistent_root(path: Path) -> Path:
    """Refuse the writable container layer when the persistent bind mount is absent."""
    if not path.is_dir() or not os.path.ismount(path):
        raise ValueError("The crew state root must be a mounted persistent volume.")
    return path


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".partial")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def probe(client: Any, state: Path, run_id: str) -> dict[str, Any]:
    surface = read_teaching_surface(client)
    PublishedShapeValidators(
        PublishedCatalog.from_mapping(surface.contract("catalog")),
        surface.contract("plan"),
        surface.contract("checks"),
    )
    # The hosted image must carry the exercised ADK runtime, even though this probe spends nothing.
    from importlib.metadata import version

    status = client.status(run_id)
    if not status.succeeded:
        raise ValueError("Production refused the requested Run status.")
    previous_path = state / "connectivity.json"
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else None
    result = {
        "schemaVersion": 1,
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "crewRevision": os.environ.get("VOX_CREW_REVISION", "unknown"),
        "adkVersion": version("google-adk"),
        "runId": run_id,
        "statusOutcome": status.outcome,
        "statusSha256": sha256(status.raw.encode()).hexdigest(),
        "contractSha256": {
            name: sha256(envelope.raw.encode()).hexdigest()
            for name, envelope in surface.projections.items()
        },
        "signedResponsesVerified": True,
        "providerCalls": 0,
        "persistenceMarker": previous["persistenceMarker"] if previous else str(uuid4()),
        "previousObservation": previous["observedAt"] if previous else None,
    }
    write_json(previous_path, result)
    return result


async def run_attempt(
    client: Any, state: Path, config: Path, request: dict[str, Any],
    *, brief_kind: BriefKind = BriefKind.FACTUAL,
) -> int:
    if set(request) - {"protocolVersion", "brief", "production"}:
        raise ValueError("A request cannot supply operator policy or runtime configuration.")
    policy = read_policy(config / "operator-policy.json")
    brief = brief_from(request, brief_kind)
    # Hashing is injective for the practical storage boundary, unlike punctuation replacement.
    work = state / "briefs" / sha256(brief.id.encode()).hexdigest()
    attempt = work / "attempts" / str(uuid4())
    attempt.mkdir(parents=True)
    store = FileCrewStateStore(work / "checkpoints")
    recordings_path = config / "recordings.json"
    crew = build_crew(
        client, read_teaching_surface(client), request, policy,
        brief_kind=brief.kind,
        recordings=read_recordings(recordings_path) if recordings_path.exists() else None,
        state_store=store,
        model=os.environ.get("VOX_CREW_MODEL"),
    )
    write_json(attempt / "state.json", {"status": "running", "briefId": brief.id})
    terminal = None
    # Only sanitized public updates go here; model prompts/provider responses are not logs.
    with (attempt / "events.jsonl").open("x", encoding="utf-8") as events:
        async for update in crew.run(brief, policy):
            events.write(json.dumps(update.to_mapping()) + "\n")
            events.flush()
            os.fsync(events.fileno())
            if isinstance(update, CrewTerminal):
                terminal = update
    if terminal is None:
        raise ValueError("The crew returned without a terminal result; reconcile before resuming.")
    write_json(attempt / "state.json", terminal.to_mapping())
    print(json.dumps(terminal.to_mapping()), flush=True)
    return 0 if isinstance(terminal.result, Rendered) else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("probe", "run"))
    parser.add_argument("--state", type=Path, default=Path("/var/lib/vox-crew"))
    parser.add_argument("--config", type=Path, default=Path("/etc/vox-crew"))
    parser.add_argument("--run-id")
    parser.add_argument("--request", type=Path)
    parser.add_argument("--brief-kind", choices=[kind.value for kind in BriefKind], default="factual")
    args = parser.parse_args()
    state = persistent_root(args.state)
    client = HttpProductionClient(os.environ.get("VOX_PRODUCTION_ADDRESS", "127.0.0.1:18080"))
    if args.command == "probe":
        if not args.run_id:
            parser.error("probe requires --run-id for an existing Production Run")
        # Confirm the operator policy is independently installed and parses before declaring readiness.
        read_policy(args.config / "operator-policy.json")
        print(json.dumps(probe(client, state, args.run_id), indent=2), flush=True)
        return 0
    if args.request is None:
        parser.error("run requires an operator-staged --request")
    # Linux flock is released on death. It prevents concurrent attempts without silently resuming one.
    import fcntl

    with (state / "worker.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        request = json.loads(args.request.read_text(encoding="utf-8"))
        return asyncio.run(run_attempt(client, state, args.config, request,
                                      brief_kind=BriefKind(args.brief_kind)))


if __name__ == "__main__":
    raise SystemExit(main())
