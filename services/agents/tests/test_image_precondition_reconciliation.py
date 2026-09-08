from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import runpy
from types import SimpleNamespace
import pytest

reconcile = runpy.run_path(str(Path(__file__).resolve().parents[3] /
    'deploy/crew/autonomous/reconcile_image_precondition.py'))['reconcile']

@pytest.mark.parametrize('problem', [None, 'snapshot', 'pending', 'scope', 'spend'])
def test_precondition_reconciliation_retains_dispatches_and_archives_refusal(tmp_path, problem):
    if os.name == 'nt': tmp_path = Path('\\\\?\\' + str(tmp_path.resolve()))
    work = tmp_path / 'briefs' / sha256(b'test').hexdigest()
    work.mkdir(parents=True)
    data = {'imageRecoveryPolicy': {'runId': 'run', 'maxImageAttempts': 8, 'attemptsUsed': 7}}
    steps = {str(i): {'name': 'production.image_start', 'result': {'data': {'job': {'id': str(i),
        'status': 'failed', 'failure': 'HTTP_429;', 'requestSha256': 'sha', 'identityKey': str(i)}}}} for i in range(7)}
    steps['refused'] = {'name': 'production.image_start', 'dependencies': {'args': ['run', {
        'retryOf': '0', 'requestSha256': 'sha', 'identityKey': '0'}]},
        'result': {'data': None, 'error': {'code': 'IMAGE_REQUIREMENT_NOT_PENDING'}}}
    state = {'runId': 'run', 'pending': None, 'steps': steps, 'take': 'unchanged', 'limits': {'maxImages': 5},
        'terminal': {'status': 'blocked', 'runId': 'run', 'reason': 'Production stopped: IMAGE_REQUIREMENT_NOT_PENDING.'},
        'productionSnapshot': {'stage': 'rendered', 'data': deepcopy(data)}}
    rows = [r for i in range(8) for r in ({'id': str(i), 'role': 'ImageGeneration', 'status': 'dispatched'}, {'id': str(i), 'status': 'responded'})]
    if problem == 'snapshot': data['changed'] = True
    if problem == 'pending': rows.pop()
    if problem == 'scope': steps['refused']['dependencies']['args'][1]['requestSha256'] = 'changed'
    if problem == 'spend': data['imageRecoveryPolicy']['attemptsUsed'] = 8
    path, journal = work / 'autonomous-v2.json', work / 'provider-calls.jsonl'
    path.write_text(json.dumps(state))
    journal.write_text('\n'.join(json.dumps(row) for row in rows) + '\n')
    original, original_journal = path.read_bytes(), journal.read_bytes()
    client = SimpleNamespace(status=lambda _: SimpleNamespace(succeeded=True, run=SimpleNamespace(stage='rendered'), data=data))
    if problem:
        with pytest.raises(AssertionError): reconcile(tmp_path, 'test', 8, client, apply=True)
        assert path.read_bytes() == original and journal.read_bytes() == original_journal
    else:
        assert not reconcile(tmp_path, 'test', 8, client)['applied']
        receipt = reconcile(tmp_path, 'test', 8, client, apply=True)
        updated = json.loads(path.read_text())
        assert updated.pop('reconciliations') == [receipt]
        del state['steps']['refused']
        assert updated == {**state, 'terminal': None}
        updated_rows = [json.loads(line) for line in journal.read_text().splitlines()]
        assert updated_rows[:-1] == rows and updated_rows[-1]['providerDispatched'] is False
