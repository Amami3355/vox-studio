"""Prepare reviewable immutable boot metadata and install scripts; never dispatch providers."""
import argparse
import base64
import importlib.util
import json
from pathlib import Path
import sys
import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'services/agents/src'))
from vox_crew.autonomous_entry import prompt_request
from vox_crew.autonomous_contract import digest

spec = importlib.util.spec_from_file_location('crew_render', HERE.parent / 'render.py')
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)
PROMPTS = {
    'rocket': 'Explain why a reusable rocket needs fuel to slow down and land.',
    'sky': 'Explain why the sky is blue.',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--production-image', required=True)
    parser.add_argument('--crew-image', required=True)
    parser.add_argument('--production-key', type=Path, required=True)
    parser.add_argument('--crew-key', type=Path, required=True)
    parser.add_argument('--probe-run', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--submission-prefix', default='autonomous-2026-09-08')
    parser.add_argument('--expires-at', default='2026-09-15T00:00:00Z')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    production = yaml.safe_load(render.production(args.production_image, args.crew_key.read_text().strip(), live=True)
        .replace('GOOGLE_CLOUD_LOCATION=europe-west1', 'GOOGLE_CLOUD_LOCATION=global')
        .replace('--env-file /etc/vox/service.env', '--env VOX_AUTONOMOUS_IMAGES_DIRECTORY=/var/lib/vox/operator/autonomous --env-file /etc/vox/service.env'))
    crew = yaml.safe_load(render.crew(args.crew_image, '10.132.0.2', args.production_key.read_text().strip(), args.probe_run, live=True))
    # Legacy configuration is retained; V2 has a separate operator configuration directory.
    for entry in crew['write_files']:
        name = Path(entry['path']).name
        if name in ('operator-policy.json', 'execution-limits.json'):
            entry['content'] = base64.b64encode((HERE.parent / 'editorial-preview' / name).read_bytes()).decode()
        if name == 'vox-crew-attempt.service':
            text = base64.b64decode(entry['content']).decode().replace('/var/lib/vox-crew/request.json',
                '/var/lib/vox-crew/editorial-preview-request-revision-2.json')
            entry['content'] = base64.b64encode(text.encode()).decode()
            attempt_template = text
    for name in ('operator-policy.json', 'execution-limits.json', 'prompt-defaults.json'):
        crew['write_files'].append(render.file('/etc/vox-crew/autonomous/' + name, (HERE / name).read_text(), '0444'))
    defaults = json.loads((HERE / 'prompt-defaults.json').read_text())
    manifest = {'productionImage': args.production_image, 'crewImage': args.crew_image, 'submissions': {}}
    for slug, prompt in PROMPTS.items():
        submission = args.submission_prefix + '-' + slug
        request = prompt_request(prompt, defaults, submission_id=submission)
        request_sha = digest({'protocolVersion': 1, 'purpose': 'production-request', 'value': request})
        envelope = {'schemaVersion': 1, 'requestSha256': request_sha, 'maxImages': 5, 'expiresAt': args.expires_at}
        production['write_files'].append(render.file('/etc/vox/autonomous-envelopes/' + request_sha + '.json', json.dumps(envelope), '0400'))
        unit = attempt_template.replace('vox-crew-attempt ', 'vox-crew-autonomous-' + slug + ' ')
        unit = unit.replace('run --request /var/lib/vox-crew/editorial-preview-request-revision-2.json',
            'prompt ' + json.dumps(prompt) + ' --submission-id ' + submission + ' --config /etc/vox-crew/autonomous')
        crew['write_files'].append(render.file('/etc/systemd/system/vox-crew-autonomous-' + slug + '.service', unit))
        manifest['submissions'][slug] = {'id': submission, 'requestSha256': request_sha, 'request': request}
    install_envelopes = (
        'install -d -m 0700 /mnt/disks/vox-runs/operator/autonomous/envelopes\n'
        'for source in /etc/vox/autonomous-envelopes/*.json; do\n'
        '  target=/mnt/disks/vox-runs/operator/autonomous/envelopes/$(basename "$source")\n'
        '  if test -e "$target"; then cmp "$source" "$target"; else install -m 0600 "$source" "$target"; fi\n'
        'done\n')
    production['runcmd'].append(install_envelopes)
    for kind, config in [('production', production), ('crew', crew)]:
        text = '#cloud-config\n' + json.dumps(config, indent=2) + '\n'
        (args.output / (kind + '.yaml')).write_text(text, encoding='utf-8', newline='\n')
        install = ['#!/bin/bash', 'set -euo pipefail']
        for entry in config['write_files']:
            path = entry['path']
            if '/systemd/system/' not in path and not path.startswith(('/etc/vox-crew/', '/etc/vox/autonomous-envelopes/')):
                continue
            data = entry['content'] if entry.get('encoding') == 'b64' else base64.b64encode(entry['content'].encode()).decode()
            install += [f"install -d '{str(Path(path).parent).replace(chr(92), '/')}'",
                f"printf '%s' '{data}' | base64 -d > '{path}'", f"chmod {entry.get('permissions', '0644')} '{path}'"]
        if kind == 'production': install.append(install_envelopes)
        install.append('systemctl daemon-reload')
        if kind == 'production': install += ['systemctl restart vox-production.service', 'systemctl is-active vox-production.service']
        (args.output / ('install-' + kind + '.sh')).write_text('\n'.join(install) + '\n', encoding='utf-8', newline='\n')
    (args.output / 'deployment.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest))


if __name__ == '__main__': main()
