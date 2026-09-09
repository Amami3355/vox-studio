"""Authenticated Studio API. HTTP requests admit work; a separate worker executes it."""
from __future__ import annotations

import argparse
from collections import defaultdict, deque
from hashlib import sha256
import hmac
import os
from pathlib import Path
import re
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from .studio_projection import public_job, read_json
from .studio_store import StudioConflict, StudioStore
from .studio_controls import ProductionLimits, ResumeInput, validate_resume


class BriefInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=2000)
    duration: int = Field(ge=30, le=300)
    language: str = Field(pattern=r"^(English|French)$")
    limits: ProductionLimits = Field(default_factory=ProductionLimits)


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=256)


class ImageDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    accepted: bool
    reason: str = Field(default="", max_length=500)


def create_app(root: Path, assets: Path, *, access_code: str, origin: str):
    if len(access_code) < 16:
        raise ValueError("Install a Studio access code of at least 16 characters.")
    if not origin.startswith("https://") and not re.fullmatch(r"http://(127\.0\.0\.1|localhost)(:\d+)?", origin):
        raise ValueError("Use HTTPS for hosted access or a loopback address for local access.")
    store = StudioStore(root)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store
    attempts = defaultdict(deque)

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            if request.method not in ("GET", "HEAD"):
                if request.headers.get("origin") != origin or request.headers.get("x-vox-studio") != "1":
                    return JSONResponse({"detail": "This action must come from your Studio."}, status_code=403)
                try:
                    if int(request.headers.get("content-length", "0")) > 16384:
                        return JSONResponse({"detail": "Request too large."}, status_code=413)
                except ValueError:
                    return JSONResponse({"detail": "Invalid request length."}, status_code=400)
            if request.url.path != "/api/session" or request.method != "POST":
                if not store.authenticated(request.cookies.get("vox_session")):
                    return JSONResponse({"detail": "Sign in to open this workspace."}, status_code=401)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "private, no-store"
        return response

    @app.exception_handler(StudioConflict)
    async def conflict(request, error):
        return JSONResponse({"detail": str(error)}, status_code=409)

    @app.exception_handler(KeyError)
    async def missing(request, error):
        return JSONResponse({"detail": "This production was not found."}, status_code=404)

    @app.post("/api/session")
    def login(body: LoginInput, request: Request):
        address = request.client.host if request.client else "unknown"
        recent = attempts[address]
        while recent and recent[0] < time.monotonic() - 60:
            recent.popleft()
        if len(recent) >= 10:
            raise HTTPException(429, "Too many sign-in attempts. Try again in a minute.")
        recent.append(time.monotonic())
        if not hmac.compare_digest(body.code.encode(), access_code.encode()):
            raise HTTPException(401, "The access code is incorrect.")
        response = JSONResponse({"authenticated": True})
        response.set_cookie("vox_session", store.session(), max_age=43200, httponly=True,
                            secure=origin.startswith("https://"), samesite="strict")
        return response

    @app.get("/api/session")
    def session():
        return {"authenticated": True, "workspace": "Vox Studio"}

    @app.delete("/api/session")
    def logout(request: Request):
        store.logout(request.cookies.get("vox_session"))
        response = JSONResponse({"authenticated": False})
        response.delete_cookie("vox_session")
        return response

    @app.get("/api/jobs")
    def jobs():
        return {"jobs": [public_job(store, job) for job in store.list()]}

    @app.get("/api/production-limits")
    def production_limits():
        return {"defaults": ProductionLimits().model_dump(), "schema": ProductionLimits.model_json_schema()}

    @app.post("/api/jobs", status_code=202)
    def submit(body: BriefInput, request: Request):
        key = request.headers.get("idempotency-key", "")
        if not re.fullmatch(r"[a-zA-Z0-9_-]{16,100}", key) or not body.text.strip():
            raise HTTPException(422, "A nonempty brief and a valid submission key are required.")
        value = body.model_dump()
        value["limits"] = ProductionLimits().model_dump()
        return public_job(store, store.submit(key, value))

    @app.get("/api/jobs/{job_id}")
    def job(job_id: str):
        return public_job(store, store.get(job_id))

    @app.post("/api/jobs/{job_id}/resume", status_code=202)
    def resume(job_id: str, body: ResumeInput, request: Request):
        key = request.headers.get("idempotency-key", "")
        if not re.fullmatch(r"[a-zA-Z0-9_-]{16,100}", key):
            raise HTTPException(422, "A valid continuation key is required.")
        job = store.get(job_id)
        value = body.model_dump()
        old = store.continuation(job_id, key)
        if old:
            store.request_continuation(job_id, key, value, expected_status=job["status"])
            return public_job(store, store.get(job_id))
        state = read_json(store.work(job_id) / "checkpoint.json", {})
        validate_resume(state, value)
        store.request_continuation(job_id, key, value, expected_status=job["status"])
        return public_job(store, store.get(job_id))

    @app.post("/api/jobs/{job_id}/stop", status_code=202)
    def stop(job_id: str):
        store.request_stop(job_id)
        return public_job(store, store.get(job_id))

    @app.post("/api/jobs/{job_id}/retry-continuation", status_code=202)
    def retry_continuation(job_id: str):
        store.retry_continuation(job_id)
        return public_job(store, store.get(job_id))

    @app.post("/api/jobs/{job_id}/start", status_code=202)
    def start(job_id: str, body: ProductionLimits, request: Request):
        key = request.headers.get("idempotency-key", "")
        if not re.fullmatch(r"[a-zA-Z0-9_-]{16,100}", key):
            raise HTTPException(422, "A valid action key is required.")
        job = store.get(job_id)
        value = {"start": True, "limits": body.model_dump()}
        if not store.continuation(job_id, key) and read_json(store.work(job_id) / "checkpoint.json"):
            raise StudioConflict("This production already has saved work. Use its continuation controls.")
        store.request_continuation(job_id, key, value, expected_status="awaiting_authorization")
        return public_job(store, store.get(job_id))

    @app.post("/api/jobs/{job_id}/image-decision")
    def decide(job_id: str, body: ImageDecision):
        job = store.get(job_id)
        value = body.model_dump()
        old = store.decision(job_id, body.sha256)
        if old is not None:
            store.decide(job_id, body.sha256, value)
            return {"saved": True}
        awaiting = read_json(store.work(job_id) / "awaiting-image.json")
        if job["recorded"] or job["status"] != "awaiting_image" or not awaiting or awaiting["sha256"] != body.sha256:
            raise StudioConflict("This image is no longer awaiting your decision.")
        if not body.accepted and not body.reason.strip():
            raise HTTPException(422, "Describe what needs to change in the image.")
        store.decide(job_id, body.sha256, value)
        return {"saved": True}

    @app.get("/api/jobs/{job_id}/media/{digest}")
    @app.head("/api/jobs/{job_id}/media/{digest}")
    def media(job_id: str, digest: str, download: bool = False):
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise HTTPException(404, "Media not found.")
        work = store.work(job_id)
        descriptor = next((item for item in read_json(work / "media.json", []) if item["sha256"] == digest), None)
        if descriptor is None:
            raise HTTPException(404, "This media is not available yet.")
        path = work / "media" / digest
        if not path.is_file() or sha256(path.read_bytes()).hexdigest() != digest:
            raise HTTPException(409, "Media verification failed. The file cannot be served.")
        mime = "video/mp4" if descriptor["kind"] == "preview" else "image/png"
        name = "vox-film.mp4" if descriptor["kind"] == "preview" else "vox-image.png"
        return FileResponse(path, media_type=mime, filename=name,
                            content_disposition_type="attachment" if download else "inline")

    @app.get("/{path:path}")
    def frontend(path: str):
        target = (assets / path).resolve()
        if not target.is_relative_to(assets.resolve()):
            raise HTTPException(404)
        if not target.is_file():
            if path.startswith("api/") or "." in Path(path).name:
                raise HTTPException(404)
            target = assets / "index.html"
        if not target.is_file():
            raise HTTPException(503, "Build the Studio frontend before starting the server.")
        return FileResponse(target)

    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8780)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    import uvicorn
    app = create_app(args.state, args.assets, access_code=os.environ.get("VOX_STUDIO_ACCESS_CODE", ""),
                     origin=os.environ.get("VOX_STUDIO_ORIGIN", f"http://127.0.0.1:{args.port}"))
    uvicorn.run(app, host=args.host, port=args.port, proxy_headers=False)


if __name__ == "__main__":
    main()
