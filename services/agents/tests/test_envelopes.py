"""The envelope is the crew's whole view of production. It arrives unmodified or not at all."""

from __future__ import annotations

import json
from hashlib import sha256

import pytest
from conftest import recorded, recorded_bytes
from vox_crew.envelopes import ArtifactDescriptor, MalformedEnvelope, parse_envelope


def test_reads_a_recorded_contract_index() -> None:
    envelope = parse_envelope(recorded("contract-index.stdout"))
    assert envelope.command == "contract.index"
    assert envelope.outcome == "succeeded"
    assert envelope.succeeded
    assert envelope.error is None
    assert [category["id"] for category in envelope.data["categories"]] == [
        "language",
        "plan",
        "catalog",
        "checks",
        "protocol",
    ]


def test_keeps_the_bytes_the_service_wrote() -> None:
    """Verbatim is a byte property, not a JSON-equality property.

    Re-serialising would preserve meaning and lose key order and separators, and the crew is
    meant to be shown what the interface said, not a faithful paraphrase of it.
    """
    raw = recorded("contract-show-checks.stdout")
    assert parse_envelope(raw).raw == raw


def test_carries_a_refusal_the_crew_can_act_on() -> None:
    envelope = parse_envelope(recorded("run-validate-needs-repair.stdout"))
    assert envelope.outcome == "needs_repair"
    assert not envelope.succeeded
    # A refusal is not a failure: the service reports it on exit code 0 with the Run intact,
    # and the detail lives in an artifact the crew fetches rather than in the envelope.
    assert envelope.error is None
    assert envelope.data["report"] == {"ok": False, "errorCount": 2, "warningCount": 1}
    assert [artifact.kind for artifact in envelope.artifacts] == ["validation_report"]
    assert [suggestion.command for suggestion in envelope.next] == ["run.validate"]
    assert envelope.next[0].reason == "Repair the reported plan errors and validate again."
    assert envelope.next[0].args == ("--run", ".", "--plan", "plan.json")


def test_carries_a_failure_with_its_code_intact() -> None:
    envelope = parse_envelope(recorded("run-validate-failed.stdout"))
    assert envelope.outcome == "failed"
    assert envelope.error is not None
    assert envelope.error.code == "INVALID_INPUT"
    assert envelope.error.message == "Unexpected end of JSON input"
    assert envelope.error.details is None
    assert envelope.run is None


def test_names_the_run_it_belongs_to() -> None:
    envelope = parse_envelope(recorded("run-init-succeeded.stdout"))
    assert envelope.run is not None
    assert envelope.run.id == "0f6d4a3e-2c11-4c1a-9d7b-8a5f2e9c4d10"
    assert envelope.run.stage == "initialized"


def test_reads_artifact_descriptors_as_objects() -> None:
    envelope = parse_envelope(recorded("run-render-succeeded.stdout"))
    # The digest is the fixture preview's own, not a written-down constant: the envelope and
    # the body beside it have to agree, because `fetch_artifact` checks one against the other.
    assert envelope.artifacts == (
        ArtifactDescriptor(
            kind="preview",
            path="artifacts/renders/" + "a1" * 32 + "/preview.mp4",
            sha256=sha256(recorded_bytes("preview.mp4")).hexdigest(),
        ),
    )
    assert envelope.artifact("preview") is envelope.artifacts[0]
    assert envelope.artifact("take_audio") is None


@pytest.mark.parametrize(
    ("raw", "because"),
    [
        ("", "empty stdout"),
        ("vox: Production service is unavailable.\n", "not JSON at all"),
        (json.dumps({"protocolVersion": 2, "command": None}), "a protocol the crew cannot read"),
        (json.dumps({"protocolVersion": 1}), "missing the fields every envelope carries"),
        (json.dumps([1, 2, 3]), "not an object"),
    ],
)
def test_refuses_anything_that_is_not_an_envelope(raw: str, because: str) -> None:
    with pytest.raises(MalformedEnvelope):
        parse_envelope(raw)
