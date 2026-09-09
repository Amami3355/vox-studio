"""Recover an interrupted real AutonomousRun from observed render completion without dispatch."""
import asyncio
from copy import deepcopy
from hashlib import sha256
import importlib.util
import json
from pathlib import Path

import pytest

from vox_crew.hosted import write_json
from vox_crew.provider_usage import ProviderJournal
from vox_crew.studio_store import StudioConflict, StudioStore
from vox_crew.studio_worker import authorize, prepared_request

spec = importlib.util.spec_from_file_location('studio_render_recovery',
    Path(__file__).resolve().parents[3] / 'deploy/studio/reconcile_render.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


@pytest.fixture
def interrupted(tmp_path, monkeypatch):
    import test_autonomous as fixture

    class Crash(BaseException):
        pass

    class Client(fixture.Client):
        def status(self, run_id):
            descriptors = [{'kind': artifact.kind, 'sha256': artifact.sha256, 'path': artifact.sha256}
                           for artifact in self.artifacts.values()]
            return self.reply('run.status', {'artifacts': descriptors, 'lastOutcome': 'succeeded', 'staleStages': []})

        def compile(self, run_id):
            self.stage = 'compiled'
            return super().compile(run_id)

        def render(self, run_id):
            super().render(run_id)
            self.stage = 'rendered'
            raise Crash()

    store = StudioStore(tmp_path / 'studio')
    crew, config = tmp_path / 'crew', tmp_path / 'config'
    write_json(config / 'prompt-defaults.json', fixture.DEFAULTS)
    write_json(config / 'execution-limits.json', {'maxModelCalls': 40, 'maxGroundedCalls': 4})
    job = store.submit('render-crash', {'text': 'Why does a rocket slow down?', 'duration': 50, 'language': 'English'})
    request, request_sha = prepared_request(job, config)
    authorize(store, job['id'], config, {'schemaVersion': 1, 'requestSha256': request_sha,
                                       'maxImages': 5, 'expiresAt': '2099-01-01T00:00:00Z'})
    store.claim()
    work = crew / 'briefs' / sha256(request['brief']['id'].encode()).hexdigest()
    monkeypatch.setattr(fixture, 'prompt_request', lambda *args, **kwargs: request)

    async def human(artifact, intention):
        return {'sha256': artifact.sha256, 'accepted': True, 'reason': ''}

    client = Client()
    def make():
        return fixture.make(work, monkeypatch, client=client, language='English',
                            reviewer=fixture.Reviewer(images=(True,)), image_review_hook=human)

    run = make()
    with ProviderJournal(work / 'provider-calls.jsonl', max_grounded_calls=4), pytest.raises(Crash):
        asyncio.run(run.run())
    store.interrupted()
    decoded = []
    monkeypatch.setattr(recovery, 'decode_video', lambda path: decoded.append(path.read_bytes()))
    return store, job['id'], crew, config, client, run, make, decoded


def test_preview_is_read_only_then_apply_delivers_without_rendering_again(interrupted):
    store, job, crew, config, client, run, make, decoded = interrupted
    original = run.path.read_bytes()
    journal = (run.work / 'provider-calls.jsonl').read_bytes()
    proof = recovery.recover(store, job, crew, config, client)
    assert not proof['applied'] and proof['renderCommands'] == proof['providerCalls'] == 0
    assert run.path.read_bytes() == original
    assert store.get(job)['status'] == 'interrupted'
    applied = recovery.recover(store, job, crew, config, client, apply=True)
    assert applied['applied'] and len(decoded) == 2
    assert store.get(job)['status'] == 'queued'
    with ProviderJournal(run.work / 'provider-calls.jsonl', max_grounded_calls=4):
        assert asyncio.run(make().run())['status'] == 'ready'
    assert client.calls.count('render') == client.calls.count('record') == client.calls.count('image_start') == 1
    assert (run.work / 'provider-calls.jsonl').read_bytes() == journal
    archives = list((store.work(job) / 'reconciliations').glob('render-*/checkpoint-before.json'))
    assert len(archives) == 2 and all(p.read_bytes() == original for p in archives)


@pytest.mark.parametrize('case', ['terminal', 'other_pending', 'changed_plan', 'changed_limits',
                                  'uncertain_provider', 'changed_production', 'incomplete_render', 'bad_media'])
def test_refusal_keeps_checkpoint_and_journal_unchanged(interrupted, case, monkeypatch):
    store, job, crew, config, client, run, make, decoded = interrupted
    state = deepcopy(run.state)
    if case == 'terminal': state['terminal'] = {'status': 'blocked'}
    if case == 'other_pending': state['pending']['name'] = 'production.record'
    if case == 'changed_plan': state['videoPlan']['sections'] = []
    if case == 'changed_limits': state['limits']['maxCalls'] = 39
    if case == 'uncertain_provider':
        with ProviderJournal(run.work / 'provider-calls.jsonl', max_grounded_calls=4) as journal:
            journal.begin('Director', 'fixture')
    if case == 'changed_production': client.artifact('take_audio', b'changed take')
    if case == 'incomplete_render': client.stage = 'compiled'
    if case == 'bad_media':
        def refuse(path): raise ValueError('Invalid media')
        monkeypatch.setattr(recovery, 'decode_video', refuse)
    write_json(run.path, state)
    before = run.path.read_bytes()
    journal = (run.work / 'provider-calls.jsonl').read_bytes()
    calls = list(client.calls)
    with pytest.raises((StudioConflict, RuntimeError, ValueError)):
        recovery.recover(store, job, crew, config, client, apply=True)
    assert run.path.read_bytes() == before
    assert (run.work / 'provider-calls.jsonl').read_bytes() == journal
    assert client.calls == calls
    assert store.get(job)['status'] == 'interrupted'
