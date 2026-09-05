"""What is true of the network client because it is the network's, and of no other client.

The expectations about the *interface* are in `test_client_contract.py` and run over this client
alongside the other two. What is left here is the part a local client cannot be asked about: what
it puts on the wire, what it refuses to believe about what came back, and what it does when the
socket does not answer.

The service on the other end is `stub_service.py`, and what that does and does not prove is
written there. In one line: it proves the HTTP, and the signing rule is proved somewhere else
entirely, because a client and a stub written by the same hand agree about a mistake perfectly.
"""

from __future__ import annotations

import hashlib
import inspect
import json
from collections.abc import Iterator
from typing import Any

import pytest
from in_memory_client import InMemoryProductionClient
from stub_service import SECRET, StubProductionService
from vox_crew.client import ArtifactCorrupted, ProductionUnavailable
from vox_crew.envelopes import ArtifactDescriptor
from vox_crew.http_client import KEY_VARIABLE, HttpProductionClient

REQUEST = {"protocolVersion": 1, "brief": {"id": "crew-tracer-bullet-v1", "text": "A Brief."}}
PLAN = {"beats": [{"id": "b1", "text": "One beat."}], "sections": []}
BODY = b'{"ok":true}'
ARTIFACT = ArtifactDescriptor(
    kind="validation_report",
    path="artifacts/validation/report.json",
    sha256=hashlib.sha256(BODY).hexdigest(),
)


@pytest.fixture
def service(admit_endpoint) -> Iterator[Any]:
    """Starts a stub service and hands back a factory for clients pointed at it."""
    started: list[StubProductionService] = []

    def start(**options: Any) -> tuple[StubProductionService, HttpProductionClient]:
        store = InMemoryProductionClient()
        stub = StubProductionService(store, **options)
        port = stub.start()
        admit_endpoint("127.0.0.1", port)
        started.append(stub)
        client = HttpProductionClient(f"http://127.0.0.1:{port}", key_source=lambda: SECRET)
        client.store = store  # type: ignore[attr-defined]
        return stub, client

    yield start
    for stub in started:
        stub.stop()


# -- how it is constructed -------------------------------------------------------------------


def test_it_is_constructed_with_an_address_and_has_nowhere_to_put_a_work_root() -> None:
    """`LocalProductionClient.__init__` takes a work root and this one must have no such field.

    Asserted on the constructor rather than on the published methods, because the interface's
    own guard never looks at `__init__` — and a work root smuggled in there would reintroduce
    disk knowledge above the seam just as effectively.
    """
    parameters = inspect.signature(HttpProductionClient.__init__).parameters
    forbidden = ("path", "root", "dir", "file", "cwd")

    assert "address" in parameters
    for name, parameter in parameters.items():
        if name == "self":
            continue
        assert not any(word in name.lower() for word in forbidden), f"{name} is path-shaped"
        assert "Path" not in str(parameter.annotation)


def test_it_refuses_an_address_that_names_no_host() -> None:
    with pytest.raises(ValueError):
        HttpProductionClient("http://")


def test_the_key_is_read_for_each_request_rather_than_held(service) -> None:
    """Decision 8's property, extended to the crew: it presents a credential it was given.

    A client that captured the key at construction would keep production's credential alive for
    as long as the crew ran. Read per request, its lifetime is the call.
    """
    stub, _ = service()
    reads: list[int] = []

    def source() -> str:
        reads.append(1)
        return SECRET

    client = HttpProductionClient(f"http://127.0.0.1:{stub._server.server_address[1]}", key_source=source)
    client.contract_index()
    client.contract_index()

    # Two calls, and each signs a request and verifies a response with a freshly read key.
    assert len(reads) == 4


def test_the_default_key_source_reads_the_environment_and_says_so_when_it_is_empty(
    monkeypatch,
) -> None:
    monkeypatch.delenv(KEY_VARIABLE, raising=False)
    client = HttpProductionClient("http://127.0.0.1:1")

    with pytest.raises(ProductionUnavailable) as unavailable:
        client.contract_index()

    assert KEY_VARIABLE in str(unavailable.value)


# -- what it puts on the wire ------------------------------------------------------------------


def test_a_command_carries_its_payload_as_an_object_and_names_its_route(service) -> None:
    stub, client = service()
    run_id = client.init(REQUEST).run.id

    client.validate(run_id, PLAN)

    validate = next(each for each in stub.requests if each.get("command") == "run.validate")
    assert validate["payload"] == PLAN
    assert validate["runId"] == run_id
    assert validate["protocolVersion"] == 1


def test_a_request_id_is_new_for_every_call(service) -> None:
    """The service refuses a replayed id, so a client that reused one would work exactly once."""
    stub, client = service()

    client.contract_index()
    client.contract_index()
    client.contract_index()

    ids = [each["requestId"] for each in stub.requests]
    assert len(set(ids)) == len(ids) == 3


# -- what it refuses to believe -----------------------------------------------------------------


def test_it_refuses_a_response_it_cannot_authenticate(service) -> None:
    """The tunnel says who may connect; this says who produced the bytes. Not the same question."""
    _, client = service(sign_responses=False)

    with pytest.raises(ProductionUnavailable) as refusal:
        client.contract_index()

    assert "unauthenticated" in str(refusal.value)


def test_it_checks_the_digest_itself_rather_than_trusting_the_answer(service) -> None:
    """The refusal that makes the artifact route safe without a response MAC.

    The service here hands back bytes the descriptor does not name — the shape a compromised or
    confused service produces — and the client is the only thing between those bytes and a crew
    that would act on them.
    """
    _, client = service(corrupt_artifact=True)
    run_id = client.init(REQUEST).run.id
    client.store.publish(run_id, ARTIFACT.path, BODY)

    with pytest.raises(ArtifactCorrupted):
        client.fetch_artifact(run_id, ARTIFACT)


def test_a_refused_request_arrives_as_unavailable_and_carries_no_reason(service) -> None:
    """The boundary closes the socket without saying why, and the client does not invent one."""
    stub, _ = service()
    port = stub._server.server_address[1]
    wrong = HttpProductionClient(f"http://127.0.0.1:{port}", key_source=lambda: "x" * 40)

    with pytest.raises(ProductionUnavailable) as refusal:
        wrong.contract_index()

    message = str(refusal.value)
    assert "MAC" not in message and "replay" not in message and "IPC_" not in message


# -- what it does when nothing answers -----------------------------------------------------------


def test_a_timeout_surfaces_as_unavailable_and_the_command_is_not_retried(service) -> None:
    """A render blocks for minutes. A client that retried on a timeout would start a second one.

    The assertion that matters is the second one: one request reached the service, not two.
    """
    stub, _ = service(delay_seconds=2.0)
    port = stub._server.server_address[1]
    impatient = HttpProductionClient(
        f"http://127.0.0.1:{port}", key_source=lambda: SECRET, timeout_seconds=0.2
    )

    with pytest.raises(ProductionUnavailable):
        impatient.contract_index()

    assert len(stub.requests) == 1


def test_a_service_that_is_not_there_is_unavailable_rather_than_an_unexplained_error(
    service,
) -> None:
    """The port is admitted and then vacated, which is the shape of a service that has stopped.

    Pointing at a port the sentinel never admitted would test the sentinel instead: it refuses
    the attempt before any socket is opened, and the client would never see the connection fail.
    """
    stub, client = service()
    stub.stop()

    with pytest.raises(ProductionUnavailable):
        client.contract_index()


def test_an_answer_that_is_not_a_response_is_unavailable(service) -> None:
    stub, client = service()
    original = stub._signed
    stub._signed = lambda *args: json.dumps({"nothing": "useful"}).encode("utf-8")  # type: ignore[method-assign]
    try:
        with pytest.raises(ProductionUnavailable):
            client.contract_index()
    finally:
        stub._signed = original  # type: ignore[method-assign]
