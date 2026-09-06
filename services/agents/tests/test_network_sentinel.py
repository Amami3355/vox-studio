"""The sentinel that keeps the rest of the suite honest.

Every other test here claims to need no network. That claim is only worth something if a test
that reaches for one fails, so this checks the sentinel itself rather than trusting it.

It matters most for the researcher agent, which is the part of the crew that legitimately does
talk to the internet: a fictional Brief must take the skip path and make zero research calls,
and a test that quietly succeeded by making a real one would be evidence of the opposite of
what it claimed.
"""

from __future__ import annotations

import asyncio
import socket

import pytest
from conftest import NetworkEgressAttempted, admitted_endpoints


def test_a_connection_attempt_fails_the_test() -> None:
    with pytest.raises(NetworkEgressAttempted):
        socket.create_connection(("example.com", 443), timeout=1)


def test_a_socket_of_its_own_cannot_connect_either() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        with pytest.raises(NetworkEgressAttempted):
            sock.connect(("127.0.0.1", 9))


def test_name_resolution_is_egress_too() -> None:
    """A lookup leaks the question even when the request that would follow never happens."""
    with pytest.raises(NetworkEgressAttempted):
        socket.getaddrinfo("api.parallel.ai", 443)


def test_an_endpoint_a_test_opened_itself_is_reachable_and_only_that_one(
    admit_endpoint,
) -> None:
    """The one hole, checked rather than trusted — including that it is only one hole.

    `HttpProductionClient` cannot be tested without a socket. What makes that safe is that the
    admission is an exact address a test is serving on, not a range and not "loopback".
    """
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    port = listener.getsockname()[1]
    admit_endpoint("127.0.0.1", port)
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as admitted:
            admitted.connect(("127.0.0.1", port))
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as neighbour:
            # One port over, on the same interface, and still refused.
            with pytest.raises(NetworkEgressAttempted):
                neighbour.connect(("127.0.0.1", port + 1))
    finally:
        listener.close()


def test_no_admission_outlives_the_test_that_opened_it() -> None:
    """A hole left open would silently admit every later test in the session."""
    assert admitted_endpoints() == frozenset()


def test_an_asyncio_wakeup_pair_is_not_mistaken_for_network_egress() -> None:
    """The async crew must be testable while arbitrary loopback remains closed."""
    assert asyncio.run(asyncio.sleep(0, result="awake")) == "awake"
