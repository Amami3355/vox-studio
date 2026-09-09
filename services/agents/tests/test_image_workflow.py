"""Real ADK scheduling with deterministic provider barriers and durable branch state."""
import asyncio
from copy import deepcopy
import json
import threading
import time
import pytest

from test_autonomous import Client, Director, Planner, REQ, make, media_review
from vox_crew.provider_usage import ProviderJournal
from vox_crew.studio_controls import effective_limits


class Crash(BaseException):
    pass


@pytest.mark.parametrize('legacy_cached_answer', [False, True])
def test_resume_retries_invalid_intention_instead_of_caching_raw_answer(tmp_path, monkeypatch, legacy_cached_answer):
    from test_autonomous import INTENT, Reviewer
    from vox_crew.autonomous_roles import resolve_renderer_elements
    from vox_crew.hosted import write_json
    from vox_crew.image_workflow import reconcile_saved_images
    from vox_crew.provider_usage import begin_call, finish_call
    from vox_crew.studio_continuation import checkpoint_view

    class ImageDirector(Director):
        valid = False
        calls = 0

        async def image_intent(self, payload):
            self.calls += 1
            scene = payload['videoPlan']['sections'][0]['scenes'][0]
            answer = {**INTENT, 'rendererElements': [] if self.valid else [
                {'sceneId': scene['id'], 'scenePath': '/props/assetRequirement'}]}
            call = begin_call('ImageCreator', 'fixture', max_output_tokens=8192)
            finish_call(call, answerParts=[{'text': json.dumps(answer)}], finishReason='STOP')
            return resolve_renderer_elements(answer, payload['videoPlan'])

    client, director = Client(), ImageDirector((True,))
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        run = make(tmp_path, monkeypatch, client=client, director=director,
            reviewer=Reviewer(images=(True,)), production_limits=effective_limits({}))
        assert asyncio.run(run.run())['code'] == 'model_response'
    assert director.calls == 2 and client.calls.count('image_start') == 0
    branch_path = next(tmp_path.glob('image-pipelines/*/checkpoint.json'))
    branch = json.loads(branch_path.read_text())
    pending = branch['pending']
    if legacy_cached_answer:
        # The deployed reconciler mistakenly saved the schema-valid raw answer,
        # skipping the renderer-reference validation and normalization.
        records = [json.loads(line) for line in (branch_path.parent / 'provider-calls.jsonl').read_text().splitlines()]
        answer = json.loads(records[-1]['answerParts'][0]['text'])
        branch['steps'][pending['identity']] = {**{k: pending[k] for k in ('name', 'dependencies')}, 'result': answer}
        branch['pending'] = None
        write_json(branch_path, branch)
    saved = checkpoint_view(tmp_path)
    reconciled = reconcile_saved_images(tmp_path, saved, client)
    recovered = json.loads(branch_path.read_text())
    assert pending['identity'] not in recovered['steps']
    assert recovered['pending'] is None
    assert recovered['pendingModelRecovery']['step'] == 'image_intent'
    assert director.calls == 2  # Read-only reconciliation must never call a model.
    assert not reconciled['providerUsage']['uncertain']
    reconciled['terminal'] = None  # Explicit Studio continuation.
    write_json(run.path, reconciled)
    director.valid = True
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        resumed = make(tmp_path, monkeypatch, client=client, director=director,
            reviewer=Reviewer(images=(True,)), production_limits=effective_limits({}))
        assert asyncio.run(resumed.run())['status'] == 'ready'
    assert director.calls == 3
    assert client.calls.count('record') == client.calls.count('image_start') == client.calls.count('render') == 1


@pytest.mark.parametrize('version,legacy_cache', [(2, False), (3, False), (3, True)])
def test_recovered_intention_has_the_same_result_as_live_validation(tmp_path, monkeypatch, version, legacy_cache):
    from test_autonomous import INTENT
    from vox_crew.autonomous_contract import digest, checked, IMAGE_INTENT
    from vox_crew.autonomous_roles import resolve_renderer_elements
    from vox_crew.image_workflow import reconcile_image_step
    from vox_crew.provider_usage import begin_call, finish_call

    run = make(tmp_path, monkeypatch)
    plan = {'sections': [{'scenes': [{'id': 'intro', 'props': {'headline': 'Space and time'}}]}]}
    dependencies = {'context': {'imagePromptVersion': version, 'videoPlan': plan}}
    pending = {'name': 'image_intent', 'dependencies': dependencies}
    pending['identity'] = digest(pending)
    answer = {**INTENT, 'rendererElements': [{'sceneId': 'intro', 'scenePath': '/props/headline'}]} if version == 3 else INTENT
    expected = resolve_renderer_elements(answer, plan) if version == 3 else answer
    run.state['pending'] = None if legacy_cache else pending
    if legacy_cache:
        run.state['steps'][pending['identity']] = {'name': 'image_intent', 'dependencies': dependencies, 'result': answer}
    run.snapshot = lambda: {'saved': True}
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None) as journal:
        run.journal = journal
        journal.operation_identity = lambda: pending['identity']
        call = begin_call('ImageCreator', 'fixture')
        finish_call(call, answerParts=[{'text': json.dumps(answer)}], finishReason='STOP')
        asyncio.run(reconcile_image_step(run))
        assert journal.summary()['calls'] == 1
    result = run.state['steps'][pending['identity']]['result']
    assert checked(IMAGE_INTENT, result) == expected
    assert run.state['pending'] is None


def test_adk_resume_recovers_answered_review_after_checkpoint_crash(tmp_path, monkeypatch):
    from vox_crew.provider_usage import begin_call, finish_call
    from vox_crew.studio_continuation import checkpoint_view

    class CrashAfterReview:
        async def review(self, *args):
            call = begin_call('MediaReviewer', 'fixture')
            finish_call(call, answerParts=[{'text': json.dumps(media_review(True))}], finishReason='STOP')
            raise Crash('Review answered before the step checkpoint was saved')

    client = Client()
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        run = make(tmp_path, monkeypatch, client=client, director=Director((True,)),
            reviewer=CrashAfterReview(), production_limits=effective_limits({}))
        with pytest.raises(Crash):
            asyncio.run(run.run())
    saved = checkpoint_view(tmp_path)
    assert saved['imageWorkflow']['invocationId']
    assert saved['providerUsage']['images'] == 1
    assert saved['providerUsage']['calls'] == 3  # recording, image generation, image review
    assert not saved['providerUsage']['uncertain']

    class NeverReview:
        async def review(self, *args):
            pytest.fail('The durable review response must be reused')

    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        resumed = make(tmp_path, monkeypatch, client=client, reviewer=NeverReview(),
            production_limits=effective_limits({}))
        assert asyncio.run(resumed.run())['status'] == 'ready'
    assert client.calls.count('image_start') == client.calls.count('record') == client.calls.count('render') == 1
    assert resumed.state['providerUsage']['calls'] == 3


def test_unknown_review_on_resume_never_dispatches_again(tmp_path, monkeypatch):
    from vox_crew.provider_usage import begin_call

    class UnknownReview:
        async def review(self, *args):
            begin_call('MediaReviewer', 'fixture')
            raise Crash('Review response was lost')

    client = Client()
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        run = make(tmp_path, monkeypatch, client=client, director=Director((True,)),
            reviewer=UnknownReview(), production_limits=effective_limits({}))
        with pytest.raises(Crash):
            asyncio.run(run.run())
    calls = list(client.calls)
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        resumed = make(tmp_path, monkeypatch, client=client, production_limits=effective_limits({}))
        result = asyncio.run(resumed.run())
    assert result['status'] == 'blocked' and 'unknown' in result['reason']
    assert resumed.state['providerUsage']['uncertain']
    assert client.calls == calls


class ParallelClient(Client):
    def __init__(self):
        super().__init__()
        self.lock = threading.Lock()
        self.generating = 0
        self.peak = 0
        self.started = threading.Event()
        self.release = threading.Event()
        self.timeline = []

    def image_start(self, run_id, request):
        with self.lock:
            self.generating += 1
            self.peak = max(self.peak, self.generating)
            self.timeline.append(('generate', request['identityKey']))
            if self.generating == 2:
                self.started.set()
        assert self.release.wait(15), 'Provider calls did not overlap'
        with self.lock:
            result = super().image_start(run_id, request)
            self.generating -= 1
            return result

    def image_accept(self, run_id, decision):
        with self.lock:
            job = next(job for job in self.jobs if job['id'] == decision['jobId'])
            assert job['candidate']['artifact']['sha256'] == decision['candidateSha256']
            job['status'] = 'accepted'
            self.calls.append('image_accept')
            return self.reply('run.image.accept', {'job': deepcopy(job)})

    def compile(self, run_id):
        self.calls.append('compile')
        return self.reply('run.compile', {'assetWorklist': []})


def test_reconcile_completed_generation_after_process_loss_without_dispatch(tmp_path, monkeypatch):
    from test_consumption import IMAGE_CONSUMPTION
    from vox_crew.consumption import public_consumption
    from vox_crew.autonomous import AutonomousRun
    from vox_crew.hosted import write_json
    from vox_crew.image_workflow import reconcile_saved_images
    from vox_crew.studio_continuation import checkpoint_view
    from test_autonomous import Reviewer

    class LostGeneration(Client):
        def image_start(self, run_id, request):
            super().image_start(run_id, request)
            self.jobs[-1]['id'] = AutonomousRun.image_job_id(request)
            self.jobs[-1]['consumption'] = deepcopy(IMAGE_CONSUMPTION)
            raise Crash('The provider result was persisted but never returned to the worker')

        def image_status(self, run_id, job_id):
            job = next(job for job in self.jobs if job['id'] == job_id)
            return self.reply('run.image.status', {'job': deepcopy(job)})

    client = LostGeneration()
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        run = make(tmp_path, monkeypatch, client=client, director=Director((True,)),
            production_limits=effective_limits({}))
        with pytest.raises(Crash):
            asyncio.run(run.run())
    saved = checkpoint_view(tmp_path)
    assert saved['providerUsage']['uncertain']
    before = list(client.calls)
    reconciled = reconcile_saved_images(tmp_path, saved, client)
    assert client.calls == before and not reconciled['providerUsage']['uncertain']
    assert public_consumption(reconciled)['imageEstimatedSubtotalUsd'] == pytest.approx(0.13784)
    write_json(run.path, reconciled)
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        resumed = make(tmp_path, monkeypatch, client=client, reviewer=Reviewer(images=(True,)),
            production_limits=effective_limits({}))
        assert asyncio.run(resumed.run())['status'] == 'ready'
    assert client.calls.count('image_start') == 1
    assert public_consumption(resumed.state)['imageCostedCalls'] == 1


def test_parallel_stop_saves_inflight_results_and_prevents_queued_dispatch(tmp_path, monkeypatch):
    async def scenario():
        client = ParallelClient()
        stopped = False
        with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
            run = make(tmp_path, monkeypatch, client=client, director=Director((True,)),
                production_limits=effective_limits({}), stop_requested=lambda: stopped)
            run.planner = MultipleImages()
            task = asyncio.create_task(run.run())
            assert await asyncio.to_thread(client.started.wait, 15)
            stopped = True
            client.release.set()
            result = await asyncio.wait_for(task, 20)
        assert result['status'] == 'blocked' and result['code'] == 'stopped'
        assert client.calls.count('image_start') == 2
        assert len(client.jobs) == 2 and all(job['status'] == 'candidate' for job in client.jobs)
        assert not run.state['providerUsage']['uncertain']
        assert run.state['providerUsage']['images'] == 2
        assert client.calls.count('render') == 0
    asyncio.run(scenario())


class MultipleImages(Planner):
    async def plan(self, *args, **kwargs):
        plan = await super().plan(*args, **kwargs)
        first = plan['sections'][0]['scenes'][0]
        plan['sections'][0]['scenes'] = [{**deepcopy(first), 'id': 'scene-' + str(i),
            'props': {'assetRequirement': {**REQ, 'identityKey': 'rocket-' + str(i)}}} for i in range(4)]
        return plan


class ConcurrentReviewer:
    def __init__(self, client):
        self.client = client
        self.active, self.peak = 0, 0
        self.two = asyncio.Event()
        self.release = asyncio.Event()

    async def review(self, data, mime, expected, context):
        assert mime == 'image/png', 'Final audiovisual review must never run'
        self.active += 1
        self.peak = max(self.peak, self.active)
        self.client.timeline.append(('review', context['imageIdentity']))
        if self.active == 2:
            self.two.set()
        await self.release.wait()
        self.active -= 1
        return media_review(True)


def test_adk_overlaps_generation_and_review_with_two_separate_capacities(tmp_path, monkeypatch):
    async def scenario():
        client = ParallelClient()
        reviewer = ConcurrentReviewer(client)
        with ProviderJournal(tmp_path / 'provider.jsonl', max_calls=None, max_grounded_calls=None):
            run = make(tmp_path, monkeypatch, client=client, director=Director((True,)),
                reviewer=reviewer, production_limits=effective_limits({}))
            run.planner = MultipleImages()
            task = asyncio.create_task(run.run())
            assert await asyncio.to_thread(client.started.wait, 15)
            client.release.set()
            await asyncio.wait_for(reviewer.two.wait(), 15)
            # Reviews are held open while subsequent images may use generation slots.
            deadline = time.monotonic() + 15
            while len([x for x in client.timeline if x[0] == 'generate']) < 4:
                assert time.monotonic() < deadline
                await asyncio.sleep(.01)
            reviewer.release.set()
            result = await asyncio.wait_for(task, 15)
            assert result['status'] == 'ready', result
            assert client.peak == reviewer.peak == 2
            assert client.calls.count('image_start') == 4
            assert client.calls.count('render') == 1
            assert len(run.state['images']) == 4
            assert all(rows[-1]['accepted'] for rows in run.state['images'].values())
            assert run.state['providerUsage']['images'] == 4
            assert run.state['providerUsage']['takes'] == 1
            assert not run.state['providerUsage']['uncertain']
            assert len(list(tmp_path.glob('image-pipelines/*/checkpoint.json'))) == 4
            assert (tmp_path / 'image-workflow.sqlite3').is_file()
            assert len({e['sequence'] for e in run.state['events']}) == len(run.state['events'])
            saved = json.loads(run.path.read_text())
            assert saved['terminal']['status'] == 'ready'
    asyncio.run(scenario())
