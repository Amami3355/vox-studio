"""Independent durable Studio worker and operator admission tools. No work starts at HTTP admission."""
from __future__ import annotations

import argparse
import asyncio
from contextlib import contextmanager, ExitStack
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import time

from .autonomous_contract import digest
from .autonomous_entry import prompt_request, submit_prompt
from .envelopes import ArtifactDescriptor
from .hosted import HostedProductionClient, write_json
from .studio_projection import read_json
from .studio_store import StudioConflict, StudioStore


@contextmanager
def worker_lock(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as stream:
        if os.name == "nt":
            import msvcrt
            if path.stat().st_size == 0:
                stream.write(b"0")
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == "nt":
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)


def prepared_request(job, config):
    defaults = read_json(config / "prompt-defaults.json")
    request = prompt_request(job["request"]["text"], defaults, duration=job["request"]["duration"],
                             submission_id="studio-" + job["id"], production_limits=job["request"].get("limits"))
    return request, digest({"protocolVersion": 1, "purpose": "production-request", "value": request})


def authorize(store, job_id, config, envelope):
    job = store.get(job_id)
    if job["recorded"]:
        raise StudioConflict("Recorded evidence cannot authorize a new production.")
    request, request_sha = prepared_request(job, config)
    if (set(envelope) != {"schemaVersion", "requestSha256", "maxImages", "expiresAt"}
            or envelope["schemaVersion"] != 1 or envelope["requestSha256"] != request_sha
            or type(envelope["maxImages"]) is not int
            or envelope["maxImages"] != request["brief"]["maxGeneratedImages"]
            or datetime.fromisoformat(envelope["expiresAt"].replace("Z", "+00:00")) <= datetime.now(timezone.utc)):
        raise StudioConflict("Authorization must match this exact request, image ceiling and future expiry.")
    work = store.work(job_id)
    old = read_json(work / "authorization.json")
    if old is not None and old != envelope:
        raise StudioConflict("An existing authorization cannot be replaced.")
    write_json(work / "authorization.json", envelope)
    write_json(work / "production-request.json", request)
    store.transition(job_id, "awaiting_authorization", "queued", "Budget authorized. Waiting for the production worker.")


def save_media(work, data, descriptor, *, fully_decoded=False):
    if sha256(data).hexdigest() != descriptor["sha256"]:
        raise ValueError("Media digest does not match the published descriptor.")
    path = work / "media" / descriptor["sha256"]
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        temporary = path.with_suffix(".partial")
        with temporary.open("wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    rows = read_json(work / "media.json", [])
    entry = {"kind": descriptor["kind"], "sha256": descriptor["sha256"], "fullyDecoded": fully_decoded}
    previous = next((row for row in rows if row["sha256"] == entry["sha256"]), None)
    if previous is None:
        rows.append(entry)
    elif fully_decoded:
        previous["fullyDecoded"] = True
    write_json(work / "media.json", rows)
    return path


def decode_video(path):
    subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(path), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
                   check=True, capture_output=True, timeout=240)


class StudioExecution:
    def __init__(self, store, job, client):
        self.store, self.job, self.client = store, job, client
        self.work = store.work(job["id"])
        self.downloaded = {row["sha256"] for row in read_json(self.work / "media.json", [])}

    def snapshot(self, state):
        write_json(self.work / "checkpoint.json", state)
        descriptors = []
        for step in state.get("steps", {}).values():
            if step["name"] == "production.image_start":
                candidate = (step["result"].get("data", {}).get("job") or {}).get("candidate")
                if candidate:
                    descriptors.append(candidate["artifact"])
            if step["name"] == "production.render":
                descriptors.extend(d for d in step["result"].get("artifacts", []) if d["kind"] == "preview")
        for history in state.get("images", {}).values():
            descriptors.extend(row["job"]["candidate"]["artifact"] for row in history)
        for descriptor in descriptors:
            if descriptor["sha256"] not in self.downloaded:
                artifact = self.client.fetch_artifact(state["runId"], ArtifactDescriptor(**descriptor))
                save_media(self.work, artifact.data, descriptor)
                self.downloaded.add(descriptor["sha256"])

    async def image_review(self, artifact, intention):
        descriptor = {"kind": "generated_image_candidate", "sha256": artifact.sha256}
        save_media(self.work, artifact.data, descriptor)
        self.downloaded.add(artifact.sha256)
        write_json(self.work / "awaiting-image.json", {"sha256": artifact.sha256, "meaning": intention["meaning"]})
        job = self.store.get(self.job["id"])
        self.store.transition(job["id"], job["status"], "awaiting_image", "The crew reviewed this image. Your approval is needed before it enters the film.")
        while True:
            decision = self.store.decision(job["id"], artifact.sha256)
            if decision:
                self.store.transition(job["id"], "awaiting_image", "running", "Image decision saved. Production is continuing.")
                return decision
            await asyncio.sleep(1)

    async def run(self, crew_state, config):
        request = self.job["request"]
        from .studio_continuation import (checkpoint_view, install_authorization,
            prepare_continuation, signed_authorization)
        from .studio_controls import effective_limits
        decision = self.store.continuation(self.job["id"])
        startup_limits = effective_limits({})
        configured_job = {**self.job, "request": {**request, **({"limits": startup_limits} if startup_limits else {})}}
        production_request, _ = prepared_request(configured_job, config)
        saved_request = read_json(self.work / "production-request.json")
        if saved_request:
            production_request = saved_request
        elif startup_limits:
            write_json(self.work / "production-request.json", production_request)
        brief = production_request["brief"]
        if (brief["id"] != "studio-" + self.job["id"] or brief["text"] != request["text"]
                or brief["durationSeconds"] != request["duration"]):
            raise StudioConflict("The saved Production request differs from this Brief. No work was started.")
        crew_work = crew_state / "briefs" / sha256(production_request["brief"]["id"].encode()).hexdigest()
        state = await asyncio.to_thread(prepare_continuation, self.store, self.job, crew_work, self.client)
        selected = effective_limits(state) if state and state.get("studioAuthorization") else startup_limits
        if selected:
            async def ensure_authorization(run):
                if run.state.get("studioAuthorization"):
                    existing = run.state["studioAuthorization"]
                    if run.state.get("productionSnapshot", {}).get("data", {}).get("studioAuthorization") != existing:
                        raise StudioConflict("Production authorization changed. Reconciliation is required.")
                    if existing["limits"] != selected or existing.get("expiresAt") is not None:
                        from uuid import uuid5, NAMESPACE_URL
                        from .studio_continuation import archive_bytes
                        migration = self.work / "unlimited" / existing["decisionId"]
                        archive_bytes(migration / "checkpoint-before.json", run.path.read_bytes())
                        authorization = signed_authorization(migration / "authorization.json",
                            decision_id=str(uuid5(NAMESPACE_URL, "vox-unlimited:" + existing["decisionId"])),
                            state=run.state, limits=selected)
                        run.state["productionSnapshot"] = install_authorization(self.client, run.state, authorization)
                        run.state["studioAuthorization"] = authorization
                        run.save()
                    if decision and decision["request"].get("start"):
                        self.store.complete_continuation(decision["id"])
                    return
                if run.state.get("pending"):
                    raise StudioConflict("An unfinished action must be reconciled before authorizing production.")
                if not run.state["runId"]:
                    run.require_success(await run.command("init", production_request))
                initial = read_json(self.work / "initial-authorization.json")
                authorization = signed_authorization(self.work / "initial-authorization.json",
                    decision_id=self.job["id"], state=run.state, limits=initial["limits"] if initial else selected)
                run.state["productionSnapshot"] = install_authorization(self.client, run.state, authorization)
                run.state["studioAuthorization"] = authorization
                run.save()
                if authorization["limits"] != selected or authorization.get("expiresAt") is not None:
                    await ensure_authorization(run)
                if decision and decision["request"].get("start"):
                    self.store.complete_continuation(decision["id"])
            await submit_prompt(self.client, crew_state, config, request["text"], duration=request["duration"],
                language=request["language"], submission_id="studio-" + self.job["id"],
                on_snapshot=self.snapshot, stop_requested=lambda: self.store.stop_requested(self.job["id"]),
                production_limits=selected, original_request=production_request, authorize_hook=ensure_authorization)
        else:
            await self.run_legacy(crew_state, config)
        self.finish()

    async def run_legacy(self, crew_state, config):
        request = self.job["request"]
        _, request_sha = prepared_request(self.job, config)
        authorization = read_json(self.work / "authorization.json", {})
        if (authorization.get("requestSha256") != request_sha or
                datetime.fromisoformat(authorization["expiresAt"].replace("Z", "+00:00")) <= datetime.now(timezone.utc)):
            raise StudioConflict("The production authorization is absent, changed or expired.")
        await submit_prompt(self.client, crew_state, config, request["text"], duration=request["duration"],
                            language=request["language"], submission_id="studio-" + self.job["id"],
                            on_snapshot=self.snapshot, image_review_hook=self.image_review)

    def finish(self):
        state = read_json(self.work / "checkpoint.json")
        terminal = state["terminal"]
        if terminal["status"] in ("ready", "reviewed"):
            if any(not rows or not rows[-1].get("accepted") for rows in state["images"].values()):
                raise ValueError("A delivered film cannot have missing or rejected images.")
            descriptor = terminal["preview"]
            expected = terminal.get("verifiedSha256") if terminal["status"] == "ready" else terminal.get("reviewedSha256")
            if descriptor["sha256"] != expected:
                raise ValueError("Film delivery refers to different bytes.")
            artifact = self.client.fetch_artifact(state["runId"], ArtifactDescriptor(**descriptor))
            path = save_media(self.work, artifact.data, descriptor)
            if terminal["status"] == "reviewed":
                decode_video(path)
            elif terminal.get("technicalVerification") != {"sha256": expected, "fullyDecoded": True}:
                raise ValueError("Film delivery requires completed technical verification.")
            save_media(self.work, artifact.data, descriptor, fully_decoded=True)
        current = self.store.get(self.job["id"])
        self.store.transition(self.job["id"], current["status"], terminal["status"],
                              terminal.get("reason", "Your film is ready to watch and download."))


def run_worker(store, crew_state, config, *, once=False):
    # Also owns the existing crew lock, so a legacy CLI cannot overlap this worker.
    with ExitStack() as locks:
        locks.enter_context(worker_lock(store.root / "worker.lock"))
        locks.enter_context(worker_lock(crew_state / "worker.lock"))
        store.interrupted()
        client = HostedProductionClient(crew_state)
        from .studio_continuation import checkpoint_view
        for saved in store.list():
            if saved["recorded"]:
                continue
            work = crew_state / "briefs" / sha256(("studio-" + saved["id"]).encode()).hexdigest()
            state = checkpoint_view(work)
            if state is not None:
                write_json(store.work(saved["id"]) / "checkpoint.json", state)
        while True:
            job = store.claim()
            if job:
                try:
                    asyncio.run(StudioExecution(store, job, client).run(crew_state, config))
                except Exception as error:
                    current = store.get(job["id"])
                    store.transition(job["id"], current["status"], "interrupted",
                                     str(error) if isinstance(error, StudioConflict) else
                                     "Production stopped. The saved state must be inspected before resuming.")
                    write_json(store.work(job["id"]) / "worker-error.json", {"type": type(error).__name__})
            if once:
                return
            time.sleep(1)


def reconcile(store, job_id, crew_state, config, client):
    """Requeue only a completed checkpoint boundary, with fresh Production verification."""
    job = store.get(job_id)
    if job["status"] != "interrupted" or job["recorded"]:
        raise StudioConflict("Only interrupted live work can be reconciled here.")
    request, request_sha = prepared_request(job, config)
    crew_work = crew_state / "briefs" / sha256(request["brief"]["id"].encode()).hexdigest()
    state = read_json(crew_work / "autonomous-v2.json")
    authorization = read_json(store.work(job_id) / "authorization.json", {})
    if authorization.get("requestSha256") != request_sha:
        raise StudioConflict("The original request authorization is missing or changed.")
    if datetime.fromisoformat(authorization["expiresAt"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        raise StudioConflict("The original request authorization has expired.")
    if state is None or state.get("originalRequest") != request or state.get("language") != job["request"]["language"]:
        raise StudioConflict("No matching resumable checkpoint exists.")
    if state.get("imageReviewMode") != "studio" or state.get("pending") or state.get("terminal"):
        raise StudioConflict("An uncertain action or terminal outcome needs its own diagnosed reconciliation.")
    limits = read_json(config / "execution-limits.json")
    expected_limits = {"maxCalls": limits["maxModelCalls"], "maxSearches": limits["maxGroundedCalls"],
                       "maxImages": request["brief"]["maxGeneratedImages"]}
    if state.get("limits") != expected_limits:
        raise StudioConflict("The original execution ceilings have changed.")
    from .provider_usage import ProviderJournal
    ProviderJournal(crew_work / "provider-calls.jsonl", max_calls=limits["maxModelCalls"],
                    max_grounded_calls=limits["maxGroundedCalls"])
    if state.get("runId"):
        envelope = client.status(state["runId"])
        observed = {"stage": envelope.run.stage, "data": envelope.data} if envelope.succeeded and envelope.run else None
        if observed != state.get("productionSnapshot"):
            raise StudioConflict("Production differs from the checkpoint. No action was retried.")
    write_json(store.work(job_id) / "reconciliations" / f"{time.time_ns()}.json",
               {"checkpointSha256": sha256((crew_work / "autonomous-v2.json").read_bytes()).hexdigest(),
                "requestSha256": request_sha, "observedAt": datetime.now(timezone.utc).isoformat(),
                "providerCalls": 0, "productionMatched": bool(state.get("runId"))})
    store.transition(job_id, "interrupted", "queued", "The saved checkpoint was verified. Ready to continue the same production.")


def import_evidence(store, source):
    state = read_json(source / "evidence.json")
    index = read_json(source / "export-index.json")
    if state is None or not index or index.get("runId") != state.get("runId") or index.get("signedStatusVerified") is not True:
        raise ValueError("Import requires a checkpoint and the matching verified export index.")
    original = state["originalRequest"]["brief"]
    request = {"text": original["text"], "duration": int(original["durationSeconds"]),
               "language": state.get("language") or "English"}
    job = store.submit("recorded-" + state["runId"], request)
    if job["recorded"]:
        return job["id"]
    work = store.work(job["id"])
    for entry in index["files"]:
        if entry["kind"] not in ("preview", "generated_image_candidate"):
            continue
        name = entry["exportedAs"]
        if Path(name).name != name:
            raise ValueError("Unsafe export filename.")
        data = (source / name).read_bytes()
        path = save_media(work, data, entry)
        if entry["kind"] == "preview":
            decode_video(path)
            save_media(work, data, entry, fully_decoded=True)
    write_json(work / "checkpoint.json", state)
    terminal = state.get("terminal") or {"status": "interrupted", "reason": "This historical production has no terminal result."}
    with store.connection() as db:
        db.execute("UPDATE jobs SET recorded=1, status=?, message=? WHERE id=?",
                   (terminal["status"], terminal.get("reason", "Recorded production. Human viewing is pending."), job["id"]))
    return job["id"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("work", "prepare", "authorize", "import", "reconcile"))
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--crew-state", type=Path)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--job")
    parser.add_argument("--envelope", type=Path)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    store = StudioStore(args.state)
    if args.command == "import":
        if not args.source:
            parser.error("import requires --source")
        print(import_evidence(store, args.source))
    elif args.command == "reconcile":
        if not args.job or not args.crew_state or not args.config:
            parser.error("reconcile requires --job, --crew-state and --config")
        with worker_lock(store.root / "worker.lock"), worker_lock(args.crew_state / "worker.lock"):
            reconcile(store, args.job, args.crew_state, args.config, HostedProductionClient(args.crew_state))
    elif args.command == "work":
        if not args.crew_state or not args.config:
            parser.error("work requires --crew-state and --config")
        run_worker(store, args.crew_state, args.config, once=args.once)
    else:
        if not args.job or not args.config:
            parser.error("prepare/authorize requires --job and --config")
        request, request_sha = prepared_request(store.get(args.job), args.config)
        if args.command == "prepare":
            print(json.dumps({"requestSha256": request_sha, "request": request}))
        else:
            if not args.envelope:
                parser.error("authorize requires --envelope, already installed by the Production operator")
            authorize(store, args.job, args.config, read_json(args.envelope))


if __name__ == "__main__":
    main()
