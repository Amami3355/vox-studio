"""Scan the built crew source/config roots for accidentally baked operator secrets."""
from pathlib import Path
import json
import re

roots = ['/opt/vox-crew', '/root', '/etc/vox-crew']
count = 0
for root in roots:
    for path in Path(root).rglob('*'):
        if not path.is_file() or any(p in ('__pycache__', '.cache') for p in path.parts): continue
        if path.name in ('.env', 'credentials.json', 'service-account.json', '.npmrc', 'network.env', 'parallel.env'):
            raise SystemExit('Unexpected credential file: ' + str(path))
        data = path.read_bytes()
        if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}', data):
            raise SystemExit('Credential material in ' + str(path))
        count += 1
assert not Path('/app/packages/production').exists(), 'Production implementation reached the crew image'
print(json.dumps({'passed': True, 'filesScanned': count, 'roots': roots, 'productionSourceAbsent': True}))
