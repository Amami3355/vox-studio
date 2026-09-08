"""Verify loopback delivery, downloads, ranges and available media without providers."""
from hashlib import sha256
import argparse
import json
import subprocess
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8767/')
BASE = parser.parse_args().url.rstrip('/') + '/'
def get(path, **kwargs):
    with urlopen(Request(BASE + path, **kwargs), timeout=30) as response:
        return response.status, dict(response.headers), response.read()

status, _, html = get("")
assert status == 200
_, _, data = get("verification.json")
attempts = json.loads(data)
receipt = {"url": BASE, "httpStatus": status, "artifactDownloadsVerified": 0,
           "byteRangesVerified": 0, "audioDecodedOverHttp": [], "videoDecodedOverHttp": [], "intermediateVideosDecodedOverHttp": []}
for attempt in attempts:
    slug = attempt["subject"]
    _, _, data = get(slug + "/export-index.json")
    index = json.loads(data)
    for item in index["files"]:
        path = slug + "/" + item["exportedAs"]
        status, headers, data = get(path)
        assert status == 200 and sha256(data).hexdigest() == item["sha256"]
        head, head_headers, _ = get(path, method="HEAD")
        assert head == 200 and int(head_headers["Content-Length"]) == len(data)
        receipt["artifactDownloadsVerified"] += 1
        if data:
            end = min(1023, len(data) - 1)
            status, headers, part = get(path, headers={"Range": f"bytes=0-{end}"})
            assert status == 206 and part == data[:end + 1]
            assert headers["Content-Range"] == f"bytes 0-{end}/{len(data)}"
            receipt["byteRangesVerified"] += 1
        if item["kind"] == "take_audio":
            subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", BASE + path, "-f", "null", "-"],
                           check=True, capture_output=True, timeout=120)
            receipt["audioDecodedOverHttp"].append(item["sha256"])
    if attempt["result"]["status"] == "reviewed":
        path = slug + "/video.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", BASE + path,
                        "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
                       check=True, capture_output=True, timeout=240)
        subprocess.run(["ffmpeg", "-v", "error", "-ss", "10", "-i", BASE + path, "-t", "1", "-f", "null", "-"],
                       check=True, capture_output=True, timeout=60)
        receipt["videoDecodedOverHttp"].append(attempt["result"]["reviewedSha256"])
    else:
        assert "Blocked" in html.decode()
        if attempt.get('intermediatePreviewSha256'):
            preview = next(item for item in index['files'] if item['sha256'] == attempt['intermediatePreviewSha256'])
            path = slug + '/' + preview['exportedAs']
            subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', BASE + path,
                '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], check=True, capture_output=True, timeout=240)
            subprocess.run(['ffmpeg', '-v', 'error', '-ss', '10', '-i', BASE + path, '-t', '1', '-f', 'null', '-'],
                check=True, capture_output=True, timeout=60)
            receipt['intermediateVideosDecodedOverHttp'].append(preview['sha256'])
receipt['videoPlaybackTested'] = False
receipt['videoDecodeTested'] = bool(receipt['videoDecodedOverHttp'] or receipt['intermediateVideosDecodedOverHttp'])
receipt['limitation'] = 'FFmpeg decoding and HTTP seeking were tested; browser playback and human audiovisual appreciation were not.'
if not receipt['videoDecodedOverHttp']:
    receipt['deliveryLimitation'] = 'No final film accepted by the audiovisual reviewer. Any available MP4 is an intermediate draft.'
print(json.dumps(receipt, indent=2))
