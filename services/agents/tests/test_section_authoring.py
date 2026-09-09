"""Long films keep global context while authoring and recovering individual sections."""
import asyncio
from copy import deepcopy
import json

import pytest

from test_model_recovery import setup, runner, TRUNCATED
from vox_crew.adk_roles import AdkSceneAuthor, AdkPlanRepair
from vox_crew.autonomous_contract import digest
from vox_crew.provider_usage import ProviderJournal


def long_run(tmp_path, monkeypatch, answers):
    run, calls = setup(tmp_path, monkeypatch, answers)
    run.brief = type(run.brief).from_mapping({**run.brief.to_mapping(), 'durationSeconds': 300})
    narrative = deepcopy(run.state['narrative'])
    narrative['beats'] = [{**narrative['beats'][0], 'id': f'b{i}', 'text': f'The evidence supports part {i}.'} for i in range(1, 6)]
    run.state['narrative'] = narrative
    structure = {'beats': [{'id': b['id'], 'text': b['text']} for b in narrative['beats']],
        'sections': [{'id': f'section-{i}', 'spansBeats': [f'b{i}'],
                      'scenes': [{'id': f'scene-{i}', 'component': 'typographic_statement', 'spansBeats': [f'b{i}']}]} for i in range(1, 6)]}
    run.planner._structurer.answer = structure
    run.planner._scene_author = AdkSceneAuthor(model='gemini-3.5-flash')
    return run, calls, structure


def fill(index):
    return {'scenes': [{'id': f'scene-{index}', 'props': {'statement': f'Part {index}'}}]}


def test_five_minute_film_authors_each_section_once_and_validates_whole_plan(tmp_path, monkeypatch):
    run, calls, structure = long_run(tmp_path, monkeypatch, [json.dumps(fill(i)) for i in range(1, 6)])
    validated = []
    run.planner._validate_plan = lambda plan: validated.append(deepcopy(plan)) or {'ok': True}
    with ProviderJournal(tmp_path / 'provider.jsonl') as journal:
        plan = asyncio.run(run.compose())
        assert asyncio.run(run.compose()) == plan
    assert [s['scenes'][0]['id'] for s in plan['sections']] == [f'scene-{i}' for i in range(1, 6)]
    assert plan['beats'] == structure['beats'] and len(calls) == 5
    assert len(validated) == 1 and validated[0] == plan
    assert journal.summary()['calls'] == 5 and run.state['technicalRepairs'] == 0
    sections = [v for v in run.state['compositionSteps'].values() if v['name'] == 'scene_author']
    assert len(sections) == 5
    for saved in sections:
        assert len(saved['dependencies']['structure']['sections']) == 1
        assert saved['dependencies']['context']['filmStructure'] == structure


def test_failed_middle_section_retries_only_itself(tmp_path, monkeypatch):
    answers = [json.dumps(fill(1)), TRUNCATED, json.dumps(fill(2)), *[json.dumps(fill(i)) for i in range(3, 6)]]
    run, calls, structure = long_run(tmp_path, monkeypatch, answers)
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        plan = asyncio.run(run.compose())
    assert len(calls) == 6 and len(plan['sections']) == 5
    assert run.state['technicalRepairs'] == 1
    assert run.state['modelResponseFailures'][0]['pendingComposition']['name'] == 'scene_author'


@pytest.mark.parametrize('model', ['gemini-3.5-flash', 'gemini-3.6-flash'])
@pytest.mark.parametrize('adapter', [AdkSceneAuthor, AdkPlanRepair])
def test_author_and_repair_receive_model_capacity_on_first_call_and_legacy_retry(tmp_path, monkeypatch, model, adapter):
    from vox_crew.model_recovery import RECOVERY
    monkeypatch.setenv('GOOGLE_CLOUD_PROJECT', 'offline-test')
    role = adapter(model=model).role
    assert role.agent('Return JSON.').generate_content_config.max_output_tokens == 65536
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        assert role.agent('Return JSON.').generate_content_config.max_output_tokens == 65536
        token = RECOVERY.set({'maxOutputTokens': 16384})
        try:
            assert role.agent('Return JSON.').generate_content_config.max_output_tokens == 65536
        finally:
            RECOVERY.reset(token)


def test_sections_have_fresh_sessions_and_exact_asset_continuity(tmp_path, monkeypatch):
    run, _, structure = long_run(tmp_path, monkeypatch, [])
    asset = {'type': 'image', 'identityKey': 'shared', 'subject': 'One reusable rocket',
             'treatment': 'illustration', 'orientation': 'landscape'}
    first = fill(1)
    first['scenes'][0]['props']['assetRequirement'] = asset
    turns = []
    runner(monkeypatch, [json.dumps(first), *[json.dumps(fill(i)) for i in range(2, 6)]], turns=turns)
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        asyncio.run(run.compose())
    assert len({turn['session_id'] for turn in turns}) == 5
    contexts = [json.loads(turn['new_message'].parts[0].text)['editorialContext'] for turn in turns]
    assert contexts[0]['assetContinuity'] == []
    assert all(c['assetContinuity'] == [{'sceneId': 'scene-1', 'assetRequirement': asset}] for c in contexts[1:])
    assert all(c['filmStructure'] == structure for c in contexts)


def test_call_limit_then_restart_keeps_completed_sections(tmp_path, monkeypatch):
    from vox_crew.studio_controls import apply_correction, ProductionLimits
    run, calls, _ = long_run(tmp_path, monkeypatch, [json.dumps(fill(i)) for i in (1, 2)])
    run.prepare = run.compose
    with ProviderJournal(tmp_path / 'provider.jsonl', max_calls=2):
        assert asyncio.run(run.run())['code'] == 'limit'
    before = deepcopy(run.state['compositionSteps'])
    assert len(before) == 3  # Structurer and two complete sections.
    limits = ProductionLimits(maxCalls=40, maxSearches=4, maxImages=5).model_dump()
    decision = {'id': 'extension', 'request': {'correction': {'target': 'continue', 'instruction': ''}}}
    run.state = apply_correction(run.state, decision, {'limits': limits})
    run.save()
    restored, next_calls, _ = long_run(tmp_path, monkeypatch, [json.dumps(fill(i)) for i in (3, 4, 5)])
    with ProviderJournal(tmp_path / 'provider.jsonl') as journal:
        assert len(asyncio.run(restored.compose())['sections']) == 5
    assert len(next_calls) == 3 and journal.summary()['calls'] == 5
    assert all(digest(restored.state['compositionSteps'][key]) == digest(value) for key, value in before.items())
    assert restored.state['technicalRepairs'] == 0


def test_whole_film_checkpoint_from_previous_worker_is_reused(tmp_path, monkeypatch):
    run, calls, structure = long_run(tmp_path, monkeypatch, [])
    saved = {'scenes': [fill(i)['scenes'][0] for i in range(1, 6)]}
    original_checkpoint = run.composition_step

    async def checkpoint(name, dependencies, fn):
        if name == 'scene_author' and fn is None:
            identity = digest({'name': name, 'dependencies': dependencies})
            run.state.setdefault('compositionSteps', {})[identity] = {
                'name': name, 'dependencies': deepcopy(dependencies), 'result': saved}
        return await original_checkpoint(name, dependencies, fn)

    run.composition_step = checkpoint
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        plan = asyncio.run(run.compose())
    assert len(plan['sections']) == 5 and not calls


def test_uncertain_second_section_preserves_first_without_repeating_any_call(tmp_path, monkeypatch):
    from vox_crew.autonomous import AutonomousBlocked
    run, calls, _ = long_run(tmp_path, monkeypatch, [json.dumps(fill(1)), ConnectionError('lost response')])
    run.prepare = run.compose
    with ProviderJournal(tmp_path / 'provider.jsonl') as journal:
        assert asyncio.run(run.run())['status'] == 'blocked'
        assert journal.summary()['uncertain']
    assert len([v for v in run.state['compositionSteps'].values() if v['name'] == 'scene_author']) == 1
    with pytest.raises(AutonomousBlocked, match='interrupted'):
        asyncio.run(run.run())
    assert len(calls) == 2 and run.state['technicalRepairs'] == 0


def test_out_of_section_fill_is_refused_and_full_plan_never_validated(tmp_path, monkeypatch):
    run, calls, _ = long_run(tmp_path, monkeypatch, [json.dumps(fill(2))] * 3)
    run.prepare = run.compose
    validated = []
    run.planner._validate_plan = lambda plan: validated.append(plan) or {'ok': True}
    with ProviderJournal(tmp_path / 'provider.jsonl'):
        assert asyncio.run(run.run())['code'] == 'model_response'
    assert not validated and len(calls) == 3
    assert all(v['name'] != 'scene_author' for v in run.state['compositionSteps'].values())
