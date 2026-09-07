"""Hosted assembly preserves the existing crew and its operator boundary."""

import asyncio
import json
from hashlib import sha256

import pytest

from test_crew_cli import CrewCliClient, REQUEST, a_crew_work_root
from vox_crew.crew_run import recorded_policy
from vox_crew.hosted import persistent_root, probe, run_attempt, write_json


def test_container_directory_is_not_a_persistent_volume(tmp_path):
    with pytest.raises(ValueError, match="mounted persistent volume"):
        persistent_root(tmp_path)


def test_probe_reads_contracts_and_status_and_reuses_persistence_marker(tmp_path):
    client = CrewCliClient()
    first = probe(client, tmp_path, "tracer-run")
    second = probe(client, tmp_path, "tracer-run")
    assert second["persistenceMarker"] == first["persistenceMarker"]
    assert second["previousObservation"] == first["observedAt"]
    assert second["contractSha256"]
    assert not any(call in client.calls for call in ("init", "record", "render"))


def test_hosted_attempt_runs_existing_crew_and_persists_public_updates(tmp_path):
    config = tmp_path / "config"
    config.mkdir()
    a_crew_work_root(config)
    write_json(config / "operator-policy.json", recorded_policy().to_mapping())
    state = tmp_path / "state"
    state.mkdir()
    client = CrewCliClient()
    assert asyncio.run(run_attempt(client, state, config, REQUEST)) == 1
    work = state / "briefs" / sha256(REQUEST["brief"]["id"].encode()).hexdigest()
    assert list((work / "checkpoints").glob("*.json"))
    attempts = list((work / "attempts").iterdir())
    assert len(attempts) == 1
    events = [json.loads(line) for line in (attempts[0] / "events.jsonl").read_text().splitlines()]
    assert len(events) > 1
    assert events[-1]["outcome"] == "paused"
    assert "human review" in events[-1]["summary"]
    assert json.loads((attempts[0] / "state.json").read_text()) == events[-1]


def test_request_cannot_supply_its_own_policy(tmp_path):
    client = CrewCliClient()
    request = {**REQUEST, "policy": {"models": {"mode": "live"}}}
    with pytest.raises(ValueError, match="operator policy"):
        asyncio.run(run_attempt(client, tmp_path, tmp_path, request))
    assert client.calls == []


def test_absent_operator_policy_refuses_before_production(tmp_path):
    client = CrewCliClient()
    with pytest.raises(RuntimeError, match="policy"):
        asyncio.run(run_attempt(client, tmp_path, tmp_path, REQUEST))
    assert client.calls == []
