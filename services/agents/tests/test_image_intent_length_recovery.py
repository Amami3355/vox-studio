"""An answered intention must be dispatchable before it becomes reusable work."""
import asyncio
from copy import deepcopy
import json

import pytest

from test_autonomous import Director, INTENT, REQ, BIBLE, Reviewer, make
from vox_crew.autonomous_contract import digest
from vox_crew.image_generation import AssetRequirement
from vox_crew.provider_usage import ProviderJournal, begin_call, finish_call
from vox_crew.studio_controls import effective_limits


class CompactingDirector(Director):
    calls = 0

    async def image_intent(self, payload):
        self.calls += 1
        answer = {**INTENT, 'rendererElements': [],
                  'arrangement': 'x' * 4100 if self.calls == 1 else 'Centered rocket'}
        call = begin_call('ImageCreator', 'fixture', max_output_tokens=8192)
        finish_call(call, answerParts=[{'text': json.dumps(answer)}], finishReason='STOP')
        return answer


def test_long_intention_repairs_before_caching_or_image_dispatch(tmp_path, monkeypatch):
    director = CompactingDirector((True,))
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        run = make(tmp_path, monkeypatch, director=director, reviewer=Reviewer(images=(True,)),
                   production_limits=effective_limits({}))
        assert asyncio.run(run.run())['status'] == 'ready'
    assert director.calls == 2
    assert run.client.calls.count('image_start') == 1
    assert run.client.calls.count('record') == 1
    assert run.state['technicalRepairs'] == 1


@pytest.mark.parametrize('answered', [True, False])
def test_historical_long_cached_intention_requires_answer_evidence(tmp_path, monkeypatch, answered):
    director = CompactingDirector((True,))
    director.calls = 1  # The next answer is compact.
    run = make(tmp_path, monkeypatch, director=director, reviewer=Reviewer(images=(True,)),
               production_limits=effective_limits({}))
    run.state.update(visualBible=BIBLE, videoPlan={'sections': []}, runId='run-1')
    requirement = AssetRequirement.from_mapping(REQ)
    context = run.context() | {'requirement': requirement.to_mapping(),
        'videoPlan': run.state['videoPlan'], 'previousCandidates': [], 'imagePromptVersion': 3}
    dependencies = {'identity': requirement.identity, 'revision': 0, 'context': context}
    identity = digest({'name': 'image_intent', 'dependencies': dependencies})
    invalid = {**INTENT, 'rendererElements': [], 'arrangement': 'x' * 4100}
    original = {'name': 'image_intent', 'dependencies': dependencies, 'result': invalid}
    run.state['steps'][identity] = deepcopy(original)
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None) as journal:
        run.journal = journal
        journal.operation_identity = lambda: identity
        call = begin_call('ImageCreator', 'fixture', max_output_tokens=8192)
        if answered:
            finish_call(call, answerParts=[{'text': json.dumps(invalid)}], finishReason='STOP')
        records = deepcopy(journal.records)
        if not answered:
            from vox_crew.autonomous_roles import ImageIntentViolation
            with pytest.raises(ImageIntentViolation):
                asyncio.run(run.image_requirement(requirement))
            assert run.state['steps'][identity] == original
            assert director.calls == 1
        else:
            asyncio.run(run.image_requirement(requirement))
            assert run.state['images'][requirement.identity][-1]['accepted']
            assert director.calls == 2
            assert run.state['steps'][identity]['result']['arrangement'] == 'Centered rocket'
            assert run.state['invalidatedModelSteps'][-1]['step'] == original
        assert journal.records[:len(records)] == records
