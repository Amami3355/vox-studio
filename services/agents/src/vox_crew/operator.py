"""Explicit hosted operator actions: exact image grants/decisions and verified media export.

No paid action retries. The operator inspects the same Run after an uncertain response.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .envelopes import ArtifactDescriptor
from .hosted import HostedProductionClient, persistent_root, write_json


def export_artifacts(client, run_id: str, output: Path) -> dict:
    status = client.status(run_id)
    if not status.succeeded:
        raise ValueError("Production refused the Run status.")
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "status.json", json.loads(status.raw))
    descriptors = (json.loads(status.raw).get("data") or {}).get("artifacts", [])
    files = []
    for entry in descriptors:
        descriptor = ArtifactDescriptor(kind=entry["kind"], path=entry["path"], sha256=entry["sha256"])
        artifact = client.fetch_artifact(run_id, descriptor)
        # Never resolve an artifact path from a remote descriptor on the operator filesystem.
        suffix = Path(descriptor.path).suffix
        filename = descriptor.sha256 + (suffix if suffix in {".json", ".mp4", ".png", ".mp3"} else ".bin")
        (output / filename).write_bytes(artifact.data)
        files.append({**entry, "exportedAs": filename})
    result = {"runId": run_id, "signedStatusVerified": True, "artifactDigestsVerified": True, "files": files}
    write_json(output / "index.json", result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("status", "image-start", "image-status", "image-accept", "image-reject", "export"))
    parser.add_argument("--state", type=Path, default=Path("/var/lib/vox-crew"))
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--request", type=Path)
    parser.add_argument("--grant", type=Path)
    parser.add_argument("--job-id")
    parser.add_argument("--sha256")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    client = HostedProductionClient(persistent_root(args.state))
    if args.action == "export":
        if args.output is None:
            parser.error("export requires --output")
        print(json.dumps(export_artifacts(client, args.run_id, args.output)))
        return 0
    if args.action == "status":
        result = client.status(args.run_id)
    elif args.action == "image-start":
        if args.request is None or args.grant is None:
            parser.error("image-start requires the exact --request and signed --grant")
        request = json.loads(args.request.read_text())
        grant = json.loads(args.grant.read_text())
        if request["runId"] != args.run_id or grant["runId"] != args.run_id:
            raise ValueError("Image request and grant must belong to this Run.")
        result = client.image_start(args.run_id, request["request"], grant)
    else:
        if not args.job_id:
            parser.error("image actions require --job-id")
        if args.action == "image-status":
            result = client.image_status(args.run_id, args.job_id)
        elif args.action == "image-accept":
            if not args.sha256:
                parser.error("Accept the viewed candidate using --sha256")
            result = client.image_accept(args.run_id, {"protocolVersion": 1, "jobId": args.job_id,
                                                      "candidateSha256": args.sha256})
        else:
            result = client.image_reject(args.run_id, {"protocolVersion": 1, "jobId": args.job_id})
    if args.output:
        write_json(args.output, json.loads(result.raw))
    print(result.raw)
    return 0 if result.succeeded else 1


if __name__ == "__main__":
    raise SystemExit(main())
