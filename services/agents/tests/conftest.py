"""Test fixtures for the crew.

The crew's tests are held to the same bar as the proofs: deterministic, and free. No
production service, no Gemini key, no ElevenLabs quota, and no network. The last one is the
only one a test can drift back into by accident, so it is enforced rather than intended.
"""

from __future__ import annotations

import json
import socket
import sys
from base64 import b64encode
from pathlib import Path
from typing import Any, Iterator

import pytest

FIXTURES = Path(__file__).parent / "fixtures"
FAKE_LAUNCHER = Path(__file__).parent / "fake_launcher.py"


class NetworkEgressAttempted(RuntimeError):
    """Raised when a test reaches for the network. Never caught; the test fails."""


@pytest.fixture(autouse=True)
def network_sentinel(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail any test that attempts egress, mirroring the proofs' zero-network probes.

    Both the connect calls and name resolution are closed off. Resolution matters on its own:
    a DNS lookup leaks the fact that a fictional Brief was researched even when the request
    that follows it never completes.
    """

    def refuse(*args: Any, **kwargs: Any) -> Any:
        raise NetworkEgressAttempted(
            "A test attempted network egress. Crew tests run against recorded fixtures."
        )

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)


def recorded(name: str) -> str:
    """The exact bytes a real invocation wrote to stdout, decoded.

    Opened with newline translation off, because the terminating newline is part of what the
    verbatim assertions are about.
    """
    with open(FIXTURES / name, encoding="utf-8", newline="") as recording:
        return recording.read()


def recorded_bytes(name: str) -> bytes:
    """An artifact body a fixture envelope publishes, as the bytes its descriptor hashes.

    These sit under `fixtures/artifacts/`, outside the `.stdout` files the contract test
    parses. They exist because `fetch_artifact` checks the digest: an envelope naming an
    artifact nothing can produce would leave the read-back direction untestable.
    """
    return (FIXTURES / "artifacts" / name).read_bytes()


@pytest.fixture
def work_root(tmp_path: Path) -> Path:
    """A work root in the shape `bootstrap:workroot` leaves behind: the launcher and a Brief."""
    root = tmp_path / "crew"
    root.mkdir()
    (root / "vox.exe").write_bytes(b"MZ-not-really-a-launcher")
    (root / "request.json").write_text(
        json.dumps(
            {
                "protocolVersion": 1,
                "brief": {"id": "crew-tracer-bullet-v1", "text": "A Brief the crew never edits."},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="",
    )
    return root


class Launcher:
    """A stand-in for vox.exe that replays recorded envelopes and records what it was asked.

    The client under test spawns a real process and reads real stdout, so everything between
    the client's method call and the command line is exercised. Only the service behind the
    pipe is replaced.
    """

    def __init__(self, script: Path, log: Path) -> None:
        self._script = script
        self._log = log

    @property
    def command(self) -> list[str]:
        return [sys.executable, str(FAKE_LAUNCHER), str(self._script)]

    @property
    def invocations(self) -> list[dict[str, Any]]:
        if not self._log.exists():
            return []
        return [
            json.loads(line)
            for line in self._log.read_text(encoding="utf-8").splitlines()
            if line
        ]

    @property
    def argvs(self) -> list[list[str]]:
        return [invocation["argv"] for invocation in self.invocations]

    def forget(self) -> None:
        """Drops the log, so a test can set a Run up and then assert about one command."""
        self._log.unlink(missing_ok=True)


def _encoded(responses: dict[str, Any]) -> dict[str, Any]:
    """Base64s the artifact bodies, because the response table travels as JSON.

    Tests write artifacts as the bytes an envelope's descriptor hashes, which is the readable
    thing to write and not a thing JSON carries.
    """
    return {
        key: (
            response
            if "artifacts" not in response
            else {
                **response,
                "artifacts": {
                    path: b64encode(
                        body if isinstance(body, bytes) else body.encode("utf-8")
                    ).decode("ascii")
                    for path, body in response["artifacts"].items()
                },
            }
        )
        for key, response in responses.items()
    }


@pytest.fixture
def launcher(tmp_path: Path) -> Iterator[Any]:
    """Builds a `Launcher` from a `{argv-prefix: {stdout, stderr, exitCode, artifacts}}` table.

    A key matches the longest argv prefix it names, so a whole Run is scriptable without
    knowing the directory the client will choose for it. `"*"` is the catch-all.
    """
    log = tmp_path / "invocations.jsonl"

    def build(responses: dict[str, Any]) -> Launcher:
        script = tmp_path / f"responses-{len(list(tmp_path.glob('responses-*.json')))}.json"
        script.write_text(
            json.dumps({"log": str(log), "responses": _encoded(responses)}),
            encoding="utf-8",
            newline="",
        )
        return Launcher(script, log)

    yield build
