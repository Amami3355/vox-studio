"""Read checkpoint/accounting summaries from a read-only crew-state mount; never dispatch."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
from uuid import UUID

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--state", type=Path, default=Path("/var/lib/vox-crew"))
parser.add_argument("--job", required=True)
args = parser.parse_args()
job = str(UUID(args.job))
work = args.state / "briefs" / sha256(("studio-" + job).encode()).hexdigest()
checkpoint = work / "autonomous-v2.json"
if not checkpoint.is_file():
    print(json.dumps({"job": job, "checkpoint": "absent"}))
else:
    data = checkpoint.read_bytes()
    state = json.loads(data)
    journal = work / "provider-calls.jsonl"
    lines = journal.read_text(encoding="utf-8").splitlines(keepends=True) if journal.is_file() else []
    rows = [json.loads(line) for line in lines if line.endswith("\n")]
    calls = [row for row in rows if row["status"] == "dispatched"]
    responses = {row["id"]: row for row in rows if row["status"] == "responded"}
    print(json.dumps({"job": job, "runId": state.get("runId"), "phase": state["phase"],
        "terminal": state.get("terminal"), "pendingStep": (state.get("pending") or {}).get("name"),
        "checkpointSha256": sha256(data).hexdigest(), "limits": state["limits"],
        "calls": len(calls), "searches": sum(row["grounded"] for row in calls),
        "imageCommands": sum(row["role"] == "ImageGeneration" for row in calls),
        "takes": sum(row["role"] == "Recording" for row in calls),
        "pendingProviders": [{"id": row["id"], "role": row["role"]} for row in calls if row["id"] not in responses],
        "lastEvent": state["events"][-1] if state["events"] else None,
        "technicalRepairs": state["technicalRepairs"], "editorialCorrections": state["editorialCorrections"]}))
