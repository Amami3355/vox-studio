"""Read-only progress and accounting summary; no provider or Production connection."""
from hashlib import sha256
import json
from pathlib import Path

for slug in ('rocket', 'sky'):
    work = Path('/var/lib/vox-crew/briefs') / sha256(('autonomous-2026-09-08-' + slug).encode()).hexdigest()
    path = work / 'autonomous-v2.json'
    if not path.exists():
        print(json.dumps({'subject': slug, 'status': 'not_started'}))
        continue
    state = json.loads(path.read_text())
    journal = work / 'provider-calls.jsonl'
    rows = [json.loads(line) for line in journal.read_text().splitlines()] if journal.exists() else []
    dispatched = [r for r in rows if r['status'] == 'dispatched']
    responded = {r['id'] for r in rows if r['status'] == 'responded'}
    print(json.dumps({'subject': slug, 'phase': state['phase'], 'terminal': state['terminal'],
        'pendingStep': (state['pending'] or {}).get('name'), 'runId': state['runId'],
        'calls': len(dispatched), 'groundedCalls': sum(r['grounded'] for r in dispatched),
        'pendingProviderCalls': sum(r['id'] not in responded for r in dispatched),
        'editorialCorrections': state['editorialCorrections'], 'technicalRepairs': state['technicalRepairs'],
        'filmCorrections': state['filmCorrections'], 'events': state['events'][-3:],
        'coverage': [s['coverage'] for s in state['searches']],
        'contractDiagnostic': state.get('contractDiagnostic')}))
