"""Regression coverage for unlimited Studio work and durable correction identity."""
import asyncio
from copy import deepcopy

import pytest

from test_autonomous import Director, Reviewer, make
from test_studio_continuation import blocked_run, correction_for
from vox_crew.provider_usage import ProviderJournal, ProviderLimit, begin_call, finish_call
from vox_crew.studio_controls import apply_correction, effective_limits


def test_existing_exhausted_films_have_no_effective_ceilings():
    state = {"limits": {"maxCalls": 50, "maxImages": 6},
             "providerUsage": {"calls": 50},
             "studioAuthorization": {"limits": {"maxCalls": 50}}}
    assert all(value is None for value in effective_limits(state).values())


def test_unlimited_journal_retains_usage_and_blocks_unknown_outcomes(tmp_path):
    path = tmp_path / "provider.jsonl"
    with ProviderJournal(path, max_calls=None, max_grounded_calls=None) as journal:
        for _ in range(51):
            finish_call(journal.begin("Research", "fixture", grounded=True))
        assert journal.summary()["calls"] == 51
        journal.begin("ImageGeneration", "fixture")
        with pytest.raises(ProviderLimit, match="uncertain"):
            journal.begin("ImageGeneration", "fixture")
    with pytest.raises(ProviderLimit, match="uncertain"):
        ProviderJournal(path, max_calls=None, max_grounded_calls=None)


def test_repeated_authorization_reuses_prepared_correction(tmp_path, monkeypatch):
    run = blocked_run(tmp_path, monkeypatch)
    body = correction_for(run.state)
    calls = []

    class CountedDirector(Director):
        async def image_intent(self, payload):
            finish_call(begin_call("ImageCreator", "fixture"))
            calls.append(deepcopy(payload))
            return await super().image_intent(payload)

    run.director = CountedDirector()
    run.production_limits = body["limits"]
    compiled = run.client.compile(run.state["runId"])
    path = tmp_path / "provider-calls.jsonl"
    used = run.state["providerUsage"]["calls"]
    run.state = apply_correction(run.state, {"id": "first", "request": body}, {"limits": body["limits"]})
    with ProviderJournal(path, max_calls=used + 1):
        with pytest.raises(ProviderLimit, match="ceiling"):
            asyncio.run(run.images(compiled))
    assert len(calls) == 1
    run.state = apply_correction(run.state, {"id": "second", "request": body}, {"limits": body["limits"]})
    run.reviewer = Reviewer(images=(True,))
    with ProviderJournal(path, max_calls=used + 10):
        asyncio.run(run.images(compiled))
    assert len(calls) == 1, "A new authorization must not invalidate the same image preparation"
    assert run.state["images"]["rocket"][-1]["accepted"]
    assert run.client.calls.count("image_start") == 4


def test_unlimited_corrections_reach_a_reviewed_film_beyond_old_allowance(tmp_path, monkeypatch):
    with ProviderJournal(tmp_path / "provider.jsonl", max_calls=None, max_grounded_calls=None):
        run = make(tmp_path, monkeypatch, production_limits=effective_limits({}),
                   reviewer=Reviewer(images=(False, False, False, False, False, True)))
        assert asyncio.run(run.run())["status"] == "ready"
    assert run.client.calls.count("image_start") == 6
    assert run.client.takes == 1
    assert len(run.state["progressReviews"]) == 4


def test_stop_saves_generated_image_then_resume_reviews_without_regeneration(tmp_path, monkeypatch):
    from vox_crew.studio_controls import continuation_options
    stop = [False]
    with ProviderJournal(tmp_path / "provider.jsonl", max_calls=None, max_grounded_calls=None):
        run = make(tmp_path, monkeypatch, production_limits=effective_limits({}),
                   reviewer=Reviewer(images=(True,)), stop_requested=lambda: stop[0])
        generate = run.client.image_start
        def stop_after_generation(*args):
            result = generate(*args)
            stop[0] = True
            return result
        run.client.image_start = stop_after_generation
        assert asyncio.run(run.run())["code"] == "stopped"
        assert run.client.calls.count("image_start") == 1
        assert not run.reviewer.bytes
        assert continuation_options(run.state)[0] == ["continue"]
        stop[0] = False
        run.state["terminal"] = None
        assert asyncio.run(run.run())["status"] == "ready"
        assert run.client.calls.count("image_start") == 1


def test_contradictory_reviews_suspend_with_the_public_reason(tmp_path, monkeypatch):
    class ConflictedDirector(Director):
        async def progress(self, payload):
            return {"action": "ask_user", "reason": "The reviews ask for opposite arrow directions.", "correction": ""}
    run = make(tmp_path, monkeypatch, production_limits=effective_limits({}),
               director=ConflictedDirector(), reviewer=Reviewer(images=(False, False)))
    result = asyncio.run(run.run())
    assert result["status"] == "blocked" and "opposite arrow" in result["reason"]
    assert run.client.calls.count("image_start") == 2


def test_parallel_image_pause_offers_direction_and_resumes_with_saved_take(tmp_path, monkeypatch):
    from vox_crew.studio_controls import continuation_options

    class NeedsDirection(Director):
        async def progress(self, payload):
            if not payload.get('userCorrection'):
                return {'action': 'ask_user', 'reason': 'Choose the arrow direction.', 'correction': ''}
            return {'action': 'continue', 'reason': 'Direction received.', 'correction': 'Use the requested arrow direction.'}

    journal_path = tmp_path / 'provider.jsonl'
    with ProviderJournal(journal_path, max_calls=None, max_grounded_calls=None):
        run = make(tmp_path, monkeypatch, production_limits=effective_limits({}),
                   director=NeedsDirection(), reviewer=Reviewer(images=(False, False)))
        assert asyncio.run(run.run())['status'] == 'blocked'
    options, _ = continuation_options(run.state)
    assert 'image' in options and 'continue' not in options
    before = deepcopy(run.state)
    body = correction_for(run.state)
    run.state = apply_correction(run.state, {'id': 'new-image-direction', 'request': body}, {'limits': effective_limits({})})
    run.save()
    with ProviderJournal(journal_path, max_calls=None, max_grounded_calls=None):
        resumed = make(tmp_path, monkeypatch, client=run.client, production_limits=effective_limits({}),
                       director=NeedsDirection(), reviewer=Reviewer(images=(True,)))
        assert asyncio.run(resumed.run())['status'] == 'ready'
    assert resumed.state['take'] == before['take'] and resumed.client.takes == 1
    assert resumed.state['images']['rocket'][:2] == before['images']['rocket']
    assert resumed.client.calls.count('image_start') == 3


@pytest.mark.parametrize('flag,reason', [('inspectionPossible', 'could not inspect'),
                                       ('requiresNarrationChange', 'recorded narration')])
def test_completed_unusable_image_review_does_not_offer_cached_replay(tmp_path, monkeypatch, flag, reason):
    from vox_crew.studio_controls import continuation_options, validate_resume
    from vox_crew.autonomous_contract import digest
    from vox_crew.studio_store import StudioConflict

    class UnusableReview(Reviewer):
        async def review(self, *args, **kwargs):
            value = await super().review(*args, **kwargs)
            value[flag] = flag == 'requiresNarrationChange'
            return value

    with ProviderJournal(tmp_path / 'provider.jsonl', max_calls=None, max_grounded_calls=None):
        run = make(tmp_path, monkeypatch, production_limits=effective_limits({}),
                   reviewer=UnusableReview(images=(False,)))
        result = asyncio.run(run.run())
    assert result['code'] == 'image_review_requires_action' and reason in result['reason']
    assert run.client.calls.count('image_start') == 1 and run.client.takes == 1
    assert continuation_options(run.state)[0] == []
    with pytest.raises(StudioConflict, match='requires intervention'):
        validate_resume(run.state, {'checkpointSha256': digest(run.state),
                                   'correction': {'target': 'continue', 'instruction': ''}})


def test_confirmed_temporary_error_retries_with_backoff_and_unknown_does_not(tmp_path, monkeypatch):
    from vox_crew.provider_failure import ProviderFailure
    run = make(tmp_path, monkeypatch, production_limits=effective_limits({}))
    attempts, delays = [], []
    async def wait(seconds):
        delays.append(seconds)
    run.wait_for_provider = wait
    async def temporary():
        attempts.append(1)
        if len(attempts) < 4:
            raise ProviderFailure(503)
        return {"saved": True}
    assert asyncio.run(run.step("research", {}, temporary)) == {"saved": True}
    assert delays == [5, 10, 20]
    async def unknown():
        attempts.append(1)
        raise ConnectionError("lost response")
    with pytest.raises(ConnectionError):
        asyncio.run(run.step("research", {"changed": True}, unknown))
    assert len(attempts) == 5 and run.state["pending"] is not None


def test_received_sdk_failure_closes_only_a_confirmed_dispatch(tmp_path):
    from google.genai.errors import ServerError
    from vox_crew.provider_failure import received_error
    with ProviderJournal(tmp_path / "provider.jsonl", max_calls=None, max_grounded_calls=None) as journal:
        journal.begin("ImageCreator", "fixture")
        failure = received_error(ServerError(503, {"error": {"message": "private provider diagnostic"}}))
        assert failure.retryable and not journal.summary()["uncertain"]
        assert "private" not in str(failure)
        journal.begin("ImageCreator", "fixture")
        assert received_error(ConnectionError("response lost")) is None
        assert journal.summary()["uncertain"]


def test_lost_image_response_observes_the_existing_job_without_a_second_dispatch(tmp_path, monkeypatch):
    from vox_crew.image_generation import _purpose_digest
    with ProviderJournal(tmp_path / "provider.jsonl", max_calls=None, max_grounded_calls=None) as journal:
        run = make(tmp_path, monkeypatch, production_limits=effective_limits({}), reviewer=Reviewer(images=(True,)))
        generate = run.client.image_start
        observations = []
        def lost(run_id, request):
            generate(run_id, request)
            run.client.jobs[-1]["id"] = "image-job-" + _purpose_digest("image-job", {
                "identityKey": request["identityKey"], "requestSha256": request["requestSha256"]})[:20]
            raise ConnectionError("response lost after completed generation")
        def observe(run_id, job_id):
            observations.append(job_id)
            return run.client.reply("run.image.status", {"job": run.client.jobs[-1]})
        run.client.image_start, run.client.image_status = lost, observe
        assert asyncio.run(run.run())["status"] == "ready"
        assert run.client.calls.count("image_start") == 1 and len(observations) == 1
        assert not journal.summary()["uncertain"]


def test_stop_request_is_durable_and_clears_only_when_user_resumes(tmp_path):
    from vox_crew.studio_store import StudioStore
    from test_studio import BRIEF
    store = StudioStore(tmp_path)
    job = store.submit("stop-job", {**BRIEF, "limits": effective_limits({})})
    store.claim()
    store.request_stop(job["id"])
    assert StudioStore(tmp_path).stop_requested(job["id"])
    assert store.get(job["id"])["status"] == "running"
    store.transition(job["id"], "running", "blocked")
    store.request_continuation(job["id"], "resume-job-key", {"correction": {"target": "continue"}}, expected_status="blocked")
    assert not store.stop_requested(job["id"])
