"""All image branches settle before a non-repeatable failure reaches Studio."""
import asyncio

import pytest

from test_autonomous import REQ, make
from vox_crew.autonomous import AutonomousBlocked, AutonomousRun, ImageReviewNeedsAction
from vox_crew.image_generation import AssetRequirement
from vox_crew.image_workflow import run_image_workflow
from vox_crew.model_recovery import ModelRecoveryStalled, RESPONSE_RECOVERY_VERSION
from vox_crew.provider_usage import ProviderJournal, begin_call
from vox_crew.studio_controls import continuation_options, effective_limits


@pytest.mark.parametrize('action_error,code', [
    (ImageReviewNeedsAction('The saved image cannot be inspected.'), 'image_review_requires_action'),
    (ModelRecoveryStalled('The same image response failed validation.'), 'model_response'),
])
@pytest.mark.parametrize('unknown', [False, True])
def test_parallel_failure_preserves_intervention_after_earlier_error(tmp_path, monkeypatch, action_error, code, unknown):
    run = make(tmp_path, monkeypatch, production_limits=effective_limits({}))
    run.state.update(phase='production', videoPlan={'sections': []}, runId='run-1')
    run.state['productionSnapshot'] = run.snapshot()
    completed = []

    async def image_requirement(child, requirement):
        if requirement.identity == 'first':
            if unknown:
                begin_call('ImageCreator', 'fixture')  # No response: reconciliation stays mandatory.
            completed.append('first')
            raise AutonomousBlocked('The first image operation requires reconciliation.')
        # The ordinary failure must finish first; no provider work occurs here.
        while not completed:
            await asyncio.sleep(0)
        completed.append('second')
        raise action_error

    monkeypatch.setattr(AutonomousRun, 'image_requirement', image_requirement)

    async def produce():
        requirements = [AssetRequirement.from_mapping({**REQ, 'identityKey': identity})
                        for identity in ('first', 'second')]
        await run_image_workflow(run, requirements)

    run.produce = produce
    with ProviderJournal(tmp_path / 'provider-calls.jsonl', max_calls=None, max_grounded_calls=None):
        terminal = asyncio.run(run.run())
    assert completed == ['first', 'second']
    assert terminal['code'] == code
    assert continuation_options(run.state)[0] == []
    if isinstance(action_error, ModelRecoveryStalled):
        assert terminal['responseRecoveryStalled'] == RESPONSE_RECOVERY_VERSION
    assert all(branch['status'] == 'blocked' for branch in run.state['imagePipelines'].values())
    assert run.state['providerUsage']['uncertain'] is unknown
    assert run.state['providerUsage']['calls'] == int(unknown)
    assert not run.client.calls
