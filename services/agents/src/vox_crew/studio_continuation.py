"""Trusted worker authorization and archived, idempotent application of user corrections."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import hmac
import json
import os

from .autonomous_contract import digest
from .hosted import write_json
from .provider_usage import summarize_records
from .studio_controls import apply_correction, validate_resume, effective_limits
from .studio_projection import read_json
from .studio_store import StudioConflict
from .wire import canonical_json


def checkpoint_view(work):
    state = read_json(work / "autonomous-v2.json")
    if state is not None:
        from .image_state import refresh_image_state
        refresh_image_state(work, state)
    return state


def observed_snapshot(client, run_id):
    envelope = client.status(run_id)
    if not envelope.succeeded or not envelope.run or envelope.run.id != run_id:
        raise StudioConflict("Production status could not be verified. No provider work was started.")
    return {"stage": envelope.run.stage, "data": envelope.data}


def signed_authorization(path, *, decision_id, state, limits):
    old = read_json(path)
    if old:
        if old["decisionId"] != decision_id or old["limits"] != limits or old["runId"] != state["runId"]:
            raise StudioConflict("The saved authorization does not match this correction.")
        return old
    key = os.environ.get("VOX_STUDIO_AUTHORIZATION_KEY", "")
    if len(key.encode()) < 32:
        raise StudioConflict("Studio budget authorization is not configured on the worker. Your choices are saved.")
    now = datetime.now(timezone.utc)
    unsigned = {"schemaVersion": 1, "decisionId": decision_id, "runId": state["runId"],
        "requestSha256": digest({"protocolVersion": 1, "purpose": "production-request", "value": state["originalRequest"]}),
        "previousDecisionId": (state.get("studioAuthorization") or {}).get("decisionId"),
        "limits": limits, "issuedAt": now.isoformat(), "expiresAt": None}
    value = {**unsigned, "signature": hmac.new(key.encode(), canonical_json(unsigned).encode(), sha256).hexdigest()}
    write_json(path, value)
    return value


def without_authorization(snapshot):
    value = deepcopy(snapshot)
    value["data"].pop("studioAuthorization", None)
    # The authorization is a successful command; it does not change media or stage.
    value["data"].pop("lastOutcome", None)
    return value


def install_authorization(client, state, authorization):
    before = state["productionSnapshot"]
    observed = observed_snapshot(client, state["runId"])
    if observed != before:
        if observed["data"].get("studioAuthorization") != authorization or without_authorization(observed) != without_authorization(before):
            raise StudioConflict("Production changed since the saved correction. Reconcile the same run before continuing.")
    else:
        response = client.authorize(state["runId"], authorization)
        if not response.succeeded or response.data.get("authorization") != authorization:
            reason = response.error.message if response.error else "The authorization was not accepted."
            raise StudioConflict(reason)
        observed = observed_snapshot(client, state["runId"])
    if observed["data"].get("studioAuthorization") != authorization or without_authorization(observed) != without_authorization(before):
        raise StudioConflict("Production did not confirm the unchanged work and selected limits.")
    return observed


def archive_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise StudioConflict("The archived recovery evidence differs from the current work.")
        return
    with path.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def prepare_continuation(store, job, crew_work, client):
    decision = store.continuation(job["id"])
    if not decision or decision["status"] != "pending":
        return checkpoint_view(crew_work)
    if decision["request"].get("start"):
        return checkpoint_view(crew_work)
    state = checkpoint_view(crew_work)
    if state is None:
        raise StudioConflict("The original production checkpoint is missing.")
    if any(row["id"] == decision["id"] for row in state.get("userCorrections", [])):
        # Crash after atomic checkpoint adoption but before marking the database decision applied.
        if observed_snapshot(client, state["runId"]) != state["productionSnapshot"]:
            raise StudioConflict("Production changed after correction adoption. Reconciliation is required.")
        store.complete_continuation(decision["id"])
        return state
    validate_resume(state, decision["request"])
    evidence = store.work(job["id"]) / "continuations" / decision["id"]
    archive_bytes(evidence / "checkpoint-before.json", (crew_work / "autonomous-v2.json").read_bytes())
    journal_path = crew_work / "provider-calls.jsonl"
    archive_bytes(evidence / "provider-calls-before.jsonl", journal_path.read_bytes() if journal_path.exists() else b"")
    write_json(evidence / "decision.json", decision)
    if state.get("imageWorkflow") and decision["request"]["correction"]["target"] == "continue":
        from .image_workflow import reconcile_saved_images
        state = reconcile_saved_images(crew_work, state, client)
    initial = read_json(store.work(job["id"]) / "initial-authorization.json")
    if not state.get("studioAuthorization") and initial:
        # The first authorization may have committed before its response was lost.
        state["productionSnapshot"] = install_authorization(client, state, initial)
        state["studioAuthorization"] = initial
    authorization = signed_authorization(evidence / "authorization.json", decision_id=decision["id"],
        state=state, limits=(read_json(evidence / "authorization.json") or {}).get("limits", effective_limits(state)))
    snapshot = install_authorization(client, state, authorization)
    revised = apply_correction(state, decision, authorization)
    revised["productionSnapshot"] = snapshot
    write_json(crew_work / "autonomous-v2.json", revised)
    write_json(store.work(job["id"]) / "checkpoint.json", revised)
    store.complete_continuation(decision["id"])
    return revised
