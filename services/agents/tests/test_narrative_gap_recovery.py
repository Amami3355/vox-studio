"""Malformed evidence-gap answers are repaired before becoming checkpoints."""
import asyncio
import json

import pytest

from test_autonomous import Director, make
from vox_crew.provider_usage import ProviderJournal, begin_call, finish_call


@pytest.mark.parametrize('gaps', [[], '', [''], [1], None])
def test_invalid_evidence_gaps_repair_without_repeating_research(tmp_path, monkeypatch, gaps):
    run = make(tmp_path, monkeypatch, director=Director((True,)))
    original = run.creative.narrate
    calls = []

    async def narrate(*args):
        call = begin_call('NarrativeAgent', 'fixture', max_output_tokens=8192)
        value = {'insufficientEvidence': gaps} if not calls else await original(*args)
        calls.append(value)
        finish_call(call, answerParts=[{'text': json.dumps(value)}], finishReason='STOP')
        return value

    run.creative.narrate = narrate
    with ProviderJournal(tmp_path / 'provider-calls.jsonl'):
        asyncio.run(run.prepare())
    assert len(calls) == 2
    assert len(run.research.calls) == 1
    assert run.state['technicalRepairs'] == 1
    assert all('insufficientEvidence' not in s['result'] for s in run.state['steps'].values()
               if s['name'] == 'narrative')


def test_valid_evidence_gaps_request_research_without_response_repair(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch, director=Director((True, True)))
    original = run.creative.narrate
    calls = []

    async def narrate(*args):
        value = {'insufficientEvidence': ['Explain the mechanism']} if not calls else await original(*args)
        calls.append(value)
        return value

    run.creative.narrate = narrate
    asyncio.run(run.prepare())
    assert len(run.research.calls) == len(calls) == 2
    assert run.state['technicalRepairs'] == 0
