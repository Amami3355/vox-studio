"""Reconcile the diagnosed pre-verdict SDK ClientError, retaining its consumed dispatch."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path

from vox_crew.hosted import write_json


def reconcile(root, submission, expected_calls, client, *, apply=False):
    work = root / 'briefs' / sha256(submission.encode()).hexdigest()
    path, journal_path = work / 'autonomous-v2.json', work / 'provider-calls.jsonl'
    original, journal = path.read_bytes(), journal_path.read_bytes()
    state = json.loads(original)
    rows = [json.loads(line) for line in journal.splitlines()]
    dispatched = [row for row in rows if row['status'] == 'dispatched']
    responded = {row['id'] for row in rows if row['status'] == 'responded'}
    pending = [row for row in dispatched if row['id'] not in responded]
    assert len(dispatched) == expected_calls and len(pending) == 1
    assert pending[0]['role'] == 'MediaReviewer'
    assert state['schemaVersion'] == 2 and state['phase'] == 'production'
    assert state['terminal'] == {'status': 'blocked', 'runId': state['runId'],
        'reason': 'ClientError: inspect operator evidence before resuming.'}
    assert state['pending']['name'] == 'film_review'
    assert not state.get('pendingComposition') and not state.get('pendingFilmCorrection')
    assert not state.get('filmReviews') and state['filmCorrections'] == 0
    video_sha = state['pending']['dependencies']['sha256']
    assert sha256((work / 'media' / (video_sha + '.mp4')).read_bytes()).hexdigest() == video_sha
    status = client.status(state['runId'])
    assert status.succeeded
    assert {'stage': status.run.stage, 'data': status.data} == state['productionSnapshot']
    policy = status.data['imageRecoveryPolicy']
    assert policy['runId'] == state['runId'] and policy['maxImageAttempts'] == 8
    assert policy['attemptsUsed'] == sum(row['role'] == 'ImageGeneration' for row in dispatched) == 7
    # The pinned SDK raises ClientError only for an HTTP 4xx response. Do not fabricate the
    # lost exact code, message, successful verdict, token usage, or a returned model response.
    closed = {'id': pending[0]['id'], 'status': 'responded', 'usage': {},
        'providerOutcome': 'failed', 'providerHttpStatusClass': '4xx',
        'classificationSource': 'recorded google.genai.errors.ClientError at film_review',
        'exactHttpStatusKnown': False, 'observedAt': datetime.now(timezone.utc).isoformat()}
    receipt = {'action': 'reconcile_media_client_error', 'observedAt': closed['observedAt'],
        'checkpointSha256': sha256(original).hexdigest(), 'journalSha256': sha256(journal).hexdigest(),
        'calls': len(dispatched), 'priorTerminal': state['terminal'], 'priorPending': state['pending'],
        'responseClassification': closed, 'signedProductionSnapshotVerified': True, 'applied': apply}
    if apply:
        archive = work / 'reconciliations' / receipt['checkpointSha256']
        archive.mkdir(parents=True, exist_ok=False)
        (archive / 'autonomous-v2.json').write_bytes(original)
        (archive / 'provider-calls.jsonl').write_bytes(journal)
        write_json(archive / 'receipt.json', receipt)
        # Append a classification, never replace or remove the consumed dispatch.
        with journal_path.open('ab') as stream:
            import os
            stream.write((b'' if journal.endswith(b'\n') else b'\n') + json.dumps(closed).encode() + b'\n')
            stream.flush()
            os.fsync(stream.fileno())
        state.setdefault('reconciliations', []).append(receipt)
        state['pending'] = None
        state['terminal'] = None
        write_json(path, state)
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
        result = reconcile(args.state, args.submission, args.expected_calls, HostedProductionClient(args.state), apply=args.apply)
    print(json.dumps(result))
