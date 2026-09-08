from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import runpy
from types import SimpleNamespace
import pytest

reconcile = runpy.run_path(str(Path(__file__).resolve().parents[3] /
    'deploy/crew/autonomous/reconcile_media_client_error.py'))['reconcile']


@pytest.mark.parametrize('problem', [None, 'timeout', 'snapshot', 'role', 'verdict', 'media'])
def test_reconcile_only_confirmed_client_error_preserves_call_and_plan(tmp_path, problem):
    if os.name == 'nt': tmp_path = Path('\\\\?\\' + str(tmp_path.resolve()))
    work = tmp_path / 'briefs' / sha256(b'test').hexdigest()
    (work / 'media').mkdir(parents=True)
    video_sha = sha256(b'video').hexdigest()
    (work / 'media' / (video_sha + '.mp4')).write_bytes(b'changed' if problem == 'media' else b'video')
    data = {'imageRecoveryPolicy': {'runId': 'run', 'maxImageAttempts': 8, 'attemptsUsed': 7}}
    state = {'schemaVersion': 2, 'phase': 'production', 'runId': 'run', 'filmCorrections': 0,
        'videoPlan': {'immutable': True}, 'take': {'id': 'take'}, 'limits': {'maxCalls': 40, 'maxImages': 5},
        'terminal': {'status': 'blocked', 'runId': 'run', 'reason': 'ClientError: inspect operator evidence before resuming.'},
        'pending': {'name': 'film_review', 'dependencies': {'sha256': video_sha}},
        'productionSnapshot': {'stage': 'rendered', 'data': deepcopy(data)}}
    rows = [r for i in range(7) for r in ({'id': str(i), 'role': 'ImageGeneration', 'status': 'dispatched'},
        {'id': str(i), 'status': 'responded'})]
    rows.append({'id': 'review', 'role': 'MediaReviewer', 'status': 'dispatched'})
    if problem == 'timeout': state['terminal']['reason'] = 'TimeoutError: inspect operator evidence before resuming.'
    if problem == 'snapshot': data['changed'] = True
    if problem == 'role': rows[-1]['role'] = 'ImageGeneration'
    if problem == 'verdict': state['filmReviews'] = {'verdict': True}
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
        assert path.read_bytes() == original and journal.read_bytes() == original_journal
        receipt = reconcile(tmp_path, 'test', 8, client, apply=True)
        updated = json.loads(path.read_text())
        assert updated.pop('reconciliations') == [receipt]
        assert updated == {**state, 'pending': None, 'terminal': None}
        updated_rows = [json.loads(line) for line in journal.read_text().splitlines()]
        assert updated_rows[:-1] == rows and len([r for r in updated_rows if r['status'] == 'dispatched']) == 8
        assert updated_rows[-1]['providerHttpStatusClass'] == '4xx'
        assert not updated_rows[-1]['exactHttpStatusKnown']
