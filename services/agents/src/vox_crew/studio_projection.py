"""An explicit browser projection, never raw checkpoints, provider prompts or signed envelopes."""
from __future__ import annotations

import json
from .autonomous_contract import digest
from .consumption import public_consumption
from .studio_controls import continuation_options, effective_limits, usage, resume_requirements, unreviewed_images
from urllib.parse import urlsplit


def read_json(path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else default


def web_url(value):
    if not isinstance(value, str):
        return None
    parsed = urlsplit(value)
    return value if parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username else None


def public_summary(summary):
    if not isinstance(summary, str):
        return ""
    if any(marker in summary for marker in ("ContractViolation:", "JSON private", "inspect operator evidence", "Traceback (")):
        return "The generated content could not pass the required checks. Your work is saved."
    return summary


def public_job(store, job):
    work = store.work(job["id"])
    state = read_json(work / "checkpoint.json", {})
    media = read_json(work / "media.json", [])
    awaiting = read_json(work / "awaiting-image.json")
    request = job["request"]
    dossier = state.get("researchDossier") or {}
    narrative = state.get("narrative") or {}
    images = []
    histories = {key: list(rows) for key, rows in state.get("images", {}).items()}
    for row in unreviewed_images(state):
        histories.setdefault(row["job"]["identityKey"], []).append(row)
    for identity, history in histories.items():
        for row in history:
            descriptor = row.get("job", {}).get("candidate", {}).get("artifact", {})
            artifact = next((m for m in media if m["sha256"] == descriptor.get("sha256")), None)
            if artifact:
                images.append({"identity": identity, "sha256": artifact["sha256"],
                               "url": f'/api/jobs/{job["id"]}/media/{artifact["sha256"]}',
                               "accepted": row.get("accepted", False),
                               "reviewPending": "review" not in row,
                               "assessment": row.get("review", {}).get("assessment", ""),
                               "observations": [{k: observation.get(k) for k in ("problem", "expected", "affectedIds")}
                                                for observation in row.get("review", {}).get("observations", [])],
                               "meaning": row.get("intention", {}).get("meaning", ""),
                               "requiredLimits": resume_requirements(state, "image", identity)})
    preview = next((m for m in reversed(media) if m["kind"] == "preview"), None)
    terminal = state.get("terminal") or {}
    reviewed = (terminal.get("status") == "reviewed" and preview is not None
                and preview["sha256"] == terminal.get("reviewedSha256") and preview.get("fullyDecoded") is True)
    delivery_ready = reviewed or (terminal.get("status") == "ready" and preview is not None
        and preview.get("fullyDecoded") is True and preview["sha256"] == terminal.get("verifiedSha256")
        and terminal.get("technicalVerification") == {"sha256": preview["sha256"], "fullyDecoded": True})
    sources = [{"title": source.get("title") or source.get("url", "Source"), "url": web_url(source.get("url"))}
               for source in dossier.get("sources", [])]
    decision = store.continuation(job["id"])
    requested = {**request, "limits": decision["request"]["limits"]} if decision and decision["request"].get("start") else request
    limits, consumed = effective_limits(state, requested), usage(state)
    options, refusal = continuation_options(state)
    resumable = not job["recorded"] and job["status"] in ("blocked", "interrupted", "ready", "reviewed")
    return {
        "id": job["id"], "prompt": request["text"], "duration": request["duration"],
        "language": request["language"], "status": job["status"], "createdAt": job["created"],
        "recorded": job["recorded"], "message": job["message"], "runId": state.get("runId"),
        "title": (state.get("editorialBrief") or {}).get("centralQuestion") or request["text"],
        "events": [{**{k: event.get(k) for k in ("sequence", "phase", "status", "observedAt", "imageIdentity")}, "summary": public_summary(event.get("summary"))}
                   for event in state.get("events", [])],
        "savedAt": state.get("savedAt"),
        "renderProgress": state.get("renderProgress"),
        "progressConnectionLost": state.get("progressConnectionLost", False),
        "imageProgress": [{k: row.get(k) for k in ("identity", "phase", "status", "observedAt")}
            for row in state.get("imagePipelines", {}).values()
            if row.get("contextKey") == state.get("imageWorkflow", {}).get("contextKey")],
        "sources": [s for s in sources if s["url"]],
        "beats": [{"id": beat.get("id"), "text": beat.get("text", "")}
                  for beat in narrative.get("beats", [])],
        "images": images,
        "limits": limits, "usage": consumed,
        "consumption": public_consumption(state, saved=read_json(work / "consumption.json")),
        "remaining": {name: None for name in limits},
        "stopRequested": store.stop_requested(job["id"]),
        "blockReason": public_summary(terminal.get("reason")) if job["status"] in ("blocked", "interrupted") else None,
        "continuation": {"checkpointSha256": digest(state), "targets": options if resumable else [],
                         "refusal": refusal if resumable else "", "pending": bool(decision and decision["status"] == "pending"),
                         "requiredLimits": {target: resume_requirements(state, target) for target in options if target != "image"}},
        "progress": {"researchReady": bool(state.get("coverageAccepted")),
                     "narrationReady": bool(state.get("take")),
                     "planReady": bool(state.get("videoPlan")),
                     "imagesReady": sum(bool(rows and rows[-1].get("accepted")) for rows in state.get("images", {}).values()),
                     "imagesCreated": sum(len(rows) for rows in histories.values()),
                     "imagesRequired": len(state["requiredImageIdentities"]) if "requiredImageIdentities" in state else None,
                     "imagesComplete": all(state.get("images", {}).get(identity) and state["images"][identity][-1].get("accepted")
                         for identity in state["requiredImageIdentities"]) if "requiredImageIdentities" in state else preview is not None,
                     "renderReady": preview is not None,
                     "reviewReady": reviewed, "deliveryReady": delivery_ready},
        "corrections": [correction_projection(state, correction) for correction in state.get("userCorrections", [])],
        "filmObservations": [{k: observation.get(k) for k in ("problem", "expected", "affectedIds", "startSeconds", "endSeconds")}
                             for row in list(state.get("filmReviews", {}).values())[-1:]
                             for observation in row["review"].get("observations", [])],
        "awaitingImage": ({"sha256": awaiting["sha256"], "meaning": awaiting["meaning"],
                           "url": f'/api/jobs/{job["id"]}/media/{awaiting["sha256"]}'}
                          if awaiting and job["status"] == "awaiting_image" else None),
        "preview": ({"url": f'/api/jobs/{job["id"]}/media/{preview["sha256"]}',
                     "sha256": preview["sha256"], "reviewed": reviewed, "ready": delivery_ready} if preview else None),
    }


def correction_projection(state, correction):
    public = {k: correction.get(k) for k in ("id", "target", "instruction", "identity")}
    public["outcome"] = "Instruction saved. See the activity history for completed operations."
    if correction["target"] != "image":
        return public
    matches = []
    for step in state.get("steps", {}).values():
        if step["name"] != "image_intent":
            continue
        value = step["dependencies"].get("context", {}).get("userCorrection") or {}
        if all(value.get(k) == correction.get(k) for k in ("identity", "candidateSha256", "instruction")):
            matches.append(step)
    if matches:
        public["outcome"] = "Preparation saved. No corrected image has been generated yet."
    generated = [row for row in state.get("images", {}).get(correction["identity"], []) + unreviewed_images(state)
        if row.get("request", {}).get("sourceCandidateSha256") == correction.get("candidateSha256")
        and correction["instruction"].strip() in row.get("request", {}).get("prompt", "")]
    if generated:
        latest = generated[-1]
        public["outcome"] = ("Corrected image generated; verification pending." if "review" not in latest else
            "Corrected image generated and accepted." if latest.get("accepted") else "Corrected image generated and rejected. See its review.")
    return public
