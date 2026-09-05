"""The network implementation of the production client: one signed request per command.

This is the second implementation of the deployment seam, and the whole reason the seam is where
ADR-0015 put it. `local_client.py` spawns a launcher, stages payloads onto the caller's own disk
and reads artifacts back off it; this one holds no work root, opens no file and spawns nothing.
Nothing above the seam can tell which of the two it is holding, and
`test_client_contract.py` runs the same suite over both to keep that true.

Four things are worth knowing about how it holds the boundary.

**It is reached through a tunnel and presents no identity of its own.** The address is a
forwarded local port; `sshd` and a firewall answered *who may connect* before this module sent a
byte, and there is no public ingress to reach. So the only credential here is the HMAC key, and
it authenticates the request *body* — a different question from the channel's, and one the
channel's answer does not cover. ADR-0018 decision 2 is where that is argued.

**The key is read per request rather than held.** `key_source` is called each time, so the
default reads `VOX_NETWORK_TOKEN` out of the environment at the moment of signing. A client
object that captured it at construction would keep production's credential alive in a field for
as long as the crew ran, which is a longer life than the boundary needs it to have.

**It verifies what answered the socket.** A response whose MAC does not check out is refused
rather than parsed, because the tunnel says who may *connect* and the MAC says who produced the
bytes, and letting one answer stand for both is the cheap mistake ADR-0018 forbids by name. The
one exception is an artifact's bytes, which carry no MAC: they are authenticated by the digest
the descriptor published, recomputed here on arrival.

**Nothing is retried, and the omission is deliberate.** A synchronous render blocks for minutes,
and a client that retried it on a timeout would start a second render of the same Run. A timeout
surfaces as `ProductionUnavailable`, which is the error the interface already publishes for
"no Run was touched". Retry belongs with asynchronous render and is not this phase's.
"""

from __future__ import annotations

import json
import os
from base64 import b64decode
from collections.abc import Callable, Mapping
from hashlib import sha256
from http.client import HTTPConnection, HTTPException
from time import time
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from .client import (
    Artifact,
    ArtifactCorrupted,
    ArtifactMissing,
    ArtifactOutsideRun,
    ProductionClient,
    ProductionUnavailable,
    UnknownRun,
)
from .envelopes import ArtifactDescriptor, ResultEnvelope, parse_envelope
from .wire import (
    PROTOCOL_VERSION,
    artifact_request_signing_text,
    payload_request_signing_text,
    response_signing_text,
    sign_request,
)

COMMAND_ROUTE = "/command"
ARTIFACT_ROUTE = "/artifact"
KEY_VARIABLE = "VOX_NETWORK_TOKEN"
# Long enough for a render, which is the only command that takes minutes. The same figure the
# local client uses, because the command behind it is the same command.
DEFAULT_TIMEOUT_SECONDS = 1800.0

REFUSALS: dict[str, type[Exception]] = {
    "UNKNOWN_RUN": UnknownRun,
    "ARTIFACT_MISSING": ArtifactMissing,
    "ARTIFACT_CORRUPTED": ArtifactCorrupted,
    "ARTIFACT_OUTSIDE_RUN": ArtifactOutsideRun,
}


def _from_environment() -> str:
    key = os.environ.get(KEY_VARIABLE)
    if not key:
        raise ProductionUnavailable(
            f"{KEY_VARIABLE} is not set, so no request to production can be signed."
        )
    return key


class HttpProductionClient(ProductionClient):
    def __init__(
        self,
        address: str,
        *,
        key_source: Callable[[], str | bytes] | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        parsed = urlsplit(address if "//" in address else f"//{address}")
        if not parsed.hostname:
            raise ValueError(f"{address!r} names no host to reach production at.")
        self._host = parsed.hostname
        self._port = parsed.port or 80
        self._key_source = key_source if key_source is not None else _from_environment
        self._timeout_seconds = timeout_seconds

    # -- the command surface ---------------------------------------------------------------

    def contract_index(self) -> ResultEnvelope:
        return self._command("contract.index")

    def contract_show(self, category: str) -> ResultEnvelope:
        return self._command("contract.show", payload={"category": category})

    def init(self, request: Mapping[str, Any]) -> ResultEnvelope:
        return self._command("run.init", payload=dict(request))

    def status(self, run_id: str) -> ResultEnvelope:
        return self._command("run.status", run_id=run_id)

    def validate(self, run_id: str, plan: Mapping[str, Any]) -> ResultEnvelope:
        return self._command("run.validate", run_id=run_id, payload=dict(plan))

    def preflight(self, run_id: str) -> ResultEnvelope:
        return self._command("run.preflight", run_id=run_id)

    def record(
        self, run_id: str, replacement_authorisation: Mapping[str, Any] | None = None
    ) -> ResultEnvelope:
        payload = None if replacement_authorisation is None else dict(replacement_authorisation)
        return self._command("run.record", run_id=run_id, payload=payload)

    def compile(self, run_id: str) -> ResultEnvelope:
        return self._command("run.compile", run_id=run_id)

    def render(self, run_id: str) -> ResultEnvelope:
        return self._command("run.render", run_id=run_id)

    def decline(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        return self._command("run.decline", run_id=run_id, payload=dict(decision))

    def fetch_artifact(self, run_id: str, artifact: ArtifactDescriptor) -> Artifact:
        descriptor = {
            "kind": artifact.kind,
            "path": artifact.path,
            "sha256": artifact.sha256,
        }
        request_id = str(uuid4())
        timestamp_ms = self._now_ms()
        body = {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "timestampMs": timestamp_ms,
            "runId": run_id,
            "descriptor": descriptor,
        }
        body["mac"] = sign_request(
            self._key_source(),
            artifact_request_signing_text(
                request_id=request_id,
                timestamp_ms=timestamp_ms,
                run_id=run_id,
                descriptor=descriptor,
            ),
        )
        content_type, data = self._post(ARTIFACT_ROUTE, body)
        if content_type.startswith("application/json"):
            self._refuse(data, run_id, artifact)
        # The digest is recomputed here rather than taken from the answer, which is the whole of
        # what authenticates these bytes: the descriptor came from an envelope this client
        # verified, and bytes that do not hash to it are not the artifact it published.
        actual = sha256(data).hexdigest()
        if actual != artifact.sha256:
            raise ArtifactCorrupted(
                f"Run {run_id} published {artifact.kind!r} as {artifact.sha256} and it hashes "
                f"to {actual}."
            )
        return Artifact(kind=artifact.kind, sha256=actual, data=data)

    # -- the wire --------------------------------------------------------------------------

    def _command(
        self,
        command: str,
        *,
        run_id: str | None = None,
        payload: Mapping[str, Any] | None = None,
    ) -> ResultEnvelope:
        request_id = str(uuid4())
        timestamp_ms = self._now_ms()
        body: dict[str, Any] = {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "timestampMs": timestamp_ms,
            "command": command,
            "runId": run_id,
            "payload": None if payload is None else dict(payload),
        }
        body["mac"] = sign_request(
            self._key_source(),
            payload_request_signing_text(
                request_id=request_id,
                timestamp_ms=timestamp_ms,
                command=command,
                run_id=run_id,
                payload=body["payload"],
            ),
        )
        _, data = self._post(COMMAND_ROUTE, body)
        envelope = parse_envelope(self._verified(request_id, data))
        # The local client raises this before it spawns anything, because it resolves a Run id
        # against its own work root. Here the service is the only thing that can answer, and it
        # answers in an envelope; the crew above the seam must not be able to tell the two apart.
        if envelope.error is not None and envelope.error.code == "UNKNOWN_RUN":
            raise UnknownRun(envelope.error.message)
        return envelope

    def _verified(self, request_id: str, data: bytes) -> str:
        try:
            response = json.loads(data)
            mac = response["mac"]
            answered = response["requestId"]
            stdout_base64 = response["stdoutBase64"]
            stderr_base64 = response["stderrBase64"]
            exit_code = response["exitCode"]
        except (ValueError, KeyError, TypeError) as malformed:
            raise ProductionUnavailable(
                "Production answered with something that is not a response."
            ) from malformed
        expected = sign_request(
            self._key_source(),
            response_signing_text(
                request_id=answered,
                exit_code=exit_code,
                stdout_base64=stdout_base64,
                stderr_base64=stderr_base64,
            ),
        )
        # Both halves matter. The MAC says production produced these bytes; the request id says
        # they are the answer to *this* call rather than a replayed answer to an earlier one.
        if mac != expected or answered != request_id:
            raise ProductionUnavailable("The crew received an unauthenticated response.")
        return b64decode(stdout_base64).decode("utf-8")

    def _post(self, route: str, body: Mapping[str, Any]) -> tuple[str, bytes]:
        encoded = json.dumps(body).encode("utf-8")
        connection = HTTPConnection(self._host, self._port, timeout=self._timeout_seconds)
        try:
            connection.request(
                "POST",
                route,
                body=encoded,
                headers={
                    "content-type": "application/json",
                    "content-length": str(len(encoded)),
                },
            )
            answer = connection.getresponse()
            return answer.headers.get("content-type", ""), answer.read()
        except (OSError, HTTPException) as unreachable:
            # A refusal reaches here as a closed socket rather than as a status code, which is
            # the boundary's design: it says nothing about *why* it refused. So this cannot
            # distinguish a bad MAC from a service that is down, and it does not pretend to.
            raise ProductionUnavailable(
                f"Production did not answer {route} at {self._host}:{self._port}."
            ) from unreachable
        finally:
            connection.close()

    def _refuse(self, data: bytes, run_id: str, artifact: ArtifactDescriptor) -> None:
        try:
            code = str(json.loads(data)["code"])
        except (ValueError, KeyError, TypeError) as malformed:
            raise ProductionUnavailable(
                "Production refused an artifact without naming a reason."
            ) from malformed
        refusal = REFUSALS.get(code)
        if refusal is None:
            raise ProductionUnavailable(f"Production refused an artifact with {code}.")
        raise refusal(f"Run {run_id} and {artifact.kind!r}: {code}.")

    @staticmethod
    def _now_ms() -> int:
        return int(time() * 1000)
