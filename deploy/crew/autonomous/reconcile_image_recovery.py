"""Adopt an explicitly approved image recovery policy without altering a plan or past spend."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path

from vox_crew.hosted import write_json


def reconcile(root, submission, expected_calls, client, *, apply=False):
    work = root / 'briefs' / sha256(submission.encode()).hexdigest()
    path = work / 'autonomous-v2.json'
    original = path.read_bytes()
    state = json.loads(original)
    journal_path = work / 'provider-calls.jsonl'
    journal = journal_path.read_bytes()
    rows = [json.loads(line) for line in journal.splitlines()]
    dispatched = [row for row in rows if row['status'] == 'dispatched']
    responded = {row['id'] for row in rows if row['status'] == 'responded'}
    assert len(dispatched) == expected_calls and all(row['id'] in responded for row in dispatched)
    assert state['schemaVersion'] == 2 and state['phase'] == 'production'
    assert state['terminal']['status'] == 'blocked' and state['terminal']['runId'] == state['runId']
    assert state['terminal']['reason'] == 'Image call failed, is uncertain or is not inspectable; no replacement was started.'
    assert state['pending'] is None and not state.get('pendingComposition')
    failed = [s['result']['data']['job'] for s in state['steps'].values()
              if s['name'] == 'production.image_start' and s['result'].get('data', {}).get('job', {}).get('status') == 'failed']
    assert len(failed) == 1 and 'HTTP_429;' in failed[0]['failure']
    status = client.status(state['runId'])
    assert status.succeeded
    data = dict(status.data)
    policy = data.pop('imageRecoveryPolicy')
    assert policy['runId'] == state['runId'] and policy['maxImageAttempts'] == 8
    assert policy['retryHttpStatuses'] == [429] and policy['minimumIntervalSeconds'] >= 60
    assert policy['attemptsUsed'] == sum(row['role'] == 'ImageGeneration' for row in dispatched) == 3
    assert {'stage': status.run.stage, 'data': data} == state['productionSnapshot'], 'Production changed beyond the approved policy'
    receipt = {'observedAt': datetime.now(timezone.utc).isoformat(), 'action': 'adopt_image_recovery_policy',
        'submissionId': submission, 'checkpointSha256': sha256(original).hexdigest(),
        'journalSha256': sha256(journal).hexdigest(), 'priorTerminal': state['terminal'],
        'calls': len(dispatched), 'originalLimits': state['limits'], 'policy': policy,
        'failedJob': failed[0], 'signedProductionSnapshotVerified': True, 'applied': apply}
    if apply:
        archive = work / 'reconciliations' / receipt['checkpointSha256']
        archive.mkdir(parents=True, exist_ok=False)
        (archive / 'autonomous-v2.json').write_bytes(original)
        (archive / 'provider-calls.jsonl').write_bytes(journal)
        write_json(archive / 'receipt.json', receipt)
        state.setdefault('reconciliations', []).append(receipt)
        state['productionSnapshot'] = {'stage': status.run.stage, 'data': status.data}
        state['terminal'] = None
        write_json(path, state)
        assert journal_path.read_bytes() == journal
    return receipt


if __name__ == '__main__':
    import argparse
    import fcntl
    from vox_crew.hosted import HostedProductionClient
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, default=Path('/var/lib/vox-crew'))
    parser.add_argument('--submission', required=True)
    parser.add_argument('--expected-calls', type=int, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with (args.state / 'worker.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = reconcile(args.state, args.submission, args.expected_calls,
                           HostedProductionClient(args.state), apply=args.apply)
    print(json.dumps(result))
