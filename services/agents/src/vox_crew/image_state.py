"""Pure projection of durable per-image checkpoints into the Studio coordinator."""
from copy import deepcopy
import json

from .autonomous_contract import digest
from .provider_usage import summarize_records


def project_image(state, key, branch, usage, *, identity, context_key):
    metadata = state.setdefault("imagePipelines", {})
    previous = metadata.get(key, {})
    for failure in branch.get("modelResponseFailures", []):
        operation = (failure.get("pending") or {}).get("identity")
        if failure.get("step") == "image_intent" and operation not in branch["steps"]:
            state["steps"].pop(operation, None)
    state["steps"].update(deepcopy(branch["steps"]))
    if identity in branch["images"]:
        state["images"][identity] = deepcopy(branch["images"][identity])
    for event in branch["events"][previous.get("eventCount", 0):]:
        state["events"].append({**event, "imageIdentity": identity, "sequence": len(state["events"]) + 1})
    state.setdefault("progressReviews", []).extend(deepcopy(branch.get("progressReviews", [])[previous.get("progressReviewCount", 0):]))
    repairs = branch.get("technicalRepairs", 0)
    state["technicalRepairs"] += repairs - previous.get("technicalRepairs", 0)
    latest = branch["events"][-1] if branch["events"] else {}
    accepted = bool(branch["images"].get(identity) and branch["images"][identity][-1].get("accepted"))
    metadata[key] = {"identity": identity, "contextKey": context_key,
        "eventCount": len(branch["events"]), "phase": latest.get("phase", "image_intent"),
        "progressReviewCount": len(branch.get("progressReviews", [])), "technicalRepairs": repairs,
        "observedAt": latest.get("observedAt"), "pending": deepcopy(branch.get("pending")),
        "usage": usage, "status": "accepted" if accepted else previous.get("status", "running")}


def refresh_image_state(work, state):
    """Recover projections lost between the child save and the coordinator save; no writes."""
    context_key = state.get("imageWorkflow", {}).get("contextKey")
    current_key = digest({"version": 1, "plan": state.get("videoPlan"), "corrections": state.get("imageUserCorrections", {})})
    for identity in state.get("requiredImageIdentities", []):
        if not context_key or context_key != current_key:
            break
        key = digest({"context": context_key, "identity": identity})
        directory = work / "image-pipelines" / key
        checkpoint = directory / "checkpoint.json"
        if not checkpoint.is_file():
            continue
        branch = json.loads(checkpoint.read_text(encoding="utf-8"))
        if branch["videoPlan"] != state["videoPlan"] or branch["runId"] != state["runId"]:
            raise ValueError("The image checkpoint belongs to different production inputs.")
        journal = directory / "provider-calls.jsonl"
        rows = [json.loads(line) for line in journal.read_text(encoding="utf-8").splitlines()] if journal.exists() else []
        project_image(state, key, branch, summarize_records(rows), identity=identity, context_key=context_key)
    journal = work / "provider-calls.jsonl"
    rows = [json.loads(line) for line in journal.read_text(encoding="utf-8").splitlines()] if journal.exists() else []
    if journal.exists() or state.get("imagePipelines"):
        total = summarize_records(rows)
        for branch in state.get("imagePipelines", {}).values():
            usage = branch.get("usage", {})
            for field in ("calls", "searches", "images", "takes"):
                total[field] += usage.get(field, 0)
            total["uncertain"] |= usage.get("uncertain", False)
        state["providerUsage"] = total
    return state
