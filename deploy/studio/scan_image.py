"""Inspect the built Studio source and static bundle without printing matching secret bytes."""
from pathlib import Path
import json
import re

roots = ("/opt/vox-crew", "/opt/studio-static", "/etc/vox-crew", "/root")
count = 0
for root in roots:
    for path in Path(root).rglob("*"):
        if not path.is_file() or any(part in ("__pycache__", ".cache") for part in path.parts):
            continue
        if path.name in (".env", "credentials.json", "service-account.json", "network.env", "parallel.env", "studio.env", "access-code.txt"):
            raise SystemExit("Unexpected credential file: " + str(path))
        if re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}", path.read_bytes()):
            raise SystemExit("Credential material detected in: " + str(path))
        count += 1
for path in ("/app/packages/production", "/opt/vox-crew/packages/production", "/build"):
    if Path(path).exists():
        raise SystemExit("Build-only or Production source found in runtime: " + path)
print(json.dumps({"passed": True, "roots": roots, "filesScanned": count, "productionSourceAbsent": True}))
