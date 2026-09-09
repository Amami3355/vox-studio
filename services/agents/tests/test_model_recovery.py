"""Real role parsing and durable execution recovery, with recorded public output only."""
import asyncio
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from test_autonomous import make
from test_visual_planner import (inputs, Structurer, SceneAuthor, catalog_contract, green)
from vox_crew.adk_roles import AdkSceneAuthor
from vox_crew.provider_usage import ProviderJournal
from vox_crew.visual_planner import PublishedCatalog, SplitVisualPlanner

TRUNCATED = (Path(__file__).parent / 'fixtures/scene-author-truncated.txt').read_text(encoding='utf-8')
GOOD = SceneAuthor().answer


def runner(monkeypatch, answers, *, turns=None):
    from google.genai import types
    from google.adk.events import Event
    responses, calls = iter(answers), []

    class Runner:
        def __init__(self, *, agent, **kwargs):
            self.agent = agent

        async def run_async(self, **kwargs):
            calls.append(self.agent)
            if turns is not None:
                turns.append(kwargs)
            request = SimpleNamespace(model_dump_json=lambda **kw: '{}')
            self.agent.before_model_callback(None, request)
            answer = next(responses)
            if isinstance(answer, BaseException):
                raise answer
            reason = types.FinishReason.MAX_TOKENS if answer == TRUNCATED else types.FinishReason.STOP
            if isinstance(answer, tuple):
                answer, reason = answer
            event = Event(author=self.agent.name,
                content=types.Content(role='model', parts=[types.Part(text=answer)]) if answer is not None else None,
                finish_reason=reason, error_code=reason if answer is None else None)
            self.agent.after_model_callback(None, event)
            yield event

    monkeypatch.setenv('GOOGLE_CLOUD_PROJECT', 'offline-test')
    monkeypatch.setattr('google.adk.runners.Runner', Runner)
    return calls


def setup(tmp_path, monkeypatch, answers, *, repairs=2):
    calls = runner(monkeypatch, answers)
    run = make(tmp_path, monkeypatch)
    run.production_limits = {'maxTechnicalRepairs': repairs}
    brief, dossier, narrative, bible = inputs()
    run.brief = brief
    run.vocabulary = SimpleNamespace(themes={bible.theme}, motion_intents=set(bible.motion_intent),
                                    color_roles=set(bible.color_roles), treatments=set(bible.treatments))
    run.state.update(researchDossier=dossier.to_mapping(), narrative=narrative.to_mapping(),
                     visualBible=bible.to_mapping(), editorialBrief={})
    class SavedStructurer(Structurer):
        async def structure(self, *args, **kwargs):
            return await super().structure(*args)
    run.planner = SplitVisualPlanner(PublishedCatalog.from_mapping(catalog_contract()), SavedStructurer(),
        AdkSceneAuthor(model='test-model'), validate_scene=green, validate_plan=green, repair_budget=repairs)
    return run, calls


def test_recorded_truncation_recovers_at_scene_author_without_repeating_structure(tmp_path, monkeypatch):
    run, calls = setup(tmp_path, monkeypatch, [TRUNCATED, json.dumps(GOOD)])
    before = deepcopy(run.state['narrative'])
    with ProviderJournal(tmp_path / 'provider.jsonl') as journal:
        plan = asyncio.run(run.compose())
        assert asyncio.run(run.compose()) == plan
    assert len(calls) == 2
    assert run.state['narrative'] == before
    assert run.state['technicalRepairs'] == 1
    assert len(run.state['compositionSteps']) == 2
    assert run.state['pending'] is None and run.state['pendingComposition'] is None
    assert journal.summary()['calls'] == 2 and not journal.summary()['uncertain']
    assert [r['finishReason'] for r in journal.records if r['status'] == 'responded'] == ['MAX_TOKENS', 'STOP']
    assert calls[1].generate_content_config.max_output_tokens > calls[0].generate_content_config.max_output_tokens


@pytest.mark.parametrize('bad', ['[]', '{"scenes": []}', TRUNCATED])
def test_invalid_format_and_incomplete_scene_set_share_bounded_recovery(tmp_path, monkeypatch, bad):
    run, calls = setup(tmp_path, monkeypatch, [bad, bad, bad, json.dumps(GOOD)])
    async def prepare():
        await run.compose()
    run.prepare = prepare
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        result = asyncio.run(run.run())
    assert len(calls) == 3
    assert result['code'] == 'model_response'
    assert run.state['technicalRepairs'] == 2
    assert 'JSON' not in result['reason'] and 'ContractViolation' not in result['reason']
    assert run.state['events'][-1]['phase'] == 'composition'
    assert not run.client.calls


def test_uncertain_dispatch_is_never_retried(tmp_path, monkeypatch):
    run, calls = setup(tmp_path, monkeypatch, [ConnectionError('private provider failure'), json.dumps(GOOD)])
    async def prepare():
        await run.compose()
    run.prepare = prepare
    with ProviderJournal(tmp_path / 'provider.jsonl') as journal:
        result = asyncio.run(run.run())
    assert len(calls) == 1 and journal.summary()['uncertain']
    assert run.state['technicalRepairs'] == 0
    assert run.state['pendingComposition']['name'] == 'scene_author'
    assert 'recoverableFailure' not in run.state
    assert 'private provider failure' not in result['reason']


@pytest.mark.parametrize('repairs,max_calls,expected_code', [(0, 40, 'model_response'), (2, 1, 'limit')])
def test_no_retry_when_either_allowance_is_exhausted(tmp_path, monkeypatch, repairs, max_calls, expected_code):
    run, calls = setup(tmp_path, monkeypatch, [TRUNCATED, json.dumps(GOOD)], repairs=repairs)
    run.prepare = run.compose
    with ProviderJournal(tmp_path / 'provider.jsonl', max_calls=max_calls):
        result = asyncio.run(run.run())
    assert result['code'] == expected_code
    assert len(calls) == 1 and run.state['technicalRepairs'] == 0
    assert run.state['pendingModelRecovery']['step'] == 'scene_author'


def test_expired_authorization_is_a_limit_without_any_dispatch(tmp_path, monkeypatch):
    run, calls = setup(tmp_path, monkeypatch, [json.dumps(GOOD)])
    run.prepare = run.compose
    with ProviderJournal(tmp_path / 'provider.jsonl') as journal:
        journal.expires_at = '2000-01-01T00:00:00Z'
        result = asyncio.run(run.run())
    assert result['code'] == 'limit'
    assert journal.summary()['calls'] == 0
    assert run.state['technicalRepairs'] == 0
    assert run.state['pending'] is None


def test_crash_during_retry_preserves_reservation_and_never_replays(tmp_path, monkeypatch):
    class Crash(BaseException):
        pass
    run, calls = setup(tmp_path, monkeypatch, [TRUNCATED, Crash(), json.dumps(GOOD)])
    with ProviderJournal(tmp_path / 'provider.jsonl') as journal, pytest.raises(Crash):
        asyncio.run(run.compose())
    saved = json.loads(run.path.read_text(encoding='utf-8'))
    assert saved['technicalRepairs'] == 1 and saved['pendingComposition']['name'] == 'scene_author'
    assert journal.summary()['uncertain'] and len(calls) == 2
    from vox_crew.autonomous import AutonomousBlocked
    with pytest.raises(AutonomousBlocked, match='interrupted'):
        asyncio.run(run.run())
    assert len(calls) == 2


@pytest.mark.parametrize('step,name', [('director.interpret', 'Director'), ('narrative', 'NarrativeAgent'),
    ('art_direction', 'ArtDirectorAgent'), ('image_intent', 'ImageCreator'), ('director.coverage', 'Director')])
def test_other_model_steps_use_the_same_recovery_budget(tmp_path, monkeypatch, step, name):
    from vox_crew.adk_roles import AdkJsonRole
    calls = runner(monkeypatch, ['[', '{"complete":true}'])
    run = make(tmp_path, monkeypatch)
    role = AdkJsonRole(name, 'Fixture', model='test-model')
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        value = asyncio.run(run.step(step, {}, lambda: role.ask('Return JSON.', {})))
    assert value == {'complete': True}
    assert len(calls) == 2 and run.state['technicalRepairs'] == 1


def test_format_recovery_and_plan_validation_share_one_total(tmp_path, monkeypatch):
    from vox_crew.adk_roles import AdkPlanRepair
    from test_visual_planner import refuses_once
    run, calls = setup(tmp_path, monkeypatch, [TRUNCATED, json.dumps(GOOD), json.dumps(GOOD)])
    run.planner._validate_scene = refuses_once()
    run.planner._repair = AdkPlanRepair(model='test-model')
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        plan = asyncio.run(run.compose())
    assert plan['sections'][0]['scenes'][0]['id'] == 'claim'
    assert len(calls) == 3 and run.state['technicalRepairs'] == run.planner.repairs_spent == 2
    # Cached composition must not roll back a later global repair reservation.
    run.state['technicalRepairs'] = 3
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        assert asyncio.run(run.compose()) == plan
    assert run.state['technicalRepairs'] == 3


def test_plan_repair_with_malformed_output_does_not_get_an_extra_budget(tmp_path, monkeypatch):
    from vox_crew.adk_roles import AdkPlanRepair
    from test_visual_planner import red
    run, calls = setup(tmp_path, monkeypatch, [json.dumps(GOOD), TRUNCATED, TRUNCATED, json.dumps(GOOD)])
    run.planner._validate_scene = red
    run.planner._repair = AdkPlanRepair(model='test-model')
    run.prepare = run.compose
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        result = asyncio.run(run.run())
    assert result['code'] == 'model_response'
    assert len(calls) == 3 and run.state['technicalRepairs'] == 2


def test_retry_limit_extension_preserves_steps_and_charges_next_repair(tmp_path, monkeypatch):
    from vox_crew.studio_controls import apply_correction, continuation_options, ProductionLimits
    run, calls = setup(tmp_path, monkeypatch, [TRUNCATED, json.dumps(GOOD)], repairs=0)
    run.prepare = run.compose
    run.state.update(runId='run-1', imageReviewMode='studio')
    run.state['productionSnapshot'] = run.snapshot()
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        assert asyncio.run(run.run())['code'] == 'model_response'
    assert continuation_options(run.state)[0] == ['continue']
    limits = ProductionLimits(maxTechnicalRepairs=1).model_dump()
    before_steps = deepcopy(run.state['compositionSteps'])
    decision = {'id': 'decision', 'request': {'correction': {'target': 'continue', 'instruction': ''}}}
    run.state = apply_correction(run.state, decision, {'limits': limits})
    run.production_limits = limits
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        plan = asyncio.run(run.compose())
    assert plan and len(calls) == 2 and run.state['technicalRepairs'] == 1
    assert all(run.state['compositionSteps'][key] == value for key, value in before_steps.items())
    assert 'pendingModelRecovery' not in run.state


@pytest.mark.parametrize('text', [None, json.dumps(GOOD)])
def test_max_tokens_is_recovered_even_with_empty_or_parseable_output(tmp_path, monkeypatch, text):
    run, calls = setup(tmp_path, monkeypatch, [(text, 'MAX_TOKENS'), json.dumps(GOOD)])
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        assert asyncio.run(run.compose())
    assert len(calls) == 2 and run.state['technicalRepairs'] == 1


def test_provider_refusal_is_not_retried_as_a_format_error(tmp_path, monkeypatch):
    run, calls = setup(tmp_path, monkeypatch, [(None, 'SAFETY'), json.dumps(GOOD)])
    run.prepare = run.compose
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        result = asyncio.run(run.run())
    assert len(calls) == 1 and run.state['technicalRepairs'] == 0
    assert result['code'] == 'provider_response' and 'JSON' not in result['reason']


def test_media_review_format_recovery_preserves_inspected_bytes(tmp_path, monkeypatch):
    from hashlib import sha256
    from vox_crew.autonomous_roles import MediaReviewer
    from test_autonomous import media_review
    seen = []
    answers = iter(['{', json.dumps(media_review())])
    async def generate(**kwargs):
        seen.append(kwargs)
        return SimpleNamespace(text=next(answers), usage_metadata=None)
    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    reviewer = MediaReviewer(client_factory=lambda: client)
    run = make(tmp_path, monkeypatch)
    data = b'unchanged image candidate'
    with ProviderJournal(tmp_path / 'provider.jsonl') as journal:
        value = asyncio.run(run.step('image_review', {'sha256': sha256(data).hexdigest()},
            lambda: reviewer.review(data, 'image/png', sha256(data).hexdigest(), {})))
    assert value['accepted'] and len(seen) == 2
    assert all(call['contents'][-1].inline_data.data == data for call in seen)
    assert journal.summary()['images'] == 0 and run.state['technicalRepairs'] == 1
