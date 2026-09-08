"""Read a Studio submission through the same authenticated API as its browser."""
import argparse
import http.cookiejar
import json
from pathlib import Path
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--origin", required=True)
parser.add_argument("--access-code-file", type=Path, required=True)
parser.add_argument("--job", required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
request = urllib.request.Request(args.origin + "/api/session",
    data=json.dumps({"code": args.access_code_file.read_text(encoding="utf-8").strip()}).encode(),
    headers={"Origin": args.origin, "X-Vox-Studio": "1", "Content-Type": "application/json"})
with opener.open(request, timeout=30) as response:
    if not json.load(response)["authenticated"]:
        raise ValueError("Studio authentication failed.")
with opener.open(args.origin + "/api/jobs/" + args.job, timeout=30) as response:
    job = json.load(response)
args.output.write_text(json.dumps(job, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps({"id": job["id"], "status": job["status"], "message": job["message"],
                  "lastEvent": job["events"][-1] if job["events"] else None,
                  "sources": len(job["sources"]), "images": len(job["images"]),
                  "awaitingImage": job["awaitingImage"], "preview": job["preview"]}))
