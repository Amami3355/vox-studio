"""Consumption is derived from paid dispatch evidence, including replay and missing data."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from types import SimpleNamespace

import pytest

from vox_crew.consumption import consumption_records, price_at_dispatch, public_consumption
from vox_crew.hosted import write_json
from vox_crew.provider_usage import ProviderJournal, finish_call
from vox_crew.studio_projection import public_job
from vox_crew.studio_store import StudioStore
from vox_crew.studio_worker import publish_consumption


def usage(**changes):
    return SimpleNamespace(prompt_token_count=1000, cached_content_token_count=400,
        candidates_token_count=100, thoughts_token_count=200, total_token_count=1300,
        tool_use_prompt_token_count=0, **changes)


@pytest.fixture(autouse=True)
def fixed_prices(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "global")
    monkeypatch.setattr("vox_crew.provider_usage.price_at_dispatch", lambda provider, model, location:
        price_at_dispatch(provider, model, location, now=datetime(2026, 9, 9, tzinfo=timezone.utc)))


def test_reported_tokens_cache_reasoning_and_prices_survive_restart(tmp_path):
    path = tmp_path / "calls.jsonl"
    with ProviderJournal(path) as journal:
        call = journal.begin("SceneAuthor", "gemini-3.6-flash")
        finish_call(call, usage(), answerParts=[{"text": "PRIVATE ANSWER"}], secret="PRIVATE SECRET")
        first = journal.summary()
    with ProviderJournal(path) as reopened:
        assert reopened.summary() == first
        report = public_consumption({"providerUsage": first})
    row = report["rows"][0]
    assert row["tokens"] == {"input": 1000, "cached": 400, "output": 100,
                              "reasoning": 200, "total": 1300, "tools": 0}
    # 600 uncached input + 400 cached input + 300 output/reasoning.
    assert row["estimatedNanoUsd"] == 600 * 750 + 400 * 75 + 300 * 3750
    assert report["estimatedSubtotalUsd"] == pytest.approx(0.001605)
    assert report["costedCalls"] == 1
    assert "PRIVATE" not in json.dumps(report)
    assert "PRIVATE SECRET" not in path.read_text()


def test_failed_and_unknown_calls_are_included_without_inventing_zero_cost(tmp_path):
    with ProviderJournal(tmp_path / "calls.jsonl", reconcile_pending=True) as journal:
        first = journal.begin("Narrator", "gemini-3.6-flash")
        finish_call(first, providerOutcome="failed", providerHttpStatus=503)
        journal.begin("Narrator", "gemini-3.6-flash")
        report = public_consumption({"providerUsage": journal.summary()})
    assert report["totalCalls"] == 2
    assert report["pendingCalls"] == 1
    assert report["rows"][0]["failedCalls"] == 1
    assert report["rows"][0]["tokens"]["total"] is None
    assert report["estimatedSubtotalUsd"] is None
    assert report["unpricedCalls"] == 2


def test_parallel_image_journals_and_repeated_snapshots_do_not_double_count(tmp_path):
    from vox_crew.image_state import project_image
    from copy import deepcopy

    with ProviderJournal(tmp_path / "root.jsonl") as root:
        call = root.begin("Director", "gemini-3.6-flash")
        finish_call(call, usage())
        # Use the real coordinator's save/projection paths with isolated image journals.
        from vox_crew.autonomous import AutonomousRun
        run = object.__new__(AutonomousRun)
        run.journal, run.path, run.on_snapshot = root, tmp_path / "checkpoint.json", None
        run.state = {"steps": {}, "images": {}, "events": [], "technicalRepairs": 0}
        for identity in ("image-a", "image-b"):
            with ProviderJournal(tmp_path / f"{identity}.jsonl") as branch_journal:
                call = branch_journal.begin("ImageReviewer", "gemini-3.6-flash")
                finish_call(call, usage())
                branch = {"steps": {}, "images": {}, "events": [], "technicalRepairs": 0}
                for _ in range(2):
                    project_image(run.state, identity, branch, branch_journal.summary(), identity=identity, context_key="test")
                    run.save()
        saved = deepcopy(run.state["providerUsage"])
        run.save()
        assert run.state["providerUsage"] == saved
    report = public_consumption({"providerUsage": saved})
    assert report["totalCalls"] == report["costedCalls"] == 3
    assert sum(row["tokens"]["total"] for row in report["rows"]) == 3900
    assert report["estimatedSubtotalUsd"] == pytest.approx(0.004815)


def test_legacy_journals_and_unsupported_prices_keep_known_usage():
    records = [{"id": "old", "status": "dispatched", "model": "gemini-3.6-flash", "role": "Narrator"},
               {"id": "old", "status": "responded", "usage": {"prompt_token_count": 40, "total_token_count": 50}}]
    # Duplicate saved response rows must not add another charge.
    report = consumption_records(records + [records[-1]])
    assert report["rows"][0]["calls"] == 1
    assert report["rows"][0]["tokens"]["total"] == 50
    assert report["rows"][0]["tokens"]["cached"] is None
    assert report["rows"][0]["estimatedNanoUsd"] is None
    for model, location, date in (("unknown-model", "global", "2026-09-09"),
                                  ("gemini-3.6-flash", "europe-west1", "2026-09-09"),
                                  ("gemini-3.6-flash", "global", "2027-01-01")):
        assert price_at_dispatch("google-cloud", model, location, now=datetime.fromisoformat(date)) is None
    legacy = public_consumption({"providerUsage": {"calls": 49}})
    assert legacy["unattributedCalls"] == legacy["unpricedCalls"] == 49
    assert legacy["estimatedSubtotalUsd"] is None


def test_unsupported_billing_and_tool_usage_are_unpriced(tmp_path):
    with ProviderJournal(tmp_path / "calls.jsonl") as journal:
        call = journal.begin("Narrator", "gemini-3.6-flash")
        finish_call(call, usage(traffic_type="PROVISIONED_THROUGHPUT"))
        assert journal.summary()["consumption"]["rows"][0]["estimatedNanoUsd"] is None
        call = journal.begin("Researcher", "gemini-3.5-flash", grounded=True)
        counts = usage()
        counts.tool_use_prompt_token_count = 100
        finish_call(call, counts)
        assert all(row["estimatedNanoUsd"] is None for row in journal.summary()["consumption"]["rows"])


def test_field_coverage_and_captured_tariff_survive_mixed_historical_usage(tmp_path, monkeypatch):
    with ProviderJournal(tmp_path / "calls.jsonl") as journal:
        call = journal.begin("Narrator", "gemini-3.6-flash")
        # A deployment/rate change while a request is in flight cannot reprice it.
        monkeypatch.setattr("vox_crew.provider_usage.price_at_dispatch", lambda *args: None)
        finish_call(call, usage())
        old = journal.begin("Narrator", "gemini-3.6-flash")
        journal.append({"id": old, "status": "responded", "usage": {"total_token_count": 50, "prompt_token_count": 40}})
        report = public_consumption({"providerUsage": journal.summary()})
    row = report["rows"][0]
    assert row["tokens"]["input"] == 1040
    assert row["tokenReports"]["input"] == 2
    assert row["tokenReports"]["cached"] == 1
    assert row["costedCalls"] == 1
    assert report["estimatedSubtotalUsd"] == pytest.approx(0.001605)


def test_historical_publication_changes_no_checkpoint_or_journal(tmp_path):
    store = StudioStore(tmp_path / "studio")
    job = store.submit("consumption-fixture", {"text": "Explain tides.", "duration": 50, "language": "English"})
    crew = tmp_path / "crew"
    directory = crew / "briefs" / sha256(("studio-" + job["id"]).encode()).hexdigest()
    state = {"runId": "run-1", "originalRequest": {"brief": {"id": "studio-" + job["id"]}},
             "providerUsage": {"calls": 1}, "terminal": {"status": "ready"}}
    write_json(directory / "autonomous-v2.json", state)
    write_json(store.work(job["id"]) / "checkpoint.json", state)
    with ProviderJournal(directory / "provider-calls.jsonl") as journal:
        call = journal.begin("Narrator", "gemini-3.6-flash")
        finish_call(call, usage())
    paths = [directory / "autonomous-v2.json", directory / "provider-calls.jsonl", store.work(job["id"]) / "checkpoint.json"]
    before = [path.read_bytes() for path in paths]
    for _ in range(2):
        assert publish_consumption(store, job["id"], crew)["calls"] == 1
    assert before == [path.read_bytes() for path in paths]
    assert store.get(job["id"])["status"] == job["status"]
    assert public_job(store, store.get(job["id"]))["consumption"]["meteredCalls"] == 1
    state["runId"] = "another-film"
    write_json(directory / "autonomous-v2.json", state)
    with pytest.raises(Exception, match="exact film"):
        publish_consumption(store, job["id"], crew)


def test_old_image_branch_measurements_survive_continuation_without_restoring_old_visuals(tmp_path):
    from vox_crew.image_state import refresh_image_state
    with ProviderJournal(tmp_path / "image-pipelines" / "old-branch" / "provider-calls.jsonl") as journal:
        call = journal.begin("ImageReviewer", "gemini-3.6-flash")
        finish_call(call, usage())
    state = {"videoPlan": {"current": True}, "imageWorkflow": {"contextKey": "current"},
             "imagePipelines": {"old-branch": {"contextKey": "previous", "usage": {"calls": 1}}}}
    for _ in range(2):
        refresh_image_state(tmp_path, state)
    assert state["videoPlan"] == {"current": True}
    assert state["providerUsage"]["calls"] == 1
    assert public_consumption(state)["estimatedSubtotalUsd"] == pytest.approx(0.001605)
