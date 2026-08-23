"""The sentinel that keeps the rest of the suite honest.

Every other test here claims to need no network. That claim is only worth something if a test
that reaches for one fails, so this checks the sentinel itself rather than trusting it.

It matters most for the researcher agent, which is the part of the crew that legitimately does
talk to the internet: a fictional Brief must take the skip path and make zero research calls,
and a test that quietly succeeded by making a real one would be evidence of the opposite of
what it claimed.
"""

from __future__ import annotations

import socket

import pytest
from conftest import NetworkEgressAttempted


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
