"""An explicit browser projection, never raw checkpoints, provider prompts or signed envelopes."""
from __future__ import annotations

import json
from urllib.parse import urlsplit


def read_json(path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else default


def web_url(value):
    if not isinstance(value, str):
        return None
    parsed = urlsplit(value)
    return value if parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username else None


def public_job(store, job):
    work = store.work(job["id"])
    state = read_json(work / "checkpoint.json", {})
    media = read_json(work / "media.json", [])
    awaiting = read_json(work / "awaiting-image.json")
    request = job["request"]
    dossier = state.get("researchDossier") or {}
    narrative = state.get("narrative") or {}
    images = []
    for identity, history in state.get("images", {}).items():
        for row in history:
            descriptor = row.get("job", {}).get("candidate", {}).get("artifact", {})
            artifact = next((m for m in media if m["sha256"] == descriptor.get("sha256")), None)
            if artifact:
                images.append({"identity": identity, "sha256": artifact["sha256"],
                               "url": f'/api/jobs/{job["id"]}/media/{artifact["sha256"]}',
                               "accepted": row.get("accepted", False),
                               "assessment": row.get("review", {}).get("assessment", ""),
                               "meaning": row.get("intention", {}).get("meaning", "")})
    preview = next((m for m in reversed(media) if m["kind"] == "preview"), None)
    terminal = state.get("terminal") or {}
    reviewed = (terminal.get("status") == "reviewed" and preview is not None
                and preview["sha256"] == terminal.get("reviewedSha256") and preview.get("fullyDecoded") is True)
    sources = [{"title": source.get("title") or source.get("url", "Source"), "url": web_url(source.get("url"))}
               for source in dossier.get("sources", [])]
    return {
        "id": job["id"], "prompt": request["text"], "duration": request["duration"],
        "language": request["language"], "status": job["status"], "createdAt": job["created"],
        "recorded": job["recorded"], "message": job["message"], "runId": state.get("runId"),
        "title": (state.get("editorialBrief") or {}).get("centralQuestion") or request["text"],
        "events": [{k: event.get(k) for k in ("sequence", "phase", "status", "summary")}
                   for event in state.get("events", [])[-100:]],
        "sources": [s for s in sources if s["url"]],
        "beats": [{"id": beat.get("id"), "text": beat.get("text", "")}
                  for beat in narrative.get("beats", [])],
        "images": images,
        "awaitingImage": ({"sha256": awaiting["sha256"], "meaning": awaiting["meaning"],
                           "url": f'/api/jobs/{job["id"]}/media/{awaiting["sha256"]}'}
                          if awaiting and job["status"] == "awaiting_image" else None),
        "preview": ({"url": f'/api/jobs/{job["id"]}/media/{preview["sha256"]}',
                     "sha256": preview["sha256"], "reviewed": reviewed} if preview else None),
    }
