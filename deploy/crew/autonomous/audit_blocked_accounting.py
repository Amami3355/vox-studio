"""Restore journal-proven repair consumption on a blocked Run, without resuming it."""
import argparse
from datetime import datetime, timezone
import fcntl
from hashlib import sha256
import json
from pathlib import Path
from vox_crew.hosted import HostedProductionClient, write_json

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--submission", required=True)
parser.add_argument("--expected-calls", type=int, required=True)
args = parser.parse_args()
root = Path("/var/lib/vox-crew")
with (root / "worker.lock").open("a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    work = root / "briefs" / sha256(args.submission.encode()).hexdigest()
    path = work / "autonomous-v2.json"
    original = path.read_bytes()
    state = json.loads(original)
    journal = (work / "provider-calls.jsonl").read_bytes()
    rows = [json.loads(line) for line in journal.splitlines()]
    dispatched = [r for r in rows if r["status"] == "dispatched"]
    responded = {r["id"] for r in rows if r["status"] == "responded"}
    assert len(dispatched) == args.expected_calls
    assert all(r["id"] in responded for r in dispatched)
    assert state["schemaVersion"] == 2 and state["terminal"]["status"] == "blocked"
    assert state["pending"]["name"] == "technical_repair" and state["technicalRepairs"] == 0
    assert sum(r["role"] == "PlanRepairAgent" for r in dispatched) == 1
    client = HostedProductionClient(root)
    observed = client.status(state["runId"])
    assert observed.succeeded
    assert {"stage": observed.run.stage, "data": observed.data} == state["productionSnapshot"]
    receipt = {"action": "restore_consumed_repair_without_resume",
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "checkpointSha256": sha256(original).hexdigest(), "journalSha256": sha256(journal).hexdigest(),
        "signedProductionSnapshotVerified": True, "technicalRepairsBefore": 0, "technicalRepairsAfter": 1,
        "totalCalls": len(dispatched), "limits": state["limits"],
        "reason": "The old repair adapter failed assembly after the provider responded, before saving the repair counter or response. Its one technical repair is consumed; the lost response cannot be replayed. The Run remains blocked."}
    archive = work / "reconciliations" / receipt["checkpointSha256"]
    archive.mkdir(parents=True, exist_ok=False)
    (archive / "autonomous-v2.json").write_bytes(original)
    (archive / "provider-calls.jsonl").write_bytes(journal)
    write_json(archive / "receipt.json", receipt)
    write_json(archive / "signed-status.json", json.loads(observed.raw))
    state["technicalRepairs"] = 1
    state.setdefault("accountingReconciliations", []).append(receipt)
    write_json(path, state)
    print(json.dumps(receipt))
