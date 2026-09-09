"""Adopt a completed render after a worker crash, using signed status; never issue render.

Preview by default. This does not clear terminal blocks or uncertain provider dispatches.
The operator must stop the worker; both executor locks are acquired before inspection.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import time

from vox_crew.autonomous_contract import digest
from vox_crew.envelopes import ArtifactDescriptor
from vox_crew.hosted import HostedProductionClient, write_json
from vox_crew.provider_usage import ProviderJournal
from vox_crew.studio_projection import read_json
from vox_crew.studio_store import StudioConflict, StudioStore
from vox_crew.studio_worker import decode_video, prepared_request, worker_lock


def recover(store, job_id, crew_state, config, client, *, apply=False):
    job = store.get(job_id)
    if job['recorded'] or job['status'] != 'interrupted':
        raise StudioConflict('Only interrupted live work can adopt a completed render.')
    request, request_sha = prepared_request(job, config)
    authorization = read_json(store.work(job_id) / 'authorization.json', {})
    if (authorization.get('requestSha256') != request_sha
            or authorization.get('maxImages') != request['brief']['maxGeneratedImages']
            or datetime.fromisoformat(authorization.get('expiresAt', '').replace('Z', '+00:00')) <= datetime.now(timezone.utc)):
        raise StudioConflict('The original unexpired authorization must match the request.')
    work = crew_state / 'briefs' / sha256(request['brief']['id'].encode()).hexdigest()
    checkpoint = work / 'autonomous-v2.json'
    before = checkpoint.read_bytes()
    state = json.loads(before)
    limits = read_json(config / 'execution-limits.json')
    expected_limits = {'maxCalls': limits['maxModelCalls'], 'maxSearches': limits['maxGroundedCalls'],
                       'maxImages': request['brief']['maxGeneratedImages']}
    if (state.get('originalRequest') != request or state.get('language') != job['request']['language']
            or state.get('imageReviewMode') != 'studio' or state.get('limits') != expected_limits
            or state.get('terminal') or state.get('pendingComposition') or state.get('pendingFilmCorrection')):
        raise StudioConflict('The original nonterminal Studio checkpoint and ceilings must be unchanged.')
    pending = state.get('pending') or {}
    dependencies = {'args': [state['runId']], 'key': {'film': state['filmCorrections'],
        'plan': digest(state['videoPlan']), 'images': digest(state['images'])}}
    identity = digest({'name': 'production.render', 'dependencies': dependencies})
    if (pending != {'name': 'production.render', 'identity': identity, 'dependencies': dependencies}
            or identity in state['steps']):
        raise StudioConflict('Only the exact unanswered render of this plan and image set can be adopted.')
    journal_path = work / 'provider-calls.jsonl'
    journal_before = journal_path.read_bytes()
    ProviderJournal(journal_path, max_calls=limits['maxModelCalls'], max_grounded_calls=limits['maxGroundedCalls'])
    previous = state['productionSnapshot']
    if previous['stage'] != 'compiled' or previous['data'].get('staleStages'):
        raise StudioConflict('The interrupted render must begin from fresh compiled inputs.')
    status = client.status(state['runId'])
    if not status.succeeded or not status.run or status.run.id != state['runId'] or status.run.stage != 'rendered':
        raise StudioConflict('Signed Production status does not confirm a completed render for this Run.')
    observed = {'stage': status.run.stage, 'data': status.data}
    candidates = [d for d in status.data.get('artifacts', []) if d['kind'] == 'preview']
    if len(candidates) != 1:
        raise StudioConflict('Signed status must identify exactly one current preview.')
    preview = candidates[0]
    expected_data = deepcopy(previous['data'])
    expected_data['artifacts'] = [d for d in expected_data['artifacts'] if d['kind'] != 'preview']
    actual_data = deepcopy(status.data)
    actual_data['artifacts'] = [d for d in actual_data['artifacts'] if d['kind'] != 'preview']
    if actual_data != expected_data or status.data.get('lastOutcome') != 'succeeded':
        raise StudioConflict('Production changed inputs, grants or other state beyond the completed render.')
    artifact = client.fetch_artifact(state['runId'], ArtifactDescriptor(**preview))
    if sha256(artifact.data).hexdigest() != preview['sha256']:
        raise StudioConflict('The signed preview digest does not match its bytes.')
    evidence = store.work(job_id) / 'reconciliations' / ('render-' + str(time.time_ns()))
    evidence.mkdir(parents=True, exist_ok=False)
    (evidence / 'preview.mp4').write_bytes(artifact.data)
    decode_video(evidence / 'preview.mp4')
    second = client.status(state['runId'])
    if not second.succeeded or second.raw != status.raw:
        raise StudioConflict('Production changed during verification; no checkpoint was modified.')
    if checkpoint.read_bytes() != before or journal_path.read_bytes() != journal_before:
        raise StudioConflict('Operator files changed during verification; no checkpoint was modified.')
    proof = {'jobId': job_id, 'runId': state['runId'], 'requestSha256': request_sha,
             'checkpointSha256': sha256(before).hexdigest(), 'journalSha256': sha256(journal_before).hexdigest(),
             'previewSha256': preview['sha256'], 'signedStatusSha256': sha256(status.raw.encode()).hexdigest(),
             'providerCalls': 0, 'renderCommands': 0, 'fullyDecoded': True, 'applied': apply,
             'observedAt': datetime.now(timezone.utc).isoformat()}
    (evidence / 'checkpoint-before.json').write_bytes(before)
    (evidence / 'provider-calls-before.jsonl').write_bytes(journal_before)
    (evidence / 'signed-status.json').write_text(status.raw, encoding='utf-8')
    write_json(evidence / 'proof.json', proof)
    if apply:
        # This is an explicit status-derived completion, not a fabricated signed render response.
        result = {'protocolVersion': 1, 'command': 'run.render', 'outcome': 'succeeded',
                  'run': {'id': state['runId'], 'stage': 'rendered'}, 'data': {'preview': preview},
                  'artifacts': [preview], 'error': None, 'next': []}
        state['steps'][identity] = {'name': 'production.render', 'dependencies': dependencies,
                                    'result': result, 'reconciledFromSignedStatus': proof['signedStatusSha256']}
        state['productionSnapshot'] = observed
        state['pending'] = None
        state.setdefault('renderReconciliations', []).append(proof)
        write_json(checkpoint, state)
        write_json(store.work(job_id) / 'checkpoint.json', state)
        store.transition(job_id, 'interrupted', 'queued',
                         'The completed render was verified. Technical delivery can continue without rendering again.')
    return proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--crew-state', type=Path, required=True)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--job', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    store = StudioStore(args.state)
    with worker_lock(store.root / 'worker.lock'), worker_lock(args.crew_state / 'worker.lock'):
        print(json.dumps(recover(store, args.job, args.crew_state, args.config,
                                 HostedProductionClient(args.crew_state), apply=args.apply)))


if __name__ == '__main__':
    main()
