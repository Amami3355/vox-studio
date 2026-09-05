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
from vox_crew.context import ContextBudget

FIXTURES = Path(__file__).parent / "fixtures"
FAKE_LAUNCHER = Path(__file__).parent / "fake_launcher.py"

UNLIMITED = 10**9
"""A budget line placed out of reach, so a test can name only the line it is about."""


def a_budget(
    *,
    resident_chars: int = UNLIMITED,
    fresh_chars: int = UNLIMITED,
    model_calls: int = UNLIMITED,
    returned_chars: int = UNLIMITED,
) -> ContextBudget:
    """A context budget with every line unreachable but the ones a test names.

    Four lines is where restating the whole constructor at each site stops being readable: a
    test about the returned line had three numbers in it that existed only to say "not this
    one", and the line it was actually about was the hardest of the four to find. Here rather
    than in one test module because three of them construct these, and a fifth line would
    otherwise be a fourth place to remember.
    """
    return ContextBudget(
        resident_chars=resident_chars,
        fresh_chars=fresh_chars,
        model_calls=model_calls,
        returned_chars=returned_chars,
    )


class NetworkEgressAttempted(RuntimeError):
    """Raised when a test reaches for the network. Never caught; the test fails."""


_ADMITTED: set[tuple[str, int]] = set()
"""Endpoints a test started itself, and may therefore talk to. See `admit_endpoint`."""


def admitted_endpoints() -> frozenset[tuple[str, int]]:
    """What the sentinel is currently open for, for the test that asserts it closes again.

    A copy, and a function rather than the set itself: the hole in a network sentinel is worth
    reading through a name that says it is being read, and worth being unable to widen from a
    test that only meant to look at it.
    """
    return frozenset(_ADMITTED)


def _admitted(address: Any) -> bool:
    if not isinstance(address, tuple) or len(address) < 2:
        return False
    try:
        return (str(address[0]), int(address[1])) in _ADMITTED
    except (TypeError, ValueError):
        return False


@pytest.fixture(autouse=True)
def network_sentinel(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail any test that attempts egress, mirroring the proofs' zero-network probes.

    Both the connect calls and name resolution are closed off. Resolution matters on its own:
    a DNS lookup leaks the fact that a fictional Brief was researched even when the request
    that follows it never completes.

    **The one hole is an exact endpoint a test opened itself**, registered through
    `admit_endpoint` and gone again when that test ends. `HttpProductionClient` has to speak to
    a socket to be tested at all, and the alternatives were both worse: mocking the transport
    would leave the half of the client that is HTTP untested, and admitting loopback wholesale
    would retire `test_a_socket_of_its_own_cannot_connect_either`, which is a real assertion —
    the crew's own service is on loopback in this topology, so "loopback is safe" is exactly the
    reasoning the sentinel exists to refuse.

    Nothing else changes: a port nobody registered is refused on loopback the same as anywhere,
    and name resolution stays closed regardless, because a test that knows its own port has no
    name to look up.
    """

    original_connect = socket.socket.connect
    original_create_connection = socket.create_connection
    original_getaddrinfo = socket.getaddrinfo

    def refuse(*args: Any, **kwargs: Any) -> Any:
        raise NetworkEgressAttempted(
            "A test attempted network egress. Crew tests run against recorded fixtures."
        )

    def connect(self: socket.socket, address: Any, *args: Any, **kwargs: Any) -> Any:
        if _admitted(address):
            return original_connect(self, address, *args, **kwargs)
        return refuse()

    def create_connection(address: Any, *args: Any, **kwargs: Any) -> Any:
        if _admitted(address):
            return original_create_connection(address, *args, **kwargs)
        return refuse()

    def getaddrinfo(host: Any, port: Any, *args: Any, **kwargs: Any) -> Any:
        # `create_connection` resolves before it connects, so an admitted endpoint has to be
        # resolvable or the hole it was given is not usable. It is the same endpoint either
        # way, and a name that is not one of them is still refused.
        if _admitted((host, port)):
            return original_getaddrinfo(host, port, *args, **kwargs)
        return refuse()

    monkeypatch.setattr(socket.socket, "connect", connect)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "create_connection", create_connection)
    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo)


@pytest.fixture
def admit_endpoint() -> Iterator[Any]:
    """Opens the sentinel for one address a test is serving itself, and closes it again."""
    opened: list[tuple[str, int]] = []

    def admit(host: str, port: int) -> None:
        opened.append((host, int(port)))
        _ADMITTED.add((host, int(port)))

    yield admit
    for endpoint in opened:
        _ADMITTED.discard(endpoint)


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
