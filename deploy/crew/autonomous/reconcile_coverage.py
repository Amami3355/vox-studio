"""Explicit operator reconciliation of a responded, invalid pre-Run coverage judgement.

Never reconcile uncertain dispatches or Production commands. Preserve the original bytes,
journal, limits and all validated work. The next judgement is another counted model call.
"""
import argparse
from datetime import datetime, timezone
import fcntl
from hashlib import sha256
import json
from pathlib import Path
from vox_crew.hosted import write_json


def reconcile(root, submission, expected_calls, image, step="director.coverage"):
    work = root / "briefs" / sha256(submission.encode()).hexdigest()
    path = work / "autonomous-v2.json"
    original = path.read_bytes()
    state = json.loads(original)
    journal_path = work / "provider-calls.jsonl"
    journal = journal_path.read_bytes()
    rows = [json.loads(line) for line in journal.splitlines()]
    dispatches = [r for r in rows if r["status"] == "dispatched"]
    responded = {r["id"] for r in rows if r["status"] == "responded"}
    assert step in ("director.coverage", "composition")
    expected_roles = {"Director"} if step == "director.coverage" else {"SceneAuthor", "PlanRepairAgent"}
    assert len(dispatches) == expected_calls and dispatches[-1]["role"] in expected_roles
    assert all(r["id"] in responded for r in dispatches), "Uncertain dispatch: reconciliation refused"
    assert state["schemaVersion"] == 2 and state["runId"] is None and state["phase"] == "preparation"
    assert state["terminal"]["status"] == "blocked"
    assert state["terminal"]["reason"].startswith("ContractViolation:")
    assert state["pending"]["name"] == step
    assert not state.get("pendingComposition"), "An unfinished composition role cannot be replayed"
    if step == "composition":
        assert state["contractDiagnostic"]["error"].startswith("scene author output.scenes[")
        assert "unknown fields: component, spansBeats" in state["contractDiagnostic"]["error"]
        assert state["technicalRepairs"] == 0
    repairs_proven = sum(r["role"] == "PlanRepairAgent" for r in dispatches)
    assert repairs_proven <= 1
    assert state["limits"]["maxCalls"] > expected_calls
    receipt = {"observedAt": datetime.now(timezone.utc).isoformat(),
        "action": "reconcile_responded_invalid_preparation", "step": step, "submissionId": submission,
        "checkpointSha256": sha256(original).hexdigest(), "journalSha256": sha256(journal).hexdigest(),
        "priorTerminal": state["terminal"], "priorPending": state["pending"],
        "respondedCallIds": [r["id"] for r in dispatches], "limits": state["limits"],
        "technicalRepairsBefore": state["technicalRepairs"],
        "technicalRepairsAfter": max(state["technicalRepairs"], repairs_proven),
        "crewImage": image,
        "reason": "The named preparation step responded but failed validation. Resume after a tested contract-boundary fix; retain every prior dispatch, ceiling and validated result. Lost role responses may require additional counted calls."}
    archive = work / "reconciliations" / receipt["checkpointSha256"]
    archive.mkdir(parents=True, exist_ok=False)
    (archive / "autonomous-v2.json").write_bytes(original)
    (archive / "provider-calls.jsonl").write_bytes(journal)
    write_json(archive / "receipt.json", receipt)
    state.setdefault("reconciliations", []).append(receipt)
    state["technicalRepairs"] = receipt["technicalRepairsAfter"]
    state["pending"] = None
    state["terminal"] = None
    write_json(path, state)
    assert journal_path.read_bytes() == journal
    print(json.dumps({k: receipt[k] for k in ("action", "checkpointSha256", "journalSha256", "limits")}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, default=Path("/var/lib/vox-crew"))
    parser.add_argument("--submission", required=True)
    parser.add_argument("--expected-calls", type=int, required=True)
    parser.add_argument("--crew-image", required=True)
    parser.add_argument("--step", choices=("director.coverage", "composition"), default="director.coverage")
    args = parser.parse_args()
    with (args.state / "worker.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        reconcile(args.state, args.submission, args.expected_calls, args.crew_image, args.step)
