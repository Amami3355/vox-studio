"""Production refusals with null data are known outcomes, never lost image jobs."""
import asyncio
import json

import pytest

from test_autonomous import Client, make
from vox_crew.autonomous import AutonomousBlocked
from vox_crew.envelopes import parse_envelope
from vox_crew.provider_usage import ProviderJournal


def refused(command, code):
    return parse_envelope(json.dumps({'protocolVersion': 1, 'command': command,
        'outcome': 'failed', 'run': None, 'data': None, 'artifacts': [],
        'error': {'code': code, 'message': 'Refused before image dispatch.', 'details': None}, 'next': []}))


def test_image_start_refusal_is_saved_and_closes_its_journal(tmp_path, monkeypatch):
    client = Client()
    client.image_start = lambda *args: refused('run.image.start', 'IMAGE_EDIT_SOURCE_TOO_LARGE')
    run = make(tmp_path, monkeypatch, client=client)
    with ProviderJournal(tmp_path / 'provider-calls.jsonl') as journal:
        result = asyncio.run(run.command('image_start', 'run-1', {'requestSha256': 'a' * 64}))
        assert result.error.code == 'IMAGE_EDIT_SOURCE_TOO_LARGE'
        assert not journal.summary()['uncertain']
        assert journal.records[-1]['providerOutcome'] == 'failed'
    assert run.state['pending'] is None
    assert next(iter(run.state['steps'].values()))['result']['data'] is None
    from vox_crew.studio_worker import StudioExecution
    from vox_crew.studio_store import StudioStore
    from test_studio import BRIEF
    store = StudioStore(tmp_path / 'studio')
    job = store.submit('refused-image', BRIEF)
    StudioExecution(store, job, client).snapshot(run.state)


def test_reconciliation_of_missing_image_job_preserves_unfinished_dispatch(tmp_path, monkeypatch):
    from copy import deepcopy
    from vox_crew.autonomous_contract import digest
    from vox_crew.hosted import write_json
    from vox_crew.image_workflow import reconcile_saved_images
    from vox_crew.studio_store import StudioConflict
    from vox_crew.studio_continuation import checkpoint_view
    run = make(tmp_path, monkeypatch)
    run.state.update(videoPlan={'sections': []}, runId='run-1')
    context = digest({'version': 1, 'plan': run.state['videoPlan'], 'corrections': {}})
    key = digest({'context': context, 'identity': 'image'})
    run.state.update(imageWorkflow={'contextKey': context}, requiredImageIdentities=['image'])
    directory = tmp_path / 'image-pipelines' / key
    child = deepcopy(run.state)
    pending = {'name': 'production.image_start', 'dependencies': {'args': ['run-1',
        {'requestSha256': 'a' * 64, 'identityKey': 'image'}], 'key': None}}
    pending['identity'] = digest(pending)
    child['pending'] = pending
    write_json(directory / 'checkpoint.json', child)
    with ProviderJournal(directory / 'provider-calls.jsonl') as journal:
        journal.operation_identity = lambda: pending['identity']
        journal.begin('ImageGeneration', 'production')
    original = (directory / 'provider-calls.jsonl').read_bytes()
    run.state['productionSnapshot'] = run.snapshot()
    run.save()
    state = checkpoint_view(tmp_path)
    run.client.image_status = lambda *args: refused('run.image.status', 'IMAGE_JOB_NOT_FOUND')
    with pytest.raises(StudioConflict, match='could not be verified'):
        reconcile_saved_images(tmp_path, state, run.client)
    assert (directory / 'provider-calls.jsonl').read_bytes() == original
    assert json.loads((directory / 'checkpoint.json').read_text())['pending'] == pending


@pytest.mark.parametrize('lost_response', [False, True])
def test_missing_image_job_is_a_controlled_block_without_duplicate_dispatch(tmp_path, monkeypatch, lost_response):
    client = Client()
    starts = []
    def start(*args):
        starts.append(args)
        raise ConnectionError('Response lost')
    client.image_start = start
    client.image_status = lambda *args: refused('run.image.status', 'IMAGE_JOB_NOT_FOUND')
    run = make(tmp_path, monkeypatch, client=client)
    request = {'requestSha256': 'a' * 64, 'identityKey': 'image'}
    with ProviderJournal(tmp_path / 'provider-calls.jsonl') as journal:
        with pytest.raises(AutonomousBlocked, match='could not be verified'):
            asyncio.run(run.command('image_start', 'run-1', request) if lost_response else run.observe_image(request))
        assert len(starts) == int(lost_response)
        assert journal.summary()['uncertain'] == lost_response
