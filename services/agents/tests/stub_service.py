"""A trusted service the tests start, speaking the wire the real one speaks.

The real host is TypeScript and there is no way to run it from `pytest` — the two halves of this
repository are deliberately separate projects, and a Python suite that needed a Node toolchain
would stop being free. So the client is driven against this, in-process, on a loopback ephemeral
port the sentinel is opened for by name.

**What this proves and what it does not.** It proves the half of `HttpProductionClient` that is
HTTP: the routes it posts to, the request bodies it builds, how it reads a response, what it does
with a refusal, and that it verifies what answered the socket. It proves *nothing* about the
signing rule, because it verifies with the same `vox_crew.wire` the client signs with — two
copies of one mistake would agree perfectly. The signing rule is held by
`fixtures/ipc-signing-vectors.json`, which neither side can satisfy by being consistent with the
other, and the route shapes are held by `network-host.test.ts` against the real host.

The store underneath is the in-memory client, so what a command *means* is defined once and this
file only carries it over a socket.
"""

from __future__ import annotations

import json
import socketserver
import threading
from base64 import b64encode
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from time import time
from typing import Any

from in_memory_client import InMemoryProductionClient
from vox_crew.client import (
    ArtifactCorrupted,
    ArtifactMissing,
    ArtifactOutsideRun,
    UnknownRun,
)
from vox_crew.envelopes import ArtifactDescriptor
from vox_crew.wire import (
    artifact_request_signing_text,
    payload_request_signing_text,
    response_signing_text,
    sign_request,
)

SECRET = "stub-service-secret-that-is-at-least-thirty-two-bytes"

REFUSAL_CODES = {
    UnknownRun: "UNKNOWN_RUN",
    ArtifactMissing: "ARTIFACT_MISSING",
    ArtifactCorrupted: "ARTIFACT_CORRUPTED",
    ArtifactOutsideRun: "ARTIFACT_OUTSIDE_RUN",
}


class Refused(Exception):
    """A boundary refusal. The real host closes the socket without saying why, and so does this."""


def _failed_envelope(command: str | None, code: str, message: str) -> str:
    return (
        json.dumps(
            {
                "protocolVersion": 1,
                "command": command,
                "outcome": "failed",
                "run": None,
                "data": None,
                "artifacts": [],
                "error": {"code": code, "message": message, "details": None},
                "next": [],
            }
        )
        + "\n"
    )


class StubProductionService:
    """The service side of the second transport, over an in-memory store."""

    def __init__(
        self,
        store: InMemoryProductionClient,
        *,
        secret: str = SECRET,
        delay_seconds: float = 0.0,
        corrupt_artifact: bool = False,
        sign_responses: bool = True,
    ) -> None:
        self.store = store
        self.secret = secret
        self.delay_seconds = delay_seconds
        self.corrupt_artifact = corrupt_artifact
        self.sign_responses = sign_responses
        self.requests: list[dict[str, Any]] = []
        self._seen: set[str] = set()
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    # -- lifecycle --------------------------------------------------------------------------

    def start(self) -> int:
        service = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *args: Any) -> None:  # noqa: D102 - silence the test output
                return

            def do_POST(self) -> None:  # noqa: N802 - the name http.server dispatches on
                try:
                    body = json.loads(
                        self.rfile.read(int(self.headers.get("content-length", "0")))
                    )
                except (ValueError, TypeError):
                    self.close_connection = True
                    return
                try:
                    if self.path == "/command":
                        content_type, payload = service._command(body)
                    elif self.path == "/artifact":
                        content_type, payload = service._artifact(body)
                    else:
                        raise Refused("IPC_ROUTE_UNKNOWN")
                except Refused:
                    # No status code, no body: a reason is an oracle.
                    self.close_connection = True
                    return
                self.send_response(200)
                self.send_header("content-type", content_type)
                self.send_header("content-length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        class Server(ThreadingHTTPServer):
            daemon_threads = True

            def server_bind(self) -> None:
                # `HTTPServer.server_bind` resolves its own hostname, and the sentinel refuses
                # name resolution outright. The name is only ever used to fill in a `Host`
                # header this service never sends.
                socketserver.TCPServer.server_bind(self)
                self.server_name, self.server_port = self.server_address[:2]

        self._server = Server(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return int(self._server.server_address[1])

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)

    # -- the boundary -----------------------------------------------------------------------

    def _admit(self, body: Any, signing_text: Callable[[dict], str]) -> dict:
        if not isinstance(body, dict) or body.get("protocolVersion") != 1:
            raise Refused("IPC_MALFORMED")
        request_id = body.get("requestId")
        if not isinstance(request_id, str):
            raise Refused("IPC_MALFORMED")
        timestamp = body.get("timestampMs")
        if not isinstance(timestamp, int) or abs(time() * 1000 - timestamp) > 30_000:
            raise Refused("IPC_STALE")
        if request_id in self._seen:
            raise Refused("IPC_REPLAY")
        try:
            expected = sign_request(self.secret, signing_text(body))
        except (KeyError, TypeError) as malformed:
            raise Refused("IPC_MALFORMED") from malformed
        if body.get("mac") != expected:
            raise Refused("IPC_AUTH")
        self._seen.add(request_id)
        self.requests.append(body)
        return body

    def _command(self, body: Any) -> tuple[str, bytes]:
        request = self._admit(
            body,
            lambda each: payload_request_signing_text(
                request_id=each["requestId"],
                timestamp_ms=each["timestampMs"],
                command=each["command"],
                run_id=each["runId"],
                payload=each["payload"],
            ),
        )
        if self.delay_seconds:
            threading.Event().wait(self.delay_seconds)
        command = request["command"]
        try:
            stdout, exit_code = self._dispatch(command, request["runId"], request["payload"])
        except UnknownRun as absent:
            stdout, exit_code = _failed_envelope(command, "UNKNOWN_RUN", str(absent)), 1
        return "application/json", self._signed(request["requestId"], exit_code, stdout)

    def _dispatch(self, command: str, run_id: str | None, payload: Any) -> tuple[str, int]:
        store = self.store
        if command == "contract.index":
            return store.contract_index().raw, 0
        if command == "contract.show":
            return store.contract_show(payload["category"]).raw, 0
        if command == "run.init":
            return store.init(payload).raw, 0
        if command == "run.validate":
            return store.validate(run_id, payload).raw, 0
        if command == "run.decline":
            return store.decline(run_id, payload).raw, 0
        if command == "run.record":
            return store.record(run_id, replacement_authorisation=payload).raw, 0
        if command == "run.image.start":
            return store.image_start(
                run_id, payload["request"], authorisation=payload.get("authorization")
            ).raw, 0
        if command == "run.image.status":
            return store.image_status(run_id, payload["jobId"]).raw, 0
        if command == "run.image.accept":
            return store.image_accept(run_id, payload).raw, 0
        if command == "run.image.reject":
            return store.image_reject(run_id, payload).raw, 0
        if command in ("run.status", "run.preflight", "run.compile", "run.render"):
            return getattr(store, command.split(".")[1])(run_id).raw, 0
        return _failed_envelope(None, "UNKNOWN_COMMAND", f"{command} is not served."), 1

    def _artifact(self, body: Any) -> tuple[str, bytes]:
        request = self._admit(
            body,
            lambda each: artifact_request_signing_text(
                request_id=each["requestId"],
                timestamp_ms=each["timestampMs"],
                run_id=each["runId"],
                descriptor=each["descriptor"],
            ),
        )
        descriptor = ArtifactDescriptor(**request["descriptor"])
        try:
            artifact = self.store.fetch_artifact(request["runId"], descriptor)
        except tuple(REFUSAL_CODES) as refusal:
            code = next(
                code for kind, code in REFUSAL_CODES.items() if isinstance(refusal, kind)
            )
            return "application/json", json.dumps({"code": code}).encode("utf-8")
        if self.corrupt_artifact:
            # A service that hands back bytes the descriptor does not name. The client's own
            # digest check is the only thing between this and a crew acting on them.
            return "application/octet-stream", b"bytes the descriptor never named"
        return "application/octet-stream", artifact.data

    def _signed(self, request_id: str, exit_code: int, stdout: str) -> bytes:
        stdout_base64 = b64encode(stdout.encode("utf-8")).decode("ascii")
        response = {
            "protocolVersion": 1,
            "requestId": request_id,
            "exitCode": exit_code,
            "stdoutBase64": stdout_base64,
            "stderrBase64": "",
        }
        mac = sign_request(
            self.secret,
            response_signing_text(
                request_id=request_id,
                exit_code=exit_code,
                stdout_base64=stdout_base64,
                stderr_base64="",
            ),
        )
        return json.dumps(
            {**response, "mac": mac if self.sign_responses else "0" * 64}
        ).encode("utf-8")
