"""The Python half of one signing rule that exists in two languages.

`HttpProductionClient` signs a request the trusted service verifies, and the two sides are
written in different languages from one definition. The cheap way to check that would be to
point the client at a host and see whether the request is admitted, and that test passes when
both sides are wrong in the same way — which is not hypothetical here.

So neither side is checked against the other. The definition is recorded once in
`fixtures/ipc-signing-vectors.json`, and each side asserts against the recording; the
TypeScript half is `packages/production/tests/signing-vectors.test.ts`, which reads this same
file. The reason each case is in the recording is written there and not repeated here.

**Re-recording the file is a protocol change, not a fix.** These bytes are the wire format, and
a deployed service verifies against them.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from vox_crew.wire import (
    artifact_request_signing_text,
    canonical_json,
    payload_request_signing_text,
    response_signing_text,
    sign_request,
)

VECTORS = json.loads(
    (Path(__file__).parent / "fixtures" / "ipc-signing-vectors.json").read_text(encoding="utf-8")
)
CASES = VECTORS["cases"]


def signing_text_for(case: dict) -> str:
    request = case["request"]
    if case["kind"] == "payload":
        return payload_request_signing_text(
            request_id=request["requestId"],
            timestamp_ms=request["timestampMs"],
            command=request["command"],
            run_id=request["runId"],
            payload=request["payload"],
        )
    if case["kind"] == "artifact":
        return artifact_request_signing_text(
            request_id=request["requestId"],
            timestamp_ms=request["timestampMs"],
            run_id=request["runId"],
            descriptor=request["descriptor"],
        )
    return response_signing_text(
        request_id=request["requestId"],
        exit_code=request["exitCode"],
        stdout_base64=request["stdoutBase64"],
        stderr_base64=request["stderrBase64"],
    )


def test_the_recording_carries_a_case_for_each_shape_a_caller_signs() -> None:
    # Without this the suite below is green over an empty list, and the reimplementation would
    # be checked against nothing at all.
    assert sorted(case["kind"] for case in CASES) == [
        "artifact",
        "payload",
        "payload",
        "response",
    ]
    assert len(VECTORS["secret"]) >= 32


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_reproduces_the_recorded_signing_text(case: dict) -> None:
    assert signing_text_for(case) == case["signingText"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_reproduces_the_recorded_mac(case: dict) -> None:
    assert sign_request(VECTORS["secret"], case["signingText"]) == case["mac"]


def test_the_length_prefix_counts_bytes_rather_than_characters() -> None:
    """The property the non-ASCII case exists for, named so editing the case cannot lose it."""
    text = next(case["signingText"] for case in CASES if "em dash" in case["signingText"])
    declared, _, value = text.split("\n")[-1].partition(":")

    assert len(value.encode("utf-8")) == int(declared)
    assert len(value.encode("utf-8")) > len(value)


def test_canonical_json_sorts_keys_and_separates_without_spaces() -> None:
    """Asserted directly, because the vector would also pass with a stable-but-wrong order."""
    assert canonical_json({"zeta": 1, "alpha": {"b": [], "a": None}}) == (
        '{"alpha":{"a":null,"b":[]},"zeta":1}'
    )


def test_canonical_json_refuses_what_the_service_refuses() -> None:
    """A value the TypeScript canonicaliser rejects must not be signed into a request here.

    Silently encoding one would produce a MAC the service can never reproduce, and the failure
    would surface as an unexplained dropped socket rather than as the bad value it is.
    """
    with pytest.raises(TypeError):
        canonical_json({"nan": float("nan")})
    with pytest.raises(TypeError):
        canonical_json({"set": {1, 2}})
