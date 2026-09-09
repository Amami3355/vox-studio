"""ADK schedules independent images; durable Production jobs own paid effects.

Each image has its own checkpoint, model context and provider journal. Only the
coordinator updates the Studio projection, on the event-loop thread. Capacity is
released between generation and review so another image can start immediately.
"""
from __future__ import annotations

import asyncio
from copy import copy, deepcopy
import json
import os
from google.adk import Context

from .autonomous_contract import digest, checked, IMAGE_INTENT, MEDIA_REVIEW, PROGRESS_REVIEW
from .hosted import write_json
from .provider_usage import ProviderJournal, finish_call
from .image_state import project_image, refresh_image_state


def capacity_setting(name):
    value = int(os.environ.get(name, "2"))
    if not 1 <= value <= 16:
        raise ValueError(f"{name} must be between 1 and 16")
    return value


def assert_image_only_transition(saved, observed):
    """Parallel jobs may add candidate descriptors and stale image consumers only."""
    from .autonomous import AutonomousBlocked
    def fixed(snapshot):
        snapshot = deepcopy(snapshot)
        data = snapshot.get("data", {})
        data["artifacts"] = [a for a in data.get("artifacts", []) if a.get("kind") != "generated_image_candidate"]
        data.pop("lastOutcome", None)
        data["staleStages"] = [s for s in data.get("staleStages", []) if s not in ("compiled", "rendered")]
        return snapshot
    if not saved or fixed(saved) != fixed(observed):
        raise AutonomousBlocked("Production inputs or authorization changed during image processing.")


async def reconcile_image_step(child):
    """Observe paid work first; a missing response never authorizes another dispatch."""
    from .autonomous import AutonomousBlocked
    from .adk_roles import _json_answer
    from .autonomous_roles import resolve_renderer_elements
    from .crew_contract import ContractViolation
    from .model_output import recovery_output_tokens
    from .model_recovery import completed_model_calls, ModelResponseInvalid

    dispatched = [r for r in child.journal.records if r["status"] == "dispatched"]
    answered = {r["id"]: r for r in child.journal.records if r["status"] == "responded"}
    opened = [r for r in dispatched if r["id"] not in answered]
    # Older reconciliation cached a raw V3 intention even after semantic refusal.
    # Recover only a cache entry proved to be that exact answered operation.
    if not child.state.get("pending") and not opened:
        for operation, old in reversed(list(child.state["steps"].items())):
            if old.get("name") != "image_intent":
                continue
            saved = {"name": "image_intent", "identity": operation, "dependencies": old["dependencies"]}
            context = saved["dependencies"].get("context", {})
            if context.get("imagePromptVersion") != 3 or not any(
                    isinstance(r, dict) for r in old["result"].get("rendererElements", [])):
                continue
            call = next((r for r in reversed(dispatched) if r.get("operationId") == saved["identity"]), None)
            if call is None:
                continue
            raw = _json_answer("".join(p["text"] for p in answered[call["id"]].get("answerParts", [])), "ImageCreator")
            if old["result"] == raw and any(isinstance(r, dict) for r in raw.get("rendererElements", [])):
                child.state["pending"] = deepcopy(saved)
                child.state["steps"].pop(saved["identity"])
                break
    pending = child.state.get("pending")
    if not pending:
        if child.journal.summary()["uncertain"]:
            raise AutonomousBlocked("An image provider result is unknown. Reconciliation is required.")
        return
    name, dependencies = pending["name"], pending["dependencies"]
    if pending["identity"] != digest({"name": name, "dependencies": dependencies}):
        raise AutonomousBlocked("The saved image operation identity changed.")
    if name == "production.image_start":
        # No journal entry means capacity was awaited, but no call was dispatched.
        if not opened and not any(r.get("operationId") == pending["identity"] for r in dispatched):
            child.state["pending"] = None
            child.save()
            return
        envelope = await child.observe_image(dependencies["args"][1])
        job = envelope.data.get("job") or {}
        if job.get("status") not in ("candidate", "accepted", "rejected", "failed"):
            raise AutonomousBlocked("The image generation result remains unknown; no duplicate was started.")
        for row in opened:
            if row["role"] != "ImageGeneration":
                raise AutonomousBlocked("An unrelated provider call is unfinished.")
            finish_call(row["id"], imageConsumption=job.get("consumption"),
                        providerOutcome="failed" if job["status"] == "failed" else "responded")
        result = json.loads(envelope.raw)
    elif name in ("production.image_accept", "production.image_reject"):
        decision = dependencies["args"][1]
        envelope = await asyncio.to_thread(child.client.image_status, child.state["runId"], decision["jobId"])
        job = envelope.data.get("job") or {}
        expected = "accepted" if name.endswith("accept") else "rejected"
        if job.get("candidate", {}).get("artifact", {}).get("sha256") != decision["candidateSha256"]:
            raise AutonomousBlocked("The saved image decision refers to different bytes.")
        if job.get("status") == "candidate":
            child.state["pending"] = None
            child.save()
            return
        if job.get("status") != expected:
            raise AutonomousBlocked("The saved image decision conflicts with Production.")
        result = json.loads(envelope.raw)
        result["command"] = "run.image.accept" if expected == "accepted" else "run.image.reject"
    else:
        if opened:
            raise AutonomousBlocked("An image model response is unknown; no duplicate call was started.")
        call = next((r for r in reversed(dispatched) if r.get("operationId") == pending["identity"]), None)
        if call is None:
            child.state["pending"] = None
            child.save()
            return
        response = answered[call["id"]]
        schemas = {"image_intent": IMAGE_INTENT, "image_review": MEDIA_REVIEW, "progress": PROGRESS_REVIEW}
        if (name not in schemas or response.get("providerOutcome") == "failed"
                or response.get("finishReason") not in (None, "STOP", "MAX_TOKENS")):
            raise AutonomousBlocked("The saved image model response requires repair before resuming.")
        try:
            if response.get("finishReason") == "MAX_TOKENS":
                raise ModelResponseInvalid("The saved image model response ended with MAX_TOKENS.")
            value = _json_answer("".join(p["text"] for p in response.get("answerParts", [])), call["role"])
            context = dependencies.get("context", {})
            result = (resolve_renderer_elements(value, context["videoPlan"])
                if name == "image_intent" and context.get("imagePromptVersion") == 3
                else checked(schemas[name], value))
        except ContractViolation as error:
            evidence = completed_model_calls(child.journal, child.journal.records.index(call))
            if not evidence:
                raise AutonomousBlocked("The saved image model response requires reconciliation.") from None
            # A received, unusable answer is a known failure, not a completed step.
            # Explicit continuation may repair it; this observer never dispatches.
            failures = child.state.setdefault("modelResponseFailures", [])
            if not any(call["id"] in {c["id"] for c in f["calls"]} for f in failures):
                failures.append({"step": name, "pending": deepcopy(pending), "pendingComposition": None,
                    "calls": evidence, "diagnostic": str(error)})
            if (child.state.get("pendingModelRecovery") or {}).get("step") != name:
                child.state["pendingModelRecovery"] = {"step": name, "context": {
                    "maxOutputTokens": recovery_output_tokens(evidence, grow=isinstance(error, ModelResponseInvalid)),
                    "validationError": str(error)[:2000]}}
            child.state["pending"] = None
            child.save()
            return
        if (child.state.get("pendingModelRecovery") or {}).get("step") == name:
            child.state.pop("pendingModelRecovery")
    child.state["steps"][pending["identity"]] = {"name": name, "dependencies": dependencies, "result": result}
    child.state["pending"] = None
    child.state["productionSnapshot"] = await asyncio.to_thread(child.snapshot)
    child.save()


def reconcile_saved_images(work, state, client):
    """Explicit continuation reconciles local evidence and Production; never calls a model."""
    from .autonomous import AutonomousRun, AutonomousBlocked
    from .studio_store import StudioConflict
    revised = deepcopy(state)
    observed = client.status(state["runId"])
    if not observed.succeeded or not observed.run or observed.run.id != state["runId"]:
        raise StudioConflict("Production could not verify the saved image work.")
    snapshot = {"stage": observed.run.stage, "data": observed.data}
    try:
        assert_image_only_transition(state["productionSnapshot"], snapshot)
        for key, branch in state.get("imagePipelines", {}).items():
            if branch["contextKey"] != state["imageWorkflow"]["contextKey"]:
                continue
            directory = work / "image-pipelines" / key
            child = AutonomousRun.__new__(AutonomousRun)
            child.client, child.work, child.path = client, directory, directory / "checkpoint.json"
            child.state = json.loads(child.path.read_text(encoding="utf-8"))
            child.on_snapshot = child.stop_requested = None
            child.journal = ProviderJournal(directory / "provider-calls.jsonl", max_calls=None,
                max_grounded_calls=None, reconcile_pending=True)

            async def observe(request):
                # A read-only continuation must not wait indefinitely on a dead dispatch.
                envelope = await asyncio.to_thread(client.image_status, state["runId"], child.image_job_id(request))
                job = envelope.data.get("job") or {}
                if (not envelope.succeeded or job.get("id") != child.image_job_id(request)
                        or job.get("requestSha256") != request["requestSha256"]):
                    raise AutonomousBlocked("The existing image generation could not be verified.")
                return envelope

            child.observe_image = observe
            with child.journal:
                asyncio.run(reconcile_image_step(child))
        revised["productionSnapshot"] = snapshot
        return refresh_image_state(work, revised)
    except AutonomousBlocked as error:
        raise StudioConflict(str(error)) from None


async def run_image_workflow(parent, requirements):
    from google.adk.apps import App, ResumabilityConfig
    from google.adk.runners import Runner
    from google.adk.sessions import DatabaseSessionService
    from google.adk.workflow import START, Workflow, node
    from google.genai import types
    from .autonomous import AutonomousBlocked

    parent.work.mkdir(parents=True, exist_ok=True)
    parent.coordinating_images = True
    capacities = {"production.image_start": asyncio.Semaphore(capacity_setting("VOX_IMAGE_CONCURRENCY")),
                  "image_review": asyncio.Semaphore(capacity_setting("VOX_IMAGE_REVIEW_CONCURRENCY")),
                  "image_intent": asyncio.Semaphore(2), "progress": asyncio.Semaphore(2)}
    context_key = digest({"version": 1, "plan": parent.state["videoPlan"],
                          "corrections": parent.state.get("imageUserCorrections", {})})
    metadata = parent.state.setdefault("imagePipelines", {})
    failures = []
    by_identity = {r.identity: r for r in requirements}

    async def process(identity):
        history = parent.state["images"].get(identity, [])
        if history and history[-1].get("accepted"):
            return {"identity": identity, "status": "accepted"}
        key = digest({"context": context_key, "identity": identity})
        directory = parent.work / "image-pipelines" / key
        directory.mkdir(parents=True, exist_ok=True)
        child = copy(parent)
        child.work, child.path = directory, directory / "checkpoint.json"
        child.capacities = capacities
        child.state = json.loads(child.path.read_text()) if child.path.exists() else deepcopy(parent.state)
        child.state.pop("imagePipelines", None)
        child.state.pop("imageWorkflow", None)
        if not child.path.exists():
            child.state.update(pending=None, terminal=None, events=[], progressReviews=[], technicalRepairs=0)
        if child.state["videoPlan"] != parent.state["videoPlan"]:
            raise AutonomousBlocked("An image pipeline cannot resume against a different plan.")
        child.director = parent.director.fork(directory / "role-outputs") if hasattr(parent.director, "fork") else parent.director
        child.planner = copy(parent.planner)
        child.planner.repairs_spent = child.state["technicalRepairs"]
        child.journal = ProviderJournal(directory / "provider-calls.jsonl", max_calls=None,
            max_grounded_calls=None, reconcile_pending=True)
        child.journal.stop_requested = parent.stop_requested
        child.journal.expires_at = (parent.state.get("studioAuthorization") or {}).get("expiresAt")
        child.journal.operation_identity = lambda: (child.state.get("pending") or {}).get("identity")

        def project(state):
            project_image(parent.state, key, state, child.journal.summary(), identity=identity, context_key=context_key)
            parent.planner.repairs_spent = parent.state["technicalRepairs"]
            parent.save()

        child.on_snapshot = project
        with child.journal:
            try:
                await reconcile_image_step(child)
                child.state["studioAuthorization"] = deepcopy(parent.state.get("studioAuthorization"))
                child.state["productionSnapshot"] = deepcopy(parent.state.get("productionSnapshot"))
                metadata.setdefault(key, {})["status"] = "running"
                await child.image_requirement(by_identity[identity])
                child.save()
                return {"identity": identity, "status": "accepted"}
            except Exception as error:
                child.save()
                metadata[key]["status"] = "blocked"
                parent.save()
                failures.append(error)
                return {"identity": identity, "status": "blocked"}

    # ADK records stable per-image activations; effects remain deduplicated by the
    # independent checkpoint and Production job even if an activation is replayed.
    async def image_node(ctx: Context, identity: str):
        try:
            return await process(identity)
        except Exception as error:
            # A malformed branch checkpoint must not cancel other paid calls in flight.
            failures.append(error)
            return {"identity": identity, "status": "blocked"}

    worker = node(image_node, name="image", parameter_binding="node_input")

    async def supervise(ctx: Context):
        tasks = [ctx.run_node(worker, {"identity": identity}, run_id=digest(identity)) for identity in by_identity]
        return await asyncio.gather(*tasks)

    supervisor = node(supervise, name="images", rerun_on_resume=True)
    workflow = Workflow(name="image_workflow", edges=[(START, supervisor)])
    app = App(name="vox_images", root_agent=workflow, resumability_config=ResumabilityConfig(is_resumable=True))
    sessions = DatabaseSessionService(db_url="sqlite+aiosqlite:///" + (parent.work / "image-workflow.sqlite3").resolve().as_posix())
    saved = parent.state.get("imageWorkflow")
    if saved and saved["contextKey"] != context_key and saved.get("invocationId"):
        raise AutonomousBlocked("The interrupted image workflow must be reconciled before changing its plan.")
    if not saved or saved["contextKey"] != context_key:
        saved = {"version": 1, "contextKey": context_key, "sessionId": context_key, "invocationId": None}
        parent.state["imageWorkflow"] = saved
    try:
        session = await sessions.get_session(app_name="vox_images", user_id="studio", session_id=saved["sessionId"])
        if session is None:
            if saved.get("invocationId"):
                raise AutonomousBlocked("The durable ADK image session is missing.")
            await sessions.create_session(app_name="vox_images", user_id="studio", session_id=saved["sessionId"])
        runner = Runner(app=app, session_service=sessions)
        args = {"invocation_id": saved["invocationId"]} if saved.get("invocationId") else {
            "new_message": types.Content(role="user", parts=[types.Part(text="Produce the saved image requirements.")])}
        async for event in runner.run_async(user_id="studio", session_id=saved["sessionId"], **args):
            if saved["invocationId"] != event.invocation_id:
                saved["invocationId"] = event.invocation_id
                parent.save()
        saved["invocationId"] = None
    finally:
        await sessions.close()
        parent.state["productionSnapshot"] = await asyncio.to_thread(parent.snapshot)
        parent.save()
    if failures:
        from .autonomous import ImageReviewNeedsAction
        from .model_recovery import ModelRecoveryStalled
        # All branches have settled. Preserve an intervention requirement even if
        # another image failed first, so Continue cannot replay a known dead end.
        # Unknown outcomes stay in their branch journals and remain non-repeatable.
        raise next((error for error in failures
                    if isinstance(error, (ImageReviewNeedsAction, ModelRecoveryStalled))), failures[0])
    if any(not parent.state["images"].get(i) or not parent.state["images"][i][-1].get("accepted") for i in by_identity):
        raise AutonomousBlocked("Some illustrations need attention. Accepted images are saved.")
