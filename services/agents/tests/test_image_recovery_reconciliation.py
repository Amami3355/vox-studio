from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import runpy
from types import SimpleNamespace

import pytest

reconcile = runpy.run_path(str(Path(__file__).resolve().parents[3] /
    'deploy/crew/autonomous/reconcile_image_recovery.py'))['reconcile']


@pytest.mark.parametrize('problem', [None, 'pending', 'snapshot', 'uncertain', 'count', 'policy'])
def test_image_recovery_preserves_plan_take_and_consumed_calls(tmp_path, problem):
    if os.name == 'nt':
        tmp_path = Path(chr(92) * 2 + '?' + chr(92) + str(tmp_path.resolve()))
    work = tmp_path / 'briefs' / sha256(b'test').hexdigest()
    work.mkdir(parents=True)
    state = {'schemaVersion': 2, 'phase': 'production', 'runId': 'run',
        'videoPlan': {'unchanged': True}, 'take': {'id': 'take'},
        'limits': {'maxCalls': 40, 'maxImages': 5}, 'pending': None,
        'terminal': {'status': 'blocked', 'runId': 'run',
            'reason': 'Image call failed, is uncertain or is not inspectable; no replacement was started.'},
        'steps': {'failed': {'name': 'production.image_start', 'result': {'data': {'job': {
            'id': 'job', 'status': 'failed', 'failure': 'Image provider returned HTTP_429; no retry was started.'}}}}},
        'productionSnapshot': {'stage': 'recorded', 'data': {'artifacts': []}}}
    snapshot = deepcopy(state['productionSnapshot'])
    snapshot['data']['imageRecoveryPolicy'] = {'runId': 'run', 'maxImageAttempts': 8,
        'retryHttpStatuses': [429], 'minimumIntervalSeconds': 60, 'attemptsUsed': 3}
    rows = [row for i in range(3) for row in (
        {'id': str(i), 'role': 'ImageGeneration', 'status': 'dispatched'},
        {'id': str(i), 'status': 'responded'})]
    if problem == 'pending': rows.pop()
    if problem == 'snapshot': snapshot['data']['changed'] = True
    if problem == 'uncertain': state['steps']['failed']['result']['data']['job']['status'] = 'uncertain'
    if problem == 'policy': snapshot['data']['imageRecoveryPolicy']['maxImageAttempts'] = 9
    path = work / 'autonomous-v2.json'
    path.write_text(json.dumps(state))
    journal = work / 'provider-calls.jsonl'
    journal.write_text('\n'.join(json.dumps(row) for row in rows))
    original, original_journal = path.read_bytes(), journal.read_bytes()
    client = SimpleNamespace(status=lambda _: SimpleNamespace(succeeded=True,
        run=SimpleNamespace(stage=snapshot['stage']), data=snapshot['data']))
    if problem:
        with pytest.raises(AssertionError):
            reconcile(tmp_path, 'test', 4 if problem == 'count' else 3, client, apply=True)
        assert path.read_bytes() == original
        assert not (work / 'reconciliations').exists()
    else:
        preview = reconcile(tmp_path, 'test', 3, client)
        assert not preview['applied'] and path.read_bytes() == original
        receipt = reconcile(tmp_path, 'test', 3, client, apply=True)
        updated = json.loads(path.read_text())
        assert updated.pop('reconciliations') == [receipt]
        assert updated == {**state, 'productionSnapshot': snapshot, 'terminal': None}
        archive = work / 'reconciliations' / sha256(original).hexdigest()
        assert (archive / 'autonomous-v2.json').read_bytes() == original
        assert (archive / 'provider-calls.jsonl').read_bytes() == original_journal
    assert journal.read_bytes() == original_journal
