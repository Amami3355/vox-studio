"""Publish only byte-verified, fully decoded reviewed films; label blocked attempts explicitly."""
import argparse
from collections import Counter
from hashlib import sha256
from html import escape
import json
import os
from pathlib import Path
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--deployment', type=Path, required=True)
    args = parser.parse_args()
    if os.name == 'nt':
        args.source = Path(chr(92) * 2 + '?' + chr(92) + str(args.source.resolve()))
    deployment = json.loads(args.deployment.read_text(encoding='utf-8'))
    args.destination.mkdir(parents=True, exist_ok=False)
    cards, verification = [], []
    for slug, submission in deployment['submissions'].items():
        work = args.source / 'briefs' / sha256(submission['id'].encode()).hexdigest()
        checkpoint = json.loads((work / 'autonomous-v2.json').read_text(encoding='utf-8'))
        result = checkpoint['terminal']
        if result is None: raise ValueError('An active attempt cannot be published as a final result.')
        rows = [json.loads(line) for line in (work / 'provider-calls.jsonl').read_text(encoding='utf-8').splitlines()]
        dispatches = [r for r in rows if r['status'] == 'dispatched']
        responded = {r['id'] for r in rows if r['status'] == 'responded'}
        responses = {r['id']: r for r in rows if r['status'] == 'responded'}
        usage = {'totalDispatchAttempts': len(dispatches), 'groundedSearches': sum(r['grounded'] for r in dispatches),
                 'byRole': dict(Counter(r['role'] for r in dispatches)),
                 'pending': [r['id'] for r in dispatches if r['id'] not in responded]}
        usage.update(imageCommandAttempts=usage['byRole'].get('ImageGeneration', 0),
                     imageGenerations=sum(r['role'] == 'ImageGeneration' and responses.get(r['id'], {}).get('providerDispatched') is not False for r in dispatches),
                     narrations=usage['byRole'].get('Recording', 0),
                     technicalRepairs=checkpoint['technicalRepairs'],
                     editorialCorrections=checkpoint['editorialCorrections'], filmCorrections=checkpoint['filmCorrections'])
        image_maximum = 5
        recovery = checkpoint.get('productionSnapshot', {}).get('data', {}).get('imageRecoveryPolicy')
        if recovery:
            signed_export = args.source / 'exports' / slug
            signed_index = json.loads((signed_export / 'index.json').read_text(encoding='utf-8'))
            signed_status = json.loads((signed_export / 'status.json').read_text(encoding='utf-8'))
            if not signed_index['signedStatusVerified'] or signed_index['runId'] != result['runId']:
                raise ValueError('Image recovery has no verified status export.')
            if signed_status['data']['imageRecoveryPolicy'] != recovery:
                raise ValueError('Image recovery differs from the verified status export.')
            if recovery['runId'] != result['runId'] or recovery['maxImageAttempts'] > 8 or recovery['retryHttpStatuses'] != [429]:
                raise ValueError('Invalid image recovery policy.')
            if recovery['attemptsUsed'] != usage['imageGenerations']:
                raise ValueError('Image dispatch accounting differs from Production.')
            image_maximum = recovery['maxImageAttempts']
        usage['authorizedImageMaximum'] = image_maximum
        if usage['totalDispatchAttempts'] > 40 or usage['groundedSearches'] > 4 or usage['imageGenerations'] > image_maximum or usage['narrations'] > 1:
            raise ValueError('Published attempt exceeds its authorized ceilings.')
        directory = args.destination / slug
        directory.mkdir()
        (directory / 'evidence.json').write_text(json.dumps(checkpoint, indent=2, ensure_ascii=False), encoding='utf-8')
        (directory / 'provider-usage.json').write_text(json.dumps({'usage': usage, 'records': rows}, indent=2), encoding='utf-8')
        (directory / 'original-request.json').write_text(json.dumps(submission['request'], indent=2), encoding='utf-8')
        prompt = submission['request']['brief']['text']
        title = 'Reusable rocket' if slug == 'rocket' else 'Why the sky is blue'
        card = f'<article><h2>{escape(title)}</h2><p>{escape(prompt)}</p>'
        receipt = {'subject': slug, 'result': result, 'providerUsage': usage}
        export = args.source / 'exports' / slug
        index = None
        if result.get('runId') and (export / 'index.json').exists():
            index = json.loads((export / 'index.json').read_text(encoding='utf-8'))
            if index['runId'] != result['runId']: raise ValueError('Export belongs to another Run.')
            if not index['signedStatusVerified']: raise ValueError('Export status was not verified.')
            for item in index['files']:
                name = item['exportedAs']
                if Path(name).name != name: raise ValueError('Unsafe export filename.')
                data = (export / name).read_bytes()
                if sha256(data).hexdigest() != item['sha256']: raise ValueError('Export digest mismatch.')
                shutil.copyfile(export / name, directory / name)
            shutil.copyfile(export / 'index.json', directory / 'export-index.json')
            receipt['artifactDigestsVerified'] = True
            card += f'<p><a href="{slug}/export-index.json">Signed artifact export</a></p>'
        if result['status'] == 'reviewed':
            if index is None: raise ValueError('Reviewed film has no signed export.')
            if any(not history or not history[-1].get('accepted') for history in checkpoint['images'].values()):
                raise ValueError('Reviewed film still has an unaccepted authored image.')
            preview = next(i for i in index['files'] if i['kind'] == 'preview' and i['sha256'] == result['reviewedSha256'])
            original = export / preview['exportedAs']
            subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(original), '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'],
                           check=True, capture_output=True, timeout=240)
            shutil.copyfile(original, directory / 'video.mp4')
            receipt.update(artifactDigestsVerified=True, fullyDecoded=True,
                           videoSha256=preview['sha256'], bytes=original.stat().st_size)
            card += f'<p class="status">Crew review accepted · Human appreciation pending</p><video controls preload="metadata" playsinline src="{slug}/video.mp4"></video><p><a href="{slug}/video.mp4" download>Download MP4</a></p>'
        else:
            reconciliations = checkpoint.get('accountingReconciliations', [])
            detail = reconciliations[-1]['reason'] if reconciliations else result['reason']
            receipt['blockingDetail'] = detail
            card += '<p class="blocked">Blocked — no validated film</p><p>' + escape(detail) + '</p>'
            previews = [item for item in (index or {}).get('files', []) if item['kind'] == 'preview']
            if previews:
                draft = previews[-1]
                card += f'<p>Intermediate draft — incomplete and not validated</p><video controls preload="metadata" playsinline src="{slug}/{draft["exportedAs"]}"></video><p><a href="{slug}/{draft["exportedAs"]}" download>Download intermediate MP4</a></p>'
                receipt['intermediatePreviewSha256'] = draft['sha256']
        if index:
            candidates = {item['sha256']: item for item in index['files'] if item['kind'] == 'generated_image_candidate'}
            gallery = []
            for identity, history in checkpoint['images'].items():
                for version, row in enumerate(history, 1):
                    item = candidates.get(row['job']['candidate']['artifact']['sha256'])
                    if item:
                        label = f'{identity} · {version} · ' + ('Accepted' if row['accepted'] else 'Rejected')
                        gallery.append(f'<figure><a href="{slug}/{item["exportedAs"]}"><img loading="lazy" style="width:100%;max-width:520px" src="{slug}/{item["exportedAs"]}" alt="{escape(label)}"></a><figcaption>{escape(label)}</figcaption></figure>')
            card += '<details><summary>Generated image candidates</summary>' + ''.join(gallery) + '</details>'
        card += f'<p>{usage["totalDispatchAttempts"]}/40 dispatch attempts · {usage["groundedSearches"]}/4 searches</p><p><a href="{slug}/evidence.json">Research, story, plans and reviews</a> · <a href="{slug}/provider-usage.json">Provider usage</a></p></article>'
        cards.append(card)
        verification.append(receipt)
    (args.destination / 'verification.json').write_text(json.dumps(verification, indent=2), encoding='utf-8')
    (args.destination / 'deployment.json').write_text(json.dumps(deployment, indent=2), encoding='utf-8')
    html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Autonomous explainers</title><style>body{margin:0;background:#101821;color:#e9eef5;font:17px/1.55 system-ui}main{max-width:1100px;margin:auto;padding:32px 24px}h1{font-size:36px;line-height:1.2}article{background:#1b2734;padding:26px;border-radius:16px;margin:30px 0}h2{margin-top:0}video{display:block;width:100%;max-height:72vh;background:#000;border-radius:8px}a{color:#93ceff}.status{color:#a1e2c3}.blocked{color:#ffd48c}</style><main><h1>Autonomous explainers</h1><p>Original prompt → research → story → images → film → crew review.</p>' + ''.join(cards) + '<p><a href="verification.json">Local verification</a> · <a href="deployment.json">Deployment digests</a></p></main></html>'
    (args.destination / 'index.html').write_text(html, encoding='utf-8')
    print(json.dumps(verification))


if __name__ == '__main__': main()
