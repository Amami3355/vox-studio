"""Resume an exhausted pre-recording repair only when a tested no-spend anchor fix applies."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path

from vox_crew.anchor_repair import unique_anchor_repair
from vox_crew.hosted import write_json


def reconcile(root, submission, expected_calls, client, *, apply=False):
    work = root / 'briefs' / sha256(submission.encode()).hexdigest()
    path = work / 'autonomous-v2.json'
    original = path.read_bytes()
    state = json.loads(original)
    journal_path = work / 'provider-calls.jsonl'
    journal = journal_path.read_bytes()
    rows = [json.loads(line) for line in journal.splitlines()]
    dispatched = [r for r in rows if r['status'] == 'dispatched']
    responded = {r['id'] for r in rows if r['status'] == 'responded'}
    assert len(dispatched) == expected_calls
    assert all(r['id'] in responded for r in dispatched), 'Uncertain provider dispatch'
    assert state['schemaVersion'] == 2 and state['phase'] == 'production'
    assert state['terminal'] == {'status': 'blocked', 'runId': state['runId'],
        'reason': 'The shared technical PlanRepair budget was exhausted.'}
    assert state['technicalRepairs'] == sum(r['role'] == 'PlanRepairAgent' for r in dispatched) == 1
    assert not state.get('take') and not state.get('recordedBeats') and not state.get('pendingComposition')
    pending = state['pending']
    assert pending['name'] == 'technical_repair' and pending['identity'] not in state['steps']
    assert pending['dependencies']['plan'] == state['videoPlan']
    revised = unique_anchor_repair(state['videoPlan'], pending['dependencies']['report'])
    assert revised is not None, 'No unambiguous published repair'
    status = client.status(state['runId'])
    assert status.succeeded and status.run.stage == 'initialized'
    assert {'stage': status.run.stage, 'data': status.data} == state['productionSnapshot'], 'Production changed'
    receipt = {'observedAt': datetime.now(timezone.utc).isoformat(), 'action': 'resume_unique_published_anchor',
        'submissionId': submission, 'checkpointSha256': sha256(original).hexdigest(),
        'journalSha256': sha256(journal).hexdigest(), 'priorPending': pending, 'priorTerminal': state['terminal'],
        'calls': len(dispatched), 'limits': state['limits'], 'technicalRepairs': state['technicalRepairs'],
        'signedProductionSnapshotVerified': True, 'applied': apply}
    if apply:
        archive = work / 'reconciliations' / receipt['checkpointSha256']
        archive.mkdir(parents=True, exist_ok=False)
        (archive / 'autonomous-v2.json').write_bytes(original)
        (archive / 'provider-calls.jsonl').write_bytes(journal)
        write_json(archive / 'receipt.json', receipt)
        state.setdefault('reconciliations', []).append(receipt)
        state['pending'] = state['terminal'] = None
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
