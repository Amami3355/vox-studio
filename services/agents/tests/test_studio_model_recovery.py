"""Archive and resume a diagnosed response without new authority or lost work."""
import asyncio
from copy import deepcopy
from hashlib import sha256
import importlib.util
import json
from pathlib import Path

import pytest

from test_model_recovery import setup, TRUNCATED, GOOD
from test_studio_continuation import authorize_client
from vox_crew.autonomous_contract import digest
from vox_crew.hosted import write_json
from vox_crew.provider_usage import ProviderJournal, finish_call
from vox_crew.studio_controls import ProductionLimits
from vox_crew.studio_store import StudioStore, StudioConflict

spec = importlib.util.spec_from_file_location('reconcile_model_response',
    Path(__file__).resolve().parents[3] / 'deploy/studio/reconcile_model_response.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


@pytest.fixture
def stopped(tmp_path_factory, monkeypatch):
    tmp_path = tmp_path_factory.mktemp('mr')
    store = StudioStore(tmp_path / 'studio')
    job = store.submit('model-failure', {'text': 'Why does a rocket slow down?', 'duration': 50, 'language': 'English'})
    store.transition(job['id'], 'awaiting_authorization', 'blocked')
    crew = tmp_path / 'crew'
    work = crew / 'briefs' / sha256(('studio-' + job['id']).encode()).hexdigest()
    run, calls = setup(work, monkeypatch, [json.dumps(GOOD)])
    request = deepcopy(run.request)
    request['brief']['id'] = 'studio-' + job['id']
    request['brief']['text'] = job['request']['text']
    limits = ProductionLimits(maxTechnicalRepairs=2).model_dump()
    authority = {'schemaVersion': 1, 'decisionId': job['id'], 'runId': 'run-1',
        'requestSha256': digest({'protocolVersion': 1, 'purpose': 'production-request', 'value': request}),
        'expiresAt': '2099-01-01T00:00:00Z', 'limits': limits, 'signature': 'fixture-signed-receipt'}
    authorize_client(run.client)
    run.client.authorization = authority
    run.state.update(runId='run-1', imageReviewMode='studio', language='English', originalRequest=request,
                     studioAuthorization=authority, productionSnapshot=run.snapshot())
    run.state['limits'] = {k: limits[k] for k in ('maxCalls', 'maxSearches', 'maxImages')}
    # Reproduce the legacy failure through the actual parser, without the new boundary.
    from vox_crew.adk_roles import _json_answer
    pending = {'name': 'composition', 'dependencies': {'fixture': True}}
    pending['identity'] = digest(pending)
    run.state.update(pending=pending, pendingComposition={'name': 'scene_author', 'identity': 'legacy-slot'},
                     terminal={'status': 'blocked', 'reason': 'ContractViolation: inspect operator evidence before resuming.'})
    run.state['recoverableFailure'] = {k: deepcopy(run.state[k]) for k in ('pending', 'pendingComposition')}
    with ProviderJournal(work / 'provider-calls.jsonl') as journal:
        call = journal.begin('SceneAuthor', 'deployed-model')
        finish_call(call, answerParts=[{'partIndex': 0, 'text': TRUNCATED}])
        try:
            _json_answer(TRUNCATED, 'SceneAuthor')
        except ValueError as error:
            run.state['contractDiagnostic'] = {'step': pending, 'error': str(error)}
        run.save()
    write_json(store.work(job['id']) / 'production-request.json', request)
    write_json(store.work(job['id']) / 'checkpoint.json', run.state)
    return store, job['id'], crew, run, calls


def test_preview_then_adoption_retains_authority_journal_and_reserves_retry(stopped):
    store, job, crew, run, calls = stopped
    before = run.path.read_bytes()
    journal = (run.work / 'provider-calls.jsonl').read_bytes()
    proof = recovery.recover(store, job, crew, run.client)
    assert not proof['applied'] and run.path.read_bytes() == before
    proof = recovery.recover(store, job, crew, run.client, apply=True)
    assert proof['applied'] and proof['providerCalls'] == 0
    assert store.get(job)['status'] == 'queued'
    state = json.loads(run.path.read_text(encoding='utf-8'))
    original = json.loads(before)
    for key in ('originalRequest', 'runId', 'studioAuthorization', 'steps', 'technicalRepairs', 'narrative', 'visualBible'):
        assert state[key] == original[key]
    assert state['terminal'] is None and state['pending'] is None and state['pendingComposition'] is None
    assert (run.work / 'provider-calls.jsonl').read_bytes() == journal
    archive = store.work(job) / 'reconciliations' / ('model-' + proof['checkpointSha256'])
    assert (archive / 'checkpoint-before.json').read_bytes() == before
    assert (archive / 'provider-calls-before.jsonl').read_bytes() == journal
    run.state = state
    with ProviderJournal(run.work / 'provider-calls.jsonl'):
        plan = asyncio.run(run.compose())
    assert plan and len(calls) == 1 and run.state['technicalRepairs'] == 1


@pytest.mark.parametrize('case', ['expired', 'uncertain', 'changed_production', 'spent', 'different_response', 'changed_request', 'wrong_step'])
def test_refused_recovery_changes_nothing(stopped, case):
    store, job, crew, run, calls = stopped
    state = deepcopy(run.state)
    if case == 'expired': state['studioAuthorization']['expiresAt'] = '2000-01-01T00:00:00Z'
    if case == 'spent': state['technicalRepairs'] = 2
    if case == 'changed_request': state['originalRequest']['brief']['text'] = 'Changed'
    if case == 'wrong_step': state['pending']['name'] = 'production.record'
    if case == 'changed_production': run.client.takes += 1
    if case in ('uncertain', 'different_response'):
        with ProviderJournal(run.work / 'provider-calls.jsonl') as journal:
            call = journal.begin('SceneAuthor', 'fixture')
            if case == 'different_response': finish_call(call, answerParts=[{'text': json.dumps(GOOD)}])
    write_json(run.path, state)
    before = run.path.read_bytes()
    journal = (run.work / 'provider-calls.jsonl').read_bytes()
    with pytest.raises((StudioConflict, RuntimeError)):
        recovery.recover(store, job, crew, run.client, apply=True)
    assert run.path.read_bytes() == before
    assert (run.work / 'provider-calls.jsonl').read_bytes() == journal
    assert store.get(job)['status'] == 'blocked' and not calls


def test_crash_after_adoption_can_finish_queueing_the_same_recovery(stopped, monkeypatch):
    store, job, crew, run, calls = stopped
    transition = store.transition
    def crash(*args, **kwargs):
        raise RuntimeError('interrupted queue')
    monkeypatch.setattr(store, 'transition', crash)
    with pytest.raises(RuntimeError, match='interrupted queue'):
        recovery.recover(store, job, crew, run.client, apply=True)
    adopted = run.path.read_bytes()
    monkeypatch.setattr(store, 'transition', transition)
    assert recovery.recover(store, job, crew, run.client, apply=True)['applied']
    assert run.path.read_bytes() == adopted and store.get(job)['status'] == 'queued'
