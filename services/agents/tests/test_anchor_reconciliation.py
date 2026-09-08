from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import runpy
from types import SimpleNamespace

import pytest

from test_anchor_repair import fixture

reconcile = runpy.run_path(str(Path(__file__).resolve().parents[3] /
    'deploy/crew/autonomous/reconcile_anchor.py'))['reconcile']


@pytest.mark.parametrize('problem', [None, 'dispatch', 'snapshot', 'ambiguous', 'recorded', 'count'])
def test_reconcile_checks_evidence_before_clearing_only_the_block(tmp_path, problem):
    if os.name == 'nt':
        tmp_path = Path(chr(92) * 2 + '?' + chr(92) + str(tmp_path.resolve()))
    plan, report = fixture()
    work = tmp_path / 'briefs' / sha256(b'test').hexdigest()
    work.mkdir(parents=True)
    state = {'schemaVersion': 2, 'phase': 'production', 'runId': 'run', 'technicalRepairs': 1,
        'videoPlan': plan, 'steps': {}, 'limits': {'maxCalls': 40, 'maxSearches': 4, 'maxImages': 5},
        'terminal': {'status': 'blocked', 'runId': 'run', 'reason': 'The shared technical PlanRepair budget was exhausted.'},
        'pending': {'name': 'technical_repair', 'identity': 'pending', 'dependencies': {'plan': plan, 'report': report}},
        'productionSnapshot': {'stage': 'initialized', 'data': {'artifacts': []}}}
    rows = [{'id': 'call', 'role': 'PlanRepairAgent', 'status': 'dispatched'}, {'id': 'call', 'status': 'responded'}]
    snapshot = deepcopy(state['productionSnapshot'])
    if problem == 'dispatch': rows.pop()
    if problem == 'snapshot': snapshot['data'] = {'changed': True}
    if problem == 'ambiguous': plan['sections'][0]['scenes'][0]['events'][0]['at'] = 'b.start'
    if problem == 'recorded': state['take'] = {'id': 'take'}
    path = work / 'autonomous-v2.json'
    path.write_text(json.dumps(state))
    journal = work / 'provider-calls.jsonl'
    journal.write_text('\n'.join(json.dumps(row) for row in rows))
    original, original_journal = path.read_bytes(), journal.read_bytes()
    client = SimpleNamespace(status=lambda _: SimpleNamespace(succeeded=True,
        run=SimpleNamespace(stage=snapshot['stage']), data=snapshot['data']))
    if problem:
        with pytest.raises(AssertionError):
            reconcile(tmp_path, 'test', 2 if problem == 'count' else 1, client, apply=True)
        assert path.read_bytes() == original
        assert not (work / 'reconciliations').exists()
    else:
        preview = reconcile(tmp_path, 'test', 1, client)
        assert not preview['applied'] and path.read_bytes() == original
        receipt = reconcile(tmp_path, 'test', 1, client, apply=True)
        updated = json.loads(path.read_text())
        assert updated.pop('reconciliations') == [receipt]
        assert updated == {**state, 'pending': None, 'terminal': None}
        archive = work / 'reconciliations' / sha256(original).hexdigest()
        assert (archive / 'autonomous-v2.json').read_bytes() == original
        assert (archive / 'provider-calls.jsonl').read_bytes() == original_journal
    assert journal.read_bytes() == original_journal
