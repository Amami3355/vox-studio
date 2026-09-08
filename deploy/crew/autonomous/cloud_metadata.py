"""Back up, install, or verify only the two named VMs' user-data through Compute REST."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('backup', 'install', 'verify'))
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    token = subprocess.run(['gcloud.cmd', 'auth', 'print-access-token'], check=True,
        capture_output=True, text=True).stdout.strip()
    def api(url, value=None):
        req = urllib.request.Request(url, data=json.dumps(value).encode() if value else None,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=60) as response: return json.load(response)
    results = []
    for kind, vm in [('production', 'vox-service'), ('crew', 'vox-crew-worker')]:
        url = 'https://compute.googleapis.com/compute/v1/projects/studio-prod-7f3a/zones/europe-west1-c/instances/' + vm
        instance = api(url)
        metadata = instance['metadata']
        old = next(row['value'] for row in metadata['items'] if row['key'] == 'user-data')
        if args.action == 'backup':
            path = args.directory / (kind + '-previous.yaml')
            if path.exists(): raise ValueError('Never overwrite a deployment backup.')
            path.write_text(old, encoding='utf-8', newline='\n')
        else:
            expected = (args.directory / (kind + '.yaml')).read_text(encoding='utf-8')
            if args.action == 'install':
                items = [row for row in metadata['items'] if row['key'] != 'user-data'] + [{'key': 'user-data', 'value': expected}]
                operation = api(url + '/setMetadata', {'fingerprint': metadata['fingerprint'], 'items': items})
                results.append({'vm': vm, 'operation': operation['name']})
                continue
            if old != expected: raise ValueError('Boot metadata mismatch: ' + vm)
        results.append({'vm': vm, 'sha256': sha256(old.encode()).hexdigest(), 'bytes': len(old.encode()),
                        'action': args.action})
    (args.directory / ('metadata-' + args.action + '.json')).write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results))


if __name__ == '__main__': main()
