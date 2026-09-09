"""Disposable HTTP test workspace. No crew, provider keys or worker is started."""
from pathlib import Path
import tempfile
import uvicorn
from vox_crew.studio_api import create_app
from vox_crew.hosted import write_json
from vox_crew.studio_worker import save_media
from base64 import b64decode
from hashlib import sha256

with tempfile.TemporaryDirectory(prefix="vox-studio-browser-") as directory:
    app = create_app(Path(directory), Path(__file__).resolve().parents[1] / "dist",
                     access_code="browser-test-workspace-only", origin="http://127.0.0.1:8781")
    @app.post('/api/testing/reset')
    def reset():
        # Test server only, absent from the production application.
        with app.state.store.connection() as db:
            db.execute('DELETE FROM continuations')
            db.execute('DELETE FROM decisions')
            db.execute('DELETE FROM jobs')
        return {"reset": True}

    @app.post('/api/testing/blocked')
    def blocked():
        store = app.state.store
        job = store.submit('browser-blocked-fixture', {"text": "Explain lightning and thunder.", "duration": 50, "language": "English"})
        store.transition(job['id'], 'awaiting_authorization', 'blocked', 'Image remains rejected after the allowed corrections.')
        data = b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
        descriptor = {"kind": "generated_image_candidate", "sha256": sha256(data).hexdigest()}
        save_media(store.work(job['id']), data, descriptor)
        row = {"accepted": False, "job": {"id": "candidate", "candidate": {"artifact": descriptor}},
            "intention": {"meaning": "Light and sound propagation"}, "review": {"assessment": "Both tracks look the same.",
            "observations": [{"problem": "Arcs appear on both tracks.", "expected": "Use a continuous beam for light.", "affectedIds": ["propagation_light"]}]}}
        write_json(store.work(job['id']) / 'checkpoint.json', {"imageReviewMode": "studio", "pending": None,
            "terminal": {"status": "blocked", "reason": "Rejected images"}, "runId": "browser-fixture",
            "limits": {"maxCalls": 40, "maxSearches": 4, "maxImages": 5}, "take": {"takeId": "existing"},
            "images": {"propagation_light": [row, row, row]}, "filmCorrections": 0,
            "providerUsage": {"calls": 23, "searches": 1, "images": 4, "takes": 1, "uncertain": False}})
        return {"id": job['id']}

    @app.post('/api/testing/model-response')
    def model_response():
        store = app.state.store
        message = 'This step could not produce a usable response after the allowed automatic repairs. Your completed work is saved.'
        job = store.submit('browser-model-fixture', {"text": "Explain reusable rockets.", "duration": 50, "language": "English"})
        store.transition(job['id'], 'awaiting_authorization', 'blocked', message)
        write_json(store.work(job['id']) / 'checkpoint.json', {"imageReviewMode": "studio", "pending": None,
            "terminal": {"status": "blocked", "code": "model_response", "reason": message}, "runId": "browser-fixture",
            "pendingModelRecovery": {"step": "scene_author", "context": {"maxOutputTokens": 32768}},
            "technicalRepairs": 2, "limits": {"maxCalls": 40, "maxSearches": 4, "maxImages": 5},
            "narrative": {"beats": [{"id": "b1", "text": "Engine thrust slows the descent."}]},
            "contractDiagnostic": {"error": "SceneAuthor JSON private diagnostic"},
            "events": [{"sequence": 1, "phase": "verification", "status": "blocked", "summary": "ContractViolation: inspect operator evidence before resuming."}],
            "providerUsage": {"calls": 10, "searches": 1, "images": 0, "takes": 0, "uncertain": False}})
        return {"id": job['id']}

    @app.post('/api/testing/progress')
    def progress(phase: str = 'images'):
        from datetime import datetime, timezone
        store = app.state.store
        job = store.submit('browser-progress-fixture', {"text": "Explain parallel image production.", "duration": 50, "language": "English"})
        current = store.get(job['id'])
        store.transition(job['id'], current['status'], 'ready' if phase == 'ready' else 'running')
        now = datetime.now(timezone.utc).isoformat()
        images = {} if phase == 'images' else {identity: [{"accepted": True, "job": {"id": identity}}] for identity in ('rocket-a', 'rocket-b')}
        state = {"imageReviewMode": "studio_automatic", "runId": "browser-fixture", "pending": None,
            "take": {"takeId": "existing"}, "images": images, "requiredImageIdentities": ['rocket-a', 'rocket-b'],
            "savedAt": now, "events": [{"sequence": 1, "phase": 'image_review' if phase == 'images' else phase,
                "status": "started", "observedAt": now}], "imageWorkflow": {"contextKey": "fixture"},
            "imagePipelines": {identity: {"identity": identity, "contextKey": "fixture", "status": "running",
                "phase": 'image_generation' if index == 0 else 'image_review', "observedAt": now}
                for index, identity in enumerate(('rocket-a', 'rocket-b'))}}
        if phase == 'render':
            state['renderProgress'] = {"phase": "render", "elapsedMs": 25000, "renderedFrames": 120,
                "encodedFrames": 90, "totalFrames": 300, "observedAt": now}
        if phase == 'ready':
            data = b'fixture media: browser text test only'
            descriptor = {"kind": "preview", "sha256": sha256(data).hexdigest()}
            save_media(store.work(job['id']), data, descriptor, fully_decoded=True)
            state['terminal'] = {"status": "ready", "verifiedSha256": descriptor['sha256'],
                "technicalVerification": {"sha256": descriptor['sha256'], "fullyDecoded": True}}
        write_json(store.work(job['id']) / 'checkpoint.json', state)
        return {"id": job['id']}

    uvicorn.run(app, host="127.0.0.1", port=8781, access_log=False)
