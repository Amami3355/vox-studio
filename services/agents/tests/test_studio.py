"""Studio admission, authentication, media access and worker ownership exercise real boundaries."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from vox_crew.hosted import write_json
from vox_crew.studio_api import create_app
from vox_crew.studio_store import StudioConflict, StudioStore
from vox_crew.studio_worker import StudioExecution, authorize, prepared_request, reconcile, save_media, worker_lock
from vox_crew.client import Artifact

ORIGIN = "http://127.0.0.1:8780"
CODE = "studio-test-access-code-only"
HEADERS = {"Origin": ORIGIN, "X-Vox-Studio": "1", "Idempotency-Key": "test-admission-key-1234"}
BRIEF = {"text": "Explain why the sky is blue.", "duration": 50, "language": "English"}


@pytest.fixture
def app(tmp_path):
    assets = tmp_path / "dist"
    assets.mkdir()
    (assets / "index.html").write_text("<html>Studio</html>")
    return create_app(tmp_path / "state", assets, access_code=CODE, origin=ORIGIN)


@pytest.fixture
def browser(app):
    with TestClient(app, base_url=ORIGIN) as client:
        assert client.post("/api/session", json={"code": CODE}, headers=HEADERS).status_code == 200
        yield client


def test_private_sessions_csrf_and_logout(app, browser):
    with TestClient(app, base_url=ORIGIN) as other:
        assert other.get("/api/jobs").status_code == 401
        assert other.post("/api/session", json={"code": CODE}).status_code == 403
    assert browser.post("/api/jobs", json=BRIEF, headers={**HEADERS, "Origin": "https://evil.test"}).status_code == 403
    assert browser.get("/api/session").status_code == 200
    assert browser.delete("/api/session", headers=HEADERS).status_code == 200
    assert browser.get("/api/jobs").status_code == 401


def test_submit_idempotency_survives_new_server_and_rejects_rebinding(app, browser):
    first = browser.post("/api/jobs", json=BRIEF, headers=HEADERS)
    assert first.status_code == 202
    value = first.json()
    assert value["status"] == "awaiting_authorization"
    assert value["events"] == []
    assert browser.post("/api/jobs", json=BRIEF, headers=HEADERS).json()["id"] == value["id"]
    assert browser.post("/api/jobs", json={**BRIEF, "text": "Different"}, headers=HEADERS).status_code == 409
    assert len(StudioStore(app.state.store.root).list()) == 1
    assert browser.get(f'/api/jobs/{value["id"]}').json()["prompt"] == BRIEF["text"]
    assert browser.post("/api/jobs", json={**BRIEF, "maxImages": 100}, headers=HEADERS).status_code == 422
    assert browser.post("/api/jobs", json={**BRIEF, "text": "  "}, headers=HEADERS).status_code == 422


def test_concurrent_admission_is_one_job_and_claim_is_exclusive(tmp_path):
    store = StudioStore(tmp_path)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: store.submit("same-idempotency-key", BRIEF), range(16)))
    assert len({row["id"] for row in results}) == 1
    job = results[0]
    store.transition(job["id"], "awaiting_authorization", "queued")
    with ThreadPoolExecutor(max_workers=8) as pool:
        claims = list(pool.map(lambda _: store.claim(), range(8)))
    assert len([row for row in claims if row]) == 1
    other = store.submit("different-idempotency-key", BRIEF)
    with pytest.raises(StudioConflict, match="already active"):
        store.transition(other["id"], "awaiting_authorization", "queued")


def test_media_ranges_authentication_integrity_and_allowlist(app, browser):
    job = browser.post("/api/jobs", json=BRIEF, headers=HEADERS).json()
    work = app.state.store.work(job["id"])
    data = b"test-media-bytes"
    digest = sha256(data).hexdigest()
    path = save_media(work, data, {"kind": "preview", "sha256": digest})
    route = f'/api/jobs/{job["id"]}/media/{digest}'
    response = browser.get(route, headers={"Range": "bytes=2-6"})
    assert response.status_code == 206
    assert response.content == data[2:7]
    assert response.headers["content-range"] == f"bytes 2-6/{len(data)}"
    assert browser.head(route).headers["content-length"] == str(len(data))
    with TestClient(app, base_url=ORIGIN) as other:
        assert other.get(route).status_code == 401
    assert browser.get(f'/api/jobs/{job["id"]}/media/{"0" * 64}').status_code == 404
    path.write_bytes(b"corrupted")
    assert browser.get(route).status_code == 409


def test_projection_excludes_internal_context_and_unsafe_links(app, browser):
    job = browser.post("/api/jobs", json=BRIEF, headers=HEADERS).json()
    write_json(app.state.store.work(job["id"]) / "checkpoint.json", {
        "pending": {"secret": "do-not-publish"}, "steps": {"raw": "do-not-publish"},
        "researchDossier": {"sources": [{"title": "Bad", "url": "javascript:alert(1)"},
                                          {"title": "Science", "url": "https://science.nasa.gov/"}]}})
    response = browser.get(f'/api/jobs/{job["id"]}')
    assert "do-not-publish" not in response.text
    assert len(response.json()["sources"]) == 1


def test_human_review_waits_for_bound_decision_and_replays_once(app, browser):
    store = app.state.store
    job = store.submit("human-image-decision", BRIEF)
    store.transition(job["id"], "awaiting_authorization", "queued")
    store.claim()
    data = b"candidate bytes"
    artifact = Artifact("generated_image_candidate", sha256(data).hexdigest(), data)
    execution = StudioExecution(store, job, None)

    async def exercise():
        task = asyncio.create_task(execution.image_review(artifact, {"meaning": "A blue sky"}))
        await asyncio.sleep(0.05)
        assert not task.done()
        value = browser.get(f'/api/jobs/{job["id"]}').json()
        assert value["status"] == "awaiting_image"
        route = f'/api/jobs/{job["id"]}/image-decision'
        payload = {"sha256": artifact.sha256, "accepted": True, "reason": ""}
        assert browser.post(route, json={**payload, "sha256": "0" * 64}, headers=HEADERS).status_code == 409
        assert browser.post(route, json=payload, headers=HEADERS).status_code == 200
        decision = await asyncio.wait_for(task, 3)
        assert decision["accepted"] is True
        assert store.get(job["id"])["status"] == "running"
        assert browser.post(route, json=payload, headers=HEADERS).status_code == 200
        assert browser.post(route, json={**payload, "accepted": False, "reason": "Changed"}, headers=HEADERS).status_code == 409
    asyncio.run(exercise())


def test_worker_lock_excludes_second_owner_and_releases_after_exit(tmp_path):
    path = tmp_path / "worker.lock"
    with worker_lock(path):
        with pytest.raises(OSError):
            with worker_lock(path):
                pass
    with worker_lock(path):
        pass


def test_authorization_is_exact_immutable_and_bounded(tmp_path):
    store = StudioStore(tmp_path / "state")
    config = tmp_path / "config"
    write_json(config / "prompt-defaults.json", {"maxGeneratedImages": 5, "production": {"maxNewTakes": 1}})
    job = store.submit("authorize-this-request", BRIEF)
    _, request_sha = prepared_request(job, config)
    envelope = {"schemaVersion": 1, "requestSha256": request_sha, "maxImages": 5, "expiresAt": "2099-01-01T00:00:00Z"}
    with pytest.raises(StudioConflict):
        authorize(store, job["id"], config, {**envelope, "maxImages": 8})
    with pytest.raises(StudioConflict):
        authorize(store, job["id"], config, {**envelope, "requestSha256": "0" * 64})
    authorize(store, job["id"], config, envelope)
    assert store.get(job["id"])["status"] == "queued"
    with pytest.raises(StudioConflict):
        authorize(store, job["id"], config, {**envelope, "expiresAt": "2100-01-01T00:00:00Z"})


def test_restart_requeues_only_verified_checkpoint_without_uncertain_actions(tmp_path):
    from types import SimpleNamespace
    store = StudioStore(tmp_path / "studio")
    config, crew_state = tmp_path / "config", tmp_path / "crew"
    write_json(config / "prompt-defaults.json", {"maxGeneratedImages": 5, "production": {"maxNewTakes": 1}})
    write_json(config / "execution-limits.json", {"maxModelCalls": 40, "maxGroundedCalls": 4})
    job = store.submit("safe-restart-request", BRIEF)
    request, request_sha = prepared_request(job, config)
    authorize(store, job["id"], config, {"schemaVersion": 1, "requestSha256": request_sha, "maxImages": 5,
                                       "expiresAt": "2099-01-01T00:00:00Z"})
    store.claim()
    with worker_lock(store.root / "worker.lock"):
        store.interrupted()
    work = crew_state / "briefs" / sha256(request["brief"]["id"].encode()).hexdigest()
    state = {"originalRequest": request, "language": "English", "imageReviewMode": "studio",
             "pending": {"name": "production.render"}, "terminal": None, "runId": "run-id",
             "limits": {"maxCalls": 40, "maxSearches": 4, "maxImages": 5},
             "productionSnapshot": {"stage": "compiled", "data": {"takes": 1}}}
    write_json(work / "autonomous-v2.json", state)
    observed = []
    def status(run_id):
        observed.append(run_id)
        return SimpleNamespace(succeeded=True, run=SimpleNamespace(stage="compiled"), data={"takes": 1})
    client = SimpleNamespace(status=status)
    with pytest.raises(StudioConflict, match="uncertain"):
        reconcile(store, job["id"], crew_state, config, client)
    assert not observed
    state["pending"] = None
    write_json(work / "autonomous-v2.json", state)
    (work / "provider-calls.jsonl").write_text(json.dumps({"status": "dispatched", "id": "lost"}) + "\n")
    with pytest.raises(RuntimeError, match="uncertain"):
        reconcile(store, job["id"], crew_state, config, client)
    with (work / "provider-calls.jsonl").open("a") as stream:
        stream.write(json.dumps({"status": "responded", "id": "lost"}) + "\n")
    before = (work / "autonomous-v2.json").read_bytes()
    reconcile(store, job["id"], crew_state, config, client)
    assert observed == ["run-id"]
    assert store.get(job["id"])["status"] == "queued"
    assert (work / "autonomous-v2.json").read_bytes() == before


def test_studio_image_gate_rejects_then_corrects_without_changing_take(tmp_path, monkeypatch):
    from test_autonomous import make, Reviewer
    decisions = []
    async def human(artifact, intention):
        accepted = bool(decisions)
        decisions.append(artifact.sha256)
        return {"sha256": artifact.sha256, "accepted": accepted,
                "reason": "" if accepted else "Make the direction easier to understand."}
    snapshots = []
    run = make(tmp_path, monkeypatch, reviewer=Reviewer(images=(True, True)),
               image_review_hook=human, on_snapshot=lambda state: snapshots.append(state))
    assert asyncio.run(run.run())["status"] == "reviewed"
    assert len(decisions) == 2
    assert run.client.takes == 1
    assert run.client.calls.count("image_reject") == 1
    assert run.client.calls.count("image_accept") == 1
    assert snapshots[-1]["imageReviewMode"] == "studio"
    from vox_crew.autonomous import AutonomousBlocked
    with pytest.raises(AutonomousBlocked, match="review authority"):
        make(tmp_path, monkeypatch, client=run.client)
