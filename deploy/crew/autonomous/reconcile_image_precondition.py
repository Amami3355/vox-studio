"""Archive a confirmed pre-dispatch image precondition refusal; preserve every consumed call."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from vox_crew.hosted import write_json


def reconcile(root, submission, expected_calls, client, *, apply=False):
    work = root / 'briefs' / sha256(submission.encode()).hexdigest()
    path, jp = work / 'autonomous-v2.json', work / 'provider-calls.jsonl'
    original, journal = path.read_bytes(), jp.read_bytes()
    state = json.loads(original)
    rows = [json.loads(line) for line in journal.splitlines()]
    dispatches = [r for r in rows if r['status'] == 'dispatched']
    responded = {r['id'] for r in rows if r['status'] == 'responded'}
    assert len(dispatches) == expected_calls and all(r['id'] in responded for r in dispatches)
    assert dispatches[-1]['role'] == 'ImageGeneration'
    assert state['pending'] is None and not state.get('pendingComposition')
    assert state['terminal'] == {'status': 'blocked', 'runId': state['runId'],
        'reason': 'Production stopped: IMAGE_REQUIREMENT_NOT_PENDING.'}
    refused = [(key, step) for key, step in state['steps'].items() if step['name'] == 'production.image_start'
        and (step['result'].get('error') or {}).get('code') == 'IMAGE_REQUIREMENT_NOT_PENDING']
    assert len(refused) == 1
    key, step = refused[0]
    request = step['dependencies']['args'][1]
    jobs = [(s['result'].get('data') or {}).get('job') for s in state['steps'].values()
        if s['name'] == 'production.image_start']
    failed = next(j for j in jobs if j and j['identityKey'] == request['identityKey'] and j['status'] == 'failed')
    assert failed['status'] == 'failed' and 'HTTP_429;' in failed['failure']
    if request.get('retryOf'):
        assert request['retryOf'] == failed['id'] and request['requestSha256'] == failed['requestSha256']
    else:
        from vox_crew.autonomous_roles import semantic_image_prompt
        previous = next(s['dependencies']['args'][1] for s in state['steps'].values()
            if s['name'] == 'production.image_start' and (s['result'].get('data') or {}).get('job', {}).get('id') == failed['id'])
        assert semantic_image_prompt(request['prompt']) == semantic_image_prompt(previous['prompt'])
    status = client.status(state['runId'])
    assert status.succeeded and {'stage': status.run.stage, 'data': status.data} == state['productionSnapshot']
    policy = status.data['imageRecoveryPolicy']
    assert policy['runId'] == state['runId'] and policy['maxImageAttempts'] == 8 and policy['attemptsUsed'] == 7
    assert len({j['id'] for j in jobs if j}) == policy['attemptsUsed']
    classification = {'id': dispatches[-1]['id'], 'status': 'responded', 'usage': {},
        'providerDispatched': False, 'productionRefusal': 'IMAGE_REQUIREMENT_NOT_PENDING',
        'observedAt': datetime.now(timezone.utc).isoformat()}
    receipt = {'action': 'reconcile_image_precondition', 'calls': len(dispatches),
        'checkpointSha256': sha256(original).hexdigest(), 'journalSha256': sha256(journal).hexdigest(),
        'archivedStep': step, 'classification': classification, 'applied': apply}
    if apply:
        archive = work / 'reconciliations' / receipt['checkpointSha256']
        archive.mkdir(parents=True, exist_ok=False)
        (archive / 'autonomous-v2.json').write_bytes(original)
        (archive / 'provider-calls.jsonl').write_bytes(journal)
        write_json(archive / 'receipt.json', receipt)
        with jp.open('ab') as stream:
            import os
            stream.write((b'' if journal.endswith(b'\n') else b'\n') + json.dumps(classification).encode() + b'\n')
            stream.flush()
            os.fsync(stream.fileno())
        state.setdefault('reconciliations', []).append(receipt)
        del state['steps'][key]
        state['terminal'] = None
        write_json(path, state)
    return receipt


if __name__ == '__main__':
    import argparse, fcntl
    from vox_crew.hosted import HostedProductionClient
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, default=Path('/var/lib/vox-crew'))
    parser.add_argument('--submission', required=True)
    parser.add_argument('--expected-calls', type=int, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with (args.state / 'worker.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(json.dumps(reconcile(args.state, args.submission, args.expected_calls, HostedProductionClient(args.state), apply=args.apply)))
