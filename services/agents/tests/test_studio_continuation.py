"""Corrections cross the public API, durable decision store and real AutonomousRun loop."""
import asyncio
from copy import deepcopy
import json

import pytest

from test_autonomous import Director, Reviewer, make
from test_studio import app, browser, BRIEF, HEADERS
from vox_crew.autonomous_contract import digest
from vox_crew.hosted import write_json
from vox_crew.provider_usage import ProviderJournal, finish_call
from vox_crew.studio_continuation import checkpoint_view, prepare_continuation
from vox_crew.studio_controls import ProductionLimits
from vox_crew.studio_store import StudioConflict, StudioStore


async def accept(artifact, intention):
    return {"sha256": artifact.sha256, "accepted": True, "reason": ""}


def blocked_run(path, monkeypatch):
    run = make(path, monkeypatch, reviewer=Reviewer(images=(False, False, False)), image_review_hook=accept)
    with ProviderJournal(path / "provider-calls.jsonl"):
        assert asyncio.run(run.run())["status"] == "blocked"
    return run


def correction_for(state):
    return {"checkpointSha256": digest(state),
        "limits": ProductionLimits(maxImages=8, maxCalls=60, maxImageCorrections=3).model_dump(),
        "correction": {"target": "image", "identity": "rocket",
            "candidateSha256": state["images"]["rocket"][-1]["job"]["candidate"]["artifact"]["sha256"],
            "instruction": "Draw one straight light beam. Put sound wave arcs only on the lower track."}}


def authorize_client(client):
    original = client.status
    def status(run_id):
        envelope = original(run_id)
        if hasattr(client, "authorization"):
            return client.reply("run.status", {**envelope.data, "studioAuthorization": client.authorization})
        return envelope
    def authorize(run_id, value):
        client.authorization = deepcopy(value)
        return client.reply("run.authorize", {"authorization": value})
    client.status, client.authorize = status, authorize


def test_correct_blocked_identity_retains_take_history_calls_and_accepted_image(tmp_path, monkeypatch):
    crew_work = tmp_path / "crew"
    run = blocked_run(crew_work, monkeypatch)
    # An independently accepted identity is reusable and must survive the correction untouched.
    kept = deepcopy(run.state["images"]["rocket"][0])
    kept["accepted"] = True
    run.state["images"]["kept"] = [kept]
    run.save()
    before = deepcopy(run.state)
    journal_before = (crew_work / "provider-calls.jsonl").read_bytes()
    store = StudioStore(tmp_path / "studio")
    job = store.submit("correction-test", BRIEF)
    store.transition(job["id"], "awaiting_authorization", "blocked")
    body = correction_for(checkpoint_view(crew_work))
    decision_id = store.request_continuation(job["id"], "correction-key-123456", body, expected_status="blocked")
    authorize_client(run.client)
    monkeypatch.setenv("VOX_STUDIO_AUTHORIZATION_KEY", "test-only-key-" * 4)
    revised = prepare_continuation(store, job, crew_work, run.client)
    assert revised["terminal"] is None
    assert revised["take"] == before["take"] and revised["images"] == before["images"]
    assert revised["userCorrections"][-1]["previousTerminal"] == before["terminal"]
    assert (crew_work / "provider-calls.jsonl").read_bytes() == journal_before
    assert store.continuation(job["id"])["status"] == "applied"
    assert prepare_continuation(store, job, crew_work, run.client) == revised
    seen = []
    class CorrectedDirector(Director):
        async def image_intent(self, payload):
            seen.append(deepcopy(payload))
            return await super().image_intent(payload)
    with ProviderJournal(crew_work / "provider-calls.jsonl", max_calls=60, max_grounded_calls=4):
        resumed = make(crew_work, monkeypatch, client=run.client, reviewer=Reviewer(images=(True,)),
            director=CorrectedDirector(), image_review_hook=accept, production_limits=ProductionLimits().model_dump())
        assert asyncio.run(resumed.run())["status"] == "ready"
    assert len(seen) == 1
    assert seen[0]["userCorrection"]["instruction"] == body["correction"]["instruction"]
    generated = resumed.state["images"]["rocket"][-1]["request"]
    assert body["correction"]["instruction"] in generated["prompt"]
    assert generated["requestSha256"] != before["images"]["rocket"][-1]["request"]["requestSha256"]
    assert generated["sourceCandidateSha256"] == before["images"]["rocket"][-1]["job"]["candidate"]["artifact"]["sha256"]
    assert resumed.client.takes == 1 and resumed.client.calls.count("image_start") == 4
    assert resumed.state["images"]["kept"] == [kept]
    assert resumed.state["images"]["rocket"][:3] == before["images"]["rocket"]
    assert (crew_work / "provider-calls.jsonl").read_bytes().startswith(journal_before)
    evidence = store.work(job["id"]) / "continuations" / decision_id
    assert (evidence / "provider-calls-before.jsonl").read_bytes() == journal_before


def test_resume_api_persists_exact_decision_and_refuses_stale_or_uncertain_state(app, browser, tmp_path, monkeypatch):
    state = blocked_run(tmp_path / "crew", monkeypatch).state
    store = app.state.store
    job = store.submit("resume-api-test", BRIEF)
    store.transition(job["id"], "awaiting_authorization", "blocked")
    write_json(store.work(job["id"]) / "checkpoint.json", state)
    body = correction_for(state)
    url = f'/api/jobs/{job["id"]}/resume'
    assert browser.post(url, headers=HEADERS, json={**body, "checkpointSha256": "0" * 64}).status_code == 409
    for name in ("pending", "pendingComposition"):
        write_json(store.work(job["id"]) / "checkpoint.json", {**state, name: {"name": "uncertain"}})
        value = {**body, "checkpointSha256": digest({**state, name: {"name": "uncertain"}})}
        assert browser.post(url, headers=HEADERS, json=value).status_code == 409
    write_json(store.work(job["id"]) / "checkpoint.json", state)
    assert browser.post(url, headers=HEADERS, json=body).status_code == 202
    assert browser.post(url, headers=HEADERS, json=body).status_code == 202
    changed = {**body, "correction": {**body["correction"], "instruction": "Different"}}
    assert browser.post(url, headers=HEADERS, json=changed).status_code == 409
    restored = StudioStore(store.root)
    assert restored.continuation(job["id"])["request"] == body
    assert restored.get(job["id"])["status"] == "queued"


def test_exhausted_legacy_image_resumes_without_an_allowance_form(app, browser, tmp_path, monkeypatch):
    from vox_crew.studio_controls import resume_requirements
    state = blocked_run(tmp_path / "guided-crew", monkeypatch).state
    store = app.state.store
    job = store.submit("guided-resume-test", BRIEF)
    store.transition(job["id"], "awaiting_authorization", "blocked")
    write_json(store.work(job["id"]) / "checkpoint.json", state)
    assert all(value is None for value in resume_requirements(state, "image", "rocket").values())
    body = correction_for(state)
    body.pop("limits")
    assert browser.post(f'/api/jobs/{job["id"]}/resume', headers=HEADERS, json=body).status_code == 202
    assert store.get(job["id"])["status"] == "queued"


def test_authorization_response_loss_retries_same_decision_without_resetting_usage(tmp_path, monkeypatch):
    work = tmp_path / "crew"
    run = blocked_run(work, monkeypatch)
    store = StudioStore(tmp_path / "studio")
    job = store.submit("lost-authorization", BRIEF)
    store.transition(job["id"], "awaiting_authorization", "blocked")
    body = correction_for(checkpoint_view(work))
    store.request_continuation(job["id"], "lost-auth-key-12345", body, expected_status="blocked")
    authorize_client(run.client)
    send = run.client.authorize
    def lost(run_id, value):
        send(run_id, value)
        raise ConnectionError("simulated response loss")
    run.client.authorize = lost
    monkeypatch.setenv("VOX_STUDIO_AUTHORIZATION_KEY", "test-only-key-" * 4)
    journal_before = (work / "provider-calls.jsonl").read_bytes()
    with pytest.raises(ConnectionError):
        prepare_continuation(store, job, work, run.client)
    assert store.continuation(job["id"])["status"] == "pending"
    state = prepare_continuation(store, job, work, run.client)
    assert state["terminal"] is None
    assert len(state["userCorrections"]) == 1
    assert (work / "provider-calls.jsonl").read_bytes() == journal_before


def test_historical_limits_are_readable_but_new_admission_is_unlimited(app, browser):
    limits = ProductionLimits(maxCalls=80, maxImages=12, maxSearches=6, maxTakes=2).model_dump()
    for invalid in (True, 1.5, -1):
        response = browser.post('/api/jobs', headers=HEADERS, json={**BRIEF, "limits": {**limits, "maxCalls": invalid}})
        assert response.status_code == 422
    response = browser.post('/api/jobs', headers=HEADERS, json={**BRIEF, "limits": limits})
    assert response.status_code == 202
    assert response.json()["limits"] == ProductionLimits().model_dump() and response.json()["status"] == "queued"
    assert app.state.store.get(response.json()["id"])["request"]["limits"] == ProductionLimits().model_dump()


def test_saved_legacy_brief_can_start_without_limits(app, browser):
    job = app.state.store.submit('legacy-pending', BRIEF)
    limits = ProductionLimits(maxImages=12, maxCalls=80).model_dump()
    route = f'/api/jobs/{job["id"]}/start'
    response = browser.post(route, headers=HEADERS, json=limits)
    assert response.status_code == 202
    assert response.json()['limits'] == ProductionLimits().model_dump()
    assert browser.post(route, headers=HEADERS, json=limits).status_code == 202
    assert app.state.store.get(job['id'])['request'] == BRIEF
    assert app.state.store.continuation(job['id'])['request'] == {'start': True, 'limits': limits}


def test_published_limit_schema_matches_studio_validator():
    from pathlib import Path
    root = Path(__file__).resolve().parents[3]
    contract = json.loads((root / "packages/production/src/contracts/generated/protocol.json").read_text(encoding="utf-8"))
    published = contract["schemas"]["productionLimits"] if "schemas" in contract else contract["contract"]["schemas"]["productionLimits"]
    local = ProductionLimits.model_json_schema()
    assert published["additionalProperties"] is local["additionalProperties"] is False
    assert set(published["properties"]) == set(local["properties"])
    for name, schema in local["properties"].items():
        assert published["properties"][name]["anyOf"] == schema["anyOf"]


def test_renderer_references_are_real_and_never_enter_the_bitmap_request():
    from vox_crew.autonomous_roles import resolve_renderer_elements, compile_intent
    from vox_crew.crew_contract import ContractViolation, VisualBible
    from vox_crew.image_generation import AssetRequirement
    from test_autonomous import INTENT, REQ, PALETTES
    from test_crew import BIBLE, VOCABULARY
    plan = {"sections": [{"scenes": [{"id": "speed", "props": {"value": 343},
        "events": [{"action": "annotate", "payload": {"text": "Nearly 300,000 kilometers per second"}}]}]}]}
    intention = {**INTENT, "rendererElements": [
        {"sceneId": "speed", "scenePath": "/events/0/payload/text"},
        {"sceneId": "speed", "scenePath": "/props/value"}]}
    resolved = resolve_renderer_elements(intention, plan)
    assert '300,000' in resolved["rendererElements"][0]
    request = compile_intent(AssetRequirement.from_mapping(REQ), resolved,
        VisualBible.from_mapping(BIBLE, VOCABULARY), PALETTES, separate_renderer=True)
    assert '300,000' not in request.prompt and '343' not in request.prompt
    assert 'rendererElements' not in request.prompt
    with pytest.raises(ContractViolation, match="missing plan property"):
        resolve_renderer_elements({**intention, "rendererElements": [{"sceneId": "speed", "scenePath": "/props/arrows"}]}, plan)


def test_call_ceiling_pause_is_known_and_extension_does_not_repeat_completed_dispatches(tmp_path, monkeypatch):
    from vox_crew.provider_usage import begin_call
    class CountedDirector(Director):
        async def interpret(self, *args):
            finish_call(begin_call('Director', 'fixture'))
            return await super().interpret(*args)
        async def coverage(self, *args):
            finish_call(begin_call('Coverage', 'fixture'))
            return await super().coverage(*args)
    limits = ProductionLimits(maxCalls=1).model_dump()
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=1):
        run = make(tmp_path, monkeypatch, director=CountedDirector(), production_limits=limits)
        result = asyncio.run(run.run())
    assert result['code'] == 'limit'
    assert run.state['pending'] is None
    assert run.state['providerUsage']['calls'] == 1
    assert run.state['refusedDispatches']
    saved = (tmp_path / 'provider-calls.jsonl').read_bytes()
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=2) as journal:
        finish_call(journal.begin('Coverage', 'fixture'))
    assert (tmp_path / 'provider-calls.jsonl').read_bytes().startswith(saved)


def test_worker_initial_authorization_precedes_work_and_has_no_spending_ceiling(tmp_path, monkeypatch):
    from hashlib import sha256
    from test_autonomous import Client, Creative, Planner, Research, PALETTES, DEFAULTS
    from test_crew import VOCABULARY
    from vox_crew.autonomous import AutonomousRun
    from vox_crew.studio_worker import StudioExecution
    store = StudioStore(tmp_path / 'studio')
    limits = ProductionLimits().model_dump()
    job = store.submit('initial-user-budget', {**BRIEF, 'limits': limits})
    store.claim()
    config, crew = tmp_path / 'config', tmp_path / 'crew'
    write_json(config / 'prompt-defaults.json', DEFAULTS)
    monkeypatch.setenv('VOX_STUDIO_AUTHORIZATION_KEY', 'test-only-key-' * 4)
    monkeypatch.setattr('vox_crew.studio_worker.decode_video', lambda path: None)
    monkeypatch.setattr('vox_crew.autonomous.verify_rendered_video', lambda data, sha, path:
        {'sha256': sha, 'fullyDecoded': True})
    monkeypatch.setattr('vox_crew.autonomous.inspection_video', lambda data, sha, path: (data,
        {'inspectionSha256': sha, 'originalSha256': sha, 'fullyDecoded': True}))
    client = Client()
    authorize_client(client)
    class AuthorizedDirector(Director):
        async def interpret(self, *args):
            assert client.authorization['limits'] == limits
            return await super().interpret(*args)
    async def submit(client, root, config, text, **options):
        assert options['production_limits'] == limits
        original = options['original_request']
        assert 'maxGeneratedImages' not in original['brief']
        assert original['production']['maxNewTakes'] is None
        work = root / 'briefs' / sha256(original['brief']['id'].encode()).hexdigest()
        with ProviderJournal(work / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
            run = AutonomousRun(client, None, work, original, director=AuthorizedDirector(coverage=(True,)),
                research=Research(), creative=Creative(), planner=Planner(), reviewer=Reviewer(images=(True,)),
                vocabulary=VOCABULARY, palettes=PALETTES, language='English', max_searches=6,
                production_limits=limits, on_snapshot=options['on_snapshot'])
            await options['authorize_hook'](run)
            assert (await run.run())['status'] == 'ready'
    monkeypatch.setattr('vox_crew.studio_worker.submit_prompt', submit)
    asyncio.run(StudioExecution(store, job, client).run(crew, config))
    assert store.get(job['id'])['status'] == 'ready'
    assert client.calls.count('init') == 1 and client.calls.count('record') == 1
    saved = json.loads((store.work(job['id']) / 'checkpoint.json').read_text())
    assert saved['studioAuthorization']['limits'] == limits
    assert saved['limits'] == {'maxCalls': None, 'maxSearches': None, 'maxImages': None}


def test_crash_after_checkpoint_adoption_finishes_same_decision(tmp_path, monkeypatch):
    work = tmp_path / 'crew'
    run = blocked_run(work, monkeypatch)
    store = StudioStore(tmp_path / 'studio')
    job = store.submit('adoption-crash', BRIEF)
    store.transition(job['id'], 'awaiting_authorization', 'blocked')
    store.request_continuation(job['id'], 'adoption-key-123456', correction_for(checkpoint_view(work)), expected_status='blocked')
    authorize_client(run.client)
    monkeypatch.setenv('VOX_STUDIO_AUTHORIZATION_KEY', 'test-only-key-' * 4)
    complete = store.complete_continuation
    def crash(_):
        raise ConnectionError('simulated crash after adoption')
    store.complete_continuation = crash
    before = (work / 'provider-calls.jsonl').read_bytes()
    with pytest.raises(ConnectionError):
        prepare_continuation(store, job, work, run.client)
    assert len(checkpoint_view(work)['userCorrections']) == 1
    store.complete_continuation = complete
    after = prepare_continuation(store, job, work, run.client)
    assert len(after['userCorrections']) == 1
    assert store.continuation(job['id'])['status'] == 'applied'
    assert (work / 'provider-calls.jsonl').read_bytes() == before


@pytest.mark.parametrize('failure', ['uncertain_journal', 'production_changed', 'stale_candidate'])
def test_worker_revalidates_user_correction_before_any_authorization(tmp_path, monkeypatch, failure):
    work = tmp_path / 'crew'
    run = blocked_run(work, monkeypatch)
    store = StudioStore(tmp_path / 'studio')
    job = store.submit('revalidate-worker', BRIEF)
    store.transition(job['id'], 'awaiting_authorization', 'blocked')
    authorize_client(run.client)
    if failure == 'uncertain_journal':
        with (work / 'provider-calls.jsonl').open('a') as stream:
            stream.write(json.dumps({'status': 'dispatched', 'id': 'uncertain', 'role': 'ImageGeneration'}) + '\n')
    if failure == 'production_changed':
        run.client.takes += 1
    body = correction_for(checkpoint_view(work))
    if failure == 'stale_candidate':
        body['correction']['candidateSha256'] = '0' * 64
    store.request_continuation(job['id'], 'revalidate-key-123456', body, expected_status='blocked')
    monkeypatch.setenv('VOX_STUDIO_AUTHORIZATION_KEY', 'test-only-key-' * 4)
    before = (work / 'autonomous-v2.json').read_bytes()
    with pytest.raises(StudioConflict):
        prepare_continuation(store, job, work, run.client)
    assert not hasattr(run.client, 'authorization')
    assert (work / 'autonomous-v2.json').read_bytes() == before


def test_expired_authorization_prevents_even_a_model_dispatch(tmp_path):
    from vox_crew.provider_usage import ProviderLimit
    with ProviderJournal(tmp_path / 'provider-calls.jsonl') as journal:
        journal.expires_at = '2020-01-01T00:00:00Z'
        with pytest.raises(ProviderLimit, match='expired'):
            journal.begin('Director', 'model')
        assert journal.records == []


def test_repeated_rejected_intention_is_not_counted_as_a_fresh_candidate(tmp_path, monkeypatch):
    from test_autonomous import INTENT
    class UnchangedDirector(Director):
        async def image_intent(self, payload):
            return deepcopy(INTENT)
    run = make(tmp_path, monkeypatch, director=UnchangedDirector(), reviewer=Reviewer(images=(False,)))
    result = asyncio.run(run.run())
    assert result['status'] == 'blocked' and 'same image instructions' in result['reason']
    assert run.client.calls.count('image_start') == 1
    assert len(run.state['images']['rocket']) == 1
