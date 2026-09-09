"""Prepare a diagnosed model-response failure for bounded recovery in the same Run.

Inspection only by default. --apply archives evidence and queues under the existing signed
authorization; it never creates an authorization or dispatches a provider call itself.
Stop the worker first; the CLI holds both executor locks.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path

from vox_crew.adk_roles import _json_answer
from vox_crew.autonomous import MODEL_STEPS
from vox_crew.autonomous_contract import digest
from vox_crew.hosted import HostedProductionClient, write_json
from vox_crew.model_recovery import ModelResponseInvalid, completed_model_calls
from vox_crew.model_output import recovery_output_tokens
from vox_crew.provider_usage import ProviderJournal
from vox_crew.studio_continuation import archive_bytes, observed_snapshot
from vox_crew.studio_controls import effective_limits
from vox_crew.studio_projection import read_json
from vox_crew.studio_store import StudioConflict, StudioStore
from vox_crew.studio_worker import worker_lock


def recover(store, job_id, crew_state, client, *, apply=False):
    job = store.get(job_id)
    if job['recorded'] or job['status'] not in ('blocked', 'interrupted'):
        raise StudioConflict('Only stopped live work can recover a diagnosed model response.')
    if (store.continuation(job_id) or {}).get('status') == 'pending':
        raise StudioConflict('The saved user decision must be resolved first.')
    work = crew_state / 'briefs' / sha256(('studio-' + job_id).encode()).hexdigest()
    checkpoint, journal_path = work / 'autonomous-v2.json', work / 'provider-calls.jsonl'
    before, journal_before = checkpoint.read_bytes(), journal_path.read_bytes()
    state = json.loads(before)
    request = read_json(store.work(job_id) / 'production-request.json')
    brief = (request or {}).get('brief', {})
    if (state.get('originalRequest') != request or not request or brief.get('id') != 'studio-' + job_id
            or brief.get('text') != job['request']['text'] or brief.get('durationSeconds') != job['request']['duration']
            or state.get('language') != job['request']['language'] or state.get('imageReviewMode') not in ('studio', 'studio_automatic')):
        raise StudioConflict('The original Studio request and checkpoint must match.')
    authority = state.get('studioAuthorization') or {}
    request_sha = digest({'protocolVersion': 1, 'purpose': 'production-request', 'value': request})
    if (authority.get('runId') != state.get('runId') or not state.get('runId')
            or authority.get('requestSha256') != request_sha or not authority.get('signature')
            or (authority.get('expiresAt') is not None and datetime.fromisoformat(authority['expiresAt'].replace('Z', '+00:00')) <= datetime.now(timezone.utc))):
        raise StudioConflict('The existing unexpired authorization must bind this Run and original request.')
    limits = authority["limits"]
    if state.get('limits') != {k: limits[k] for k in ('maxCalls', 'maxSearches', 'maxImages')}:
        raise StudioConflict('The signed limits and checkpoint limits differ.')
    journal = ProviderJournal(journal_path, max_calls=limits['maxCalls'], max_grounded_calls=limits['maxSearches'])
    journal.expires_at = authority['expiresAt']
    journal.check_available()
    if limits['maxTechnicalRepairs'] is not None and state['technicalRepairs'] >= limits['maxTechnicalRepairs']:
        raise StudioConflict('The existing technical repair allowance has been consumed.')
    observed = observed_snapshot(client, state['runId'])
    if observed != state.get('productionSnapshot') or observed['data'].get('studioAuthorization') != authority:
        raise StudioConflict('Fresh signed Production status differs from the saved work or authorization.')

    # Idempotent completion if adoption committed but queueing was interrupted.
    adopted = state.get('modelResponseReconciliations', [])
    if adopted and not state.get('terminal') and not state.get('pending') and not state.get('pendingComposition'):
        proof = adopted[-1]
        archived = store.work(job_id) / 'reconciliations' / ('model-' + proof['checkpointSha256'])
        if (sha256(journal_before).hexdigest() != proof['journalSha256']
                or not state.get('pendingModelRecovery')
                or not (archived / 'checkpoint-before.json').is_file()):
            raise StudioConflict('The adopted recovery evidence changed before queueing.')
        if apply:
            write_json(store.work(job_id) / 'checkpoint.json', state)
            store.transition(job_id, job['status'], 'queued', 'The saved response recovery is ready to continue.')
        return {**proof, 'applied': apply}

    pending = state.get('pending') or {}
    child = state.get('pendingComposition')
    failure = state.get('recoverableFailure') or {}
    terminal = state.get('terminal') or {}
    name = (child or pending).get('name')
    if (terminal.get('status') != 'blocked' or failure.get('pending') != pending
            or failure.get('pendingComposition') != child
            or pending.get('name') not in MODEL_STEPS | {'composition'}
            or (pending['name'] == 'composition' and name not in ('structurer', 'scene_author', 'plan_repair'))
            or pending.get('identity') != digest({'name': pending['name'], 'dependencies': pending.get('dependencies')})
            or pending['identity'] in state['steps']
            or (child and child.get('identity') in state.get('compositionSteps', {}))):
        raise StudioConflict('The failure must identify an uncached model step with a confirmed response.')
    start = next((i for i in range(len(journal.records) - 1, -1, -1)
                  if journal.records[i]['status'] == 'dispatched'), -1)
    evidence = completed_model_calls(journal, start)
    if not evidence:
        raise StudioConflict('The final provider attempt is not a confirmed usable model response.')
    call = evidence[-1]
    expected_roles = {'structurer': 'VisualStructurer', 'scene_author': 'SceneAuthor', 'plan_repair': 'PlanRepairAgent',
        'technical_repair': 'PlanRepairAgent', 'narrative': 'NarrativeAgent', 'art_direction': 'ArtDirectorAgent',
        'image_intent': 'ImageCreator', 'image_review': 'MediaReviewer', 'film_review': 'MediaReviewer'}
    if call['role'] != expected_roles.get(name, 'Director'):
        raise StudioConflict('The final provider response does not belong to the failed step.')
    known = any(row['step'] == name and row.get('pending') == pending
                and row.get('pendingComposition') == child
                and any(c['id'] == call['id'] for c in row['calls'])
                for row in state.get('modelResponseFailures', []))
    if not known:
        # Historical parser failures have no typed recovery record: replay only public answer
        # parts, and require the old checkpoint's exact parser diagnostic to agree.
        answer = next(row for row in journal.records if row['id'] == call['id'] and row['status'] == 'responded')
        public = ''.join(part['text'] for part in answer.get('answerParts', []))
        try:
            _json_answer(public, call['role'])
        except ModelResponseInvalid as error:
            diagnostic = state.get('contractDiagnostic') or {}
            if not public or diagnostic.get('step') != pending or diagnostic.get('error') != str(error):
                raise StudioConflict('The public response replay does not match the saved parsing failure.') from None
        else:
            raise StudioConflict('The historical response is valid JSON; this recovery does not apply.')

    proof = {'jobId': job_id, 'runId': state['runId'], 'step': name, 'callId': call['id'],
        'checkpointSha256': sha256(before).hexdigest(), 'journalSha256': sha256(journal_before).hexdigest(),
        'requestSha256': request_sha, 'decisionId': authority['decisionId'], 'providerCalls': 0,
        'observedAt': datetime.now(timezone.utc).isoformat()}
    revised = deepcopy(state)
    revised.setdefault('resolvedFailures', []).append(revised.pop('recoverableFailure'))
    revised.setdefault('modelResponseReconciliations', []).append({**proof, 'previousTerminal': terminal})
    revised.update(terminal=None, pending=None, pendingComposition=None)
    revised['pendingModelRecovery'] = state.get('pendingModelRecovery') or {'step': name,
        'context': {'maxOutputTokens': recovery_output_tokens(evidence, grow=True)}}
    revised['providerUsage'] = journal.summary()
    if (observed_snapshot(client, state['runId']) != observed or checkpoint.read_bytes() != before
            or journal_path.read_bytes() != journal_before):
        raise StudioConflict('State changed during verification; no recovery was applied.')
    evidence_dir = store.work(job_id) / 'reconciliations' / ('model-' + proof['checkpointSha256'])
    archive_bytes(evidence_dir / 'checkpoint-before.json', before)
    archive_bytes(evidence_dir / 'provider-calls-before.jsonl', journal_before)
    write_json(evidence_dir / 'proof.json', {**proof, 'applied': apply})
    if apply:
        write_json(checkpoint, revised)
        write_json(store.work(job_id) / 'checkpoint.json', revised)
        store.transition(job_id, job['status'], 'queued', 'Automatically recovering the saved step within the existing limits.')
    return {**proof, 'applied': apply}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--crew-state', type=Path, required=True)
    parser.add_argument('--job', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    store = StudioStore(args.state)
    with worker_lock(store.root / 'worker.lock'), worker_lock(args.crew_state / 'worker.lock'):
        print(json.dumps(recover(store, args.job, args.crew_state, HostedProductionClient(args.crew_state), apply=args.apply)))


if __name__ == '__main__':
    main()
