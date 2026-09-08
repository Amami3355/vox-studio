"""Exercise decisions, paid-command ordering, corrections and restart boundaries without providers."""
import asyncio
from copy import deepcopy
from hashlib import sha256
import json
from types import SimpleNamespace

import pytest

from test_crew import DOSSIER, BIBLE, VOCABULARY
from vox_crew.autonomous import AutonomousRun, AutonomousBlocked
from vox_crew.autonomous_contract import (merge_dossiers, checked, COVERAGE_REVIEW, MEDIA_REVIEW, digest)
from vox_crew.autonomous_entry import prompt_request
from vox_crew.autonomous_roles import MediaReviewer, compile_intent, inspection_video
from vox_crew.client import Artifact
from vox_crew.crew_contract import VisualBible, ContractViolation
from vox_crew.envelopes import parse_envelope
from vox_crew.image_generation import AssetRequirement
from vox_crew.provider_usage import ProviderJournal, ProviderLimit

REQ = {"type": "image", "subject": "Explanatory rocket", "treatment": "illustration",
       "orientation": "landscape", "identityKey": "rocket"}
INTENT = {"meaning": "Upward thrust slows downward travel", "arrangement": "Centered rocket",
          "visibleDetails": ["Downward exhaust"], "plannedCrops": ["Whole rocket"], "rendererElements": ["Arrows"]}
PALETTES = {"editorial-cold": {"accent": "#112233", "ground": "#ffffff"}}
DEFAULTS = {"production": {"voice": {"provider": "elevenlabs", "voiceId": "voice", "modelId": "test"}, "maxNewTakes": 1}}


def observation(ids=("rocket",)):
    return {"problem": "Wrong arrow direction", "affectedIds": list(ids), "expected": "Show upward thrust"}


def media_review(accept=True, narration=False, ids=("rocket",)):
    return {"accepted": accept, "inspectionPossible": True, "assessment": "Fixture inspection of composition and speech.",
            "requiresNarrationChange": narration,
            "observations": [] if accept else [{**observation(ids), "startSeconds": 0, "endSeconds": 1}]}


class Director:
    def __init__(self, coverage=(False, True), decisions=()):
        self.coverages, self.decisions = list(coverage), list(decisions)
    async def interpret(self, prompt, duration, language):
        return {"schemaVersion": 2, "centralQuestion": prompt, "audience": "general", "language": language or "English",
                "angle": "mechanism", "understandingGoals": ["understand thrust"], "durationSeconds": duration}
    async def coverage(self, brief, dossier, evidence):
        accepted = self.coverages.pop(0)
        return checked(COVERAGE_REVIEW, {"adequate": accepted, "centralQuestionAnswered": accepted,
            "mechanismExplained": accepted, "nuancesCovered": accepted, "observations": [] if accepted else [observation()],
            "targetedQuestions": [] if accepted else ["Explain how thrust opposes motion"]})
    async def judge(self, stage, payload):
        return self.decisions.pop(0) if self.decisions else {"action": "accept", "observations": []}
    async def image_intent(self, payload):
        return {**INTENT, "arrangement": "Centered rocket revision " + str(len(payload["previousCandidates"]))}


class Research:
    def __init__(self):
        self.calls, self.evidence = [], {"answerParts": [{"partIndex": 0, "text": "Cited answer"}]}
    async def research(self, brief, inquiry):
        self.calls.append(inquiry)
        return deepcopy(DOSSIER)


class Creative:
    def __init__(self): self.calls = 0
    async def narrate(self, brief, dossier):
        self.calls += 1
        return {"schemaVersion": 1, "angle": "thrust", "hook": "raise curiosity", "beats": [
            {"id": "b1", "text": "Why slow down? Here is how." + (" The correction." if self.calls > 1 else ""),
             "claimIds": [dossier.claims[0].id], "factual": True}]}
    async def art_direct(self, *args): return deepcopy(BIBLE)


class Planner:
    def __init__(self):
        self.repairs_spent = 0
        self._catalog = SimpleNamespace(for_role=lambda *args: [])
    async def plan(self, brief, dossier, narrative, bible, **kwargs):
        return {"beats": [{"id": b.id, "text": b.text} for b in narrative.beats], "sections": [{
            "id": "section", "spansBeats": ["b1"], "scenes": [{"id": "scene", "component": "image_context",
            "spansBeats": ["b1"], "props": {"assetRequirement": REQ}}]}]}


class Reviewer:
    def __init__(self, images=(False, True), films=(True,)):
        self.images, self.films, self.bytes = list(images), list(films), []
    async def review(self, data, mime, expected, context):
        assert sha256(data).hexdigest() == expected
        self.bytes.append((data, mime))
        value = (self.images if mime == "image/png" else self.films).pop(0)
        return media_review(value) if isinstance(value, bool) else value


class Client:
    def __init__(self):
        self.calls, self.jobs, self.artifacts = [], [], {}
        self.stage, self.takes = "initialized", 0
    def reply(self, command, data=None, artifacts=()):
        return parse_envelope(json.dumps({"protocolVersion": 1, "command": command, "outcome": "succeeded",
            "run": {"id": "run-1", "stage": self.stage}, "data": data or {}, "artifacts": list(artifacts), "error": None, "next": []}))
    def init(self, request): self.calls.append("init"); return self.reply("run.init")
    def status(self, _): return self.reply("run.status", {"jobs": self.jobs, "takes": self.takes})
    def validate(self, _, plan): self.calls.append("validate"); self.plan = deepcopy(plan); return self.reply("run.validate")
    def preflight(self, _): self.calls.append("preflight"); return self.reply("run.preflight")
    def record(self, _):
        self.calls.append("record"); self.takes += 1
        return self.reply("run.record", {"takeId": "take-1", "newTakesUsed": self.takes, "maxNewTakes": 1})
    def compile(self, _):
        self.calls.append("compile")
        missing = not self.jobs or self.jobs[-1]["status"] != "accepted"
        return self.reply("run.compile", {"assetWorklist": [{"requirementId": AssetRequirement.from_mapping(REQ).requirement_id}] if missing else []})
    def image_start(self, _, request):
        self.calls.append("image_start")
        data = b"fixture image " + str(len(self.jobs)).encode()
        descriptor = self.artifact("generated_image_candidate", data)
        job = {"id": "job-" + str(len(self.jobs)), "status": "candidate", "candidate": {"artifact": descriptor},
               "identityKey": request["identityKey"], "requestSha256": request["requestSha256"]}
        self.jobs.append(job)
        return self.reply("run.image.start", {"job": job}, [descriptor])
    def image_accept(self, _, decision):
        self.calls.append("image_accept"); self.jobs[-1]["status"] = "accepted"
        return self.reply("run.image.accept", {"job": self.jobs[-1]})
    def image_reject(self, _, decision):
        self.calls.append("image_reject"); self.jobs[-1]["status"] = "rejected"
        return self.reply("run.image.reject", {"job": self.jobs[-1]})
    def artifact(self, kind, data):
        key = sha256(data).hexdigest(); self.artifacts[key] = Artifact(kind, key, data)
        return {"kind": kind, "path": key, "sha256": key}
    def render(self, _):
        self.calls.append("render")
        return self.reply("run.render", artifacts=[self.artifact("preview", b"movie " + str(self.calls.count("render")).encode())])
    def fetch_artifact(self, _, descriptor): return self.artifacts[descriptor.sha256]


def make(tmp_path, monkeypatch, **options):
    monkeypatch.setattr("vox_crew.autonomous.inspection_video", lambda data, sha, path: (data,
        {"originalSha256": sha, "inspectionSha256": sha, "durationSeconds": 50, "fullyDecoded": True}))
    return AutonomousRun(options.pop("client", Client()), None, tmp_path,
        prompt_request("Why does a rocket slow down?", DEFAULTS, submission_id="test"),
        director=options.pop("director", Director()), research=Research(), creative=Creative(), planner=Planner(),
        reviewer=options.pop("reviewer", Reviewer()), vocabulary=VOCABULARY, palettes=PALETTES, **options)


def test_targeted_coverage_then_reject_image_correct_same_identity_and_render(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch)
    with ProviderJournal(tmp_path / "provider.jsonl") as journal:
        assert asyncio.run(run.run())["status"] == "reviewed"
    assert len(run.research.calls) == 2
    assert "Explain how thrust opposes motion" in run.research.calls[1]
    assert run.client.calls.index("image_accept") < run.client.calls.index("render")
    assert run.client.takes == 1
    assert {j["identityKey"] for j in run.client.jobs} == {"rocket"}
    assert len({j["requestSha256"] for j in run.client.jobs}) == 2
    assert len([r for r in journal.records if r["status"] == "dispatched"]) == 3
    assert run.state["searches"][0]["provenance"][0]["claimId"] in run.state["narrative"]["beats"][0]["claimIds"]


def test_four_inadequate_searches_stop_before_narration(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch, director=Director((False,) * 4))
    assert asyncio.run(run.run())["status"] == "blocked"
    assert len(run.research.calls) == 4
    assert run.creative.calls == 0 and not run.client.calls


@pytest.mark.parametrize("problem", ["Unsupported narration", "Opening hook absent from beats"])
def test_narrative_observations_return_to_narrator_before_recording(tmp_path, monkeypatch, problem):
    run = make(tmp_path, monkeypatch, director=Director((True,), [
        {"action": "narrative", "observations": [{**observation(), "problem": problem}]},
        {"action": "accept", "observations": []}]))
    assert asyncio.run(run.run())["status"] == "reviewed"
    assert run.creative.calls == 2 and run.state["editorialCorrections"] == 1


def test_visual_film_correction_preserves_take_and_withdraws_exact_image(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch, reviewer=Reviewer(images=(True, True), films=(False, True)))
    assert asyncio.run(run.run())["status"] == "reviewed"
    assert run.client.takes == 1 and run.client.calls.count("render") == 2
    assert run.client.jobs[0]["status"] == "rejected"
    assert run.state["filmCorrections"] == 1
    assert run.state["recordedBeats"] == run.state["videoPlan"]["beats"]


def test_film_needing_new_speech_blocks_without_extra_take(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch, reviewer=Reviewer(images=(True,), films=(media_review(False, True),)))
    result = asyncio.run(run.run())
    assert result["status"] == "blocked" and "narration" in result["reason"]
    assert run.client.takes == 1 and run.client.calls.count("render") == 1


def test_completed_restart_spends_nothing_and_changed_production_blocks(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch)
    first = asyncio.run(run.run()); calls = list(run.client.calls)
    resumed = make(tmp_path, monkeypatch, client=run.client)
    assert asyncio.run(resumed.run()) == first
    assert run.client.calls == calls and not resumed.research.calls
    run.client.takes = 2
    with pytest.raises(AutonomousBlocked, match="Production changed"):
        asyncio.run(resumed.run())


def test_interruption_never_repeats_action(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch)
    def interrupted(): raise ConnectionError("uncertain")
    with pytest.raises(ConnectionError): asyncio.run(run.step("paid", {}, interrupted))
    resumed = make(tmp_path, monkeypatch)
    with pytest.raises(AutonomousBlocked, match="interrupted"):
        asyncio.run(resumed.run())
    assert not resumed.client.calls and not resumed.research.calls


def test_journal_ceiling_survives_reconstruction(tmp_path):
    from vox_crew.provider_usage import finish_call
    path = tmp_path / "journal.jsonl"
    with ProviderJournal(path, max_calls=1) as journal:
        finish_call(journal.begin("Recording", "production", provider="elevenlabs"))
    with ProviderJournal(path, max_calls=1) as journal:
        with pytest.raises(ProviderLimit): journal.begin("Director", "model")


def test_dossier_merge_never_promotes_uncited_answer_and_keeps_ids():
    first, provenance = merge_dossiers(None, DOSSIER, 0)
    second, again = merge_dossiers(first, DOSSIER, 1)
    assert first == second and provenance[0]["claimId"] == again[0]["claimId"]
    assert again[0]["searchRevision"] == 1


def test_media_reviewer_receives_exact_fixture_bytes_and_rejects_digest_mismatch():
    response = SimpleNamespace(text=json.dumps(media_review()), usage_metadata=None)
    observed = []
    async def generate(**kwargs): observed.append(kwargs); return response
    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    reviewer = MediaReviewer(client_factory=lambda: client)
    data = b"fixture media"
    context = {'beats': [{'id': 'b1', 'start': 0, 'end': 1}], 'asset': {'uri': 'data:image/png;base64,' + 'A' * 3_500_000}}
    asyncio.run(reviewer.review(data, "video/mp4", sha256(data).hexdigest(), context))
    assert observed[0]["contents"][-1].inline_data.data == data
    assert observed[0]["contents"][-1].inline_data.mime_type == "video/mp4"
    projected = json.loads(observed[0]['contents'][1])
    assert projected['beats'] == context['beats']
    assert len(observed[0]['contents'][1]) < 1000
    assert projected['asset']['uri']['embeddedAssetUriSha256'] == sha256(context['asset']['uri'].encode()).hexdigest()
    assert len(context['asset']['uri']) > 3_500_000
    with pytest.raises(ContractViolation): asyncio.run(reviewer.review(data, "video/mp4", "0" * 64, {}))
    assert len(observed) == 1


@pytest.mark.parametrize('code', [400, 429, None])
def test_media_reviewer_retains_http_failure_evidence_but_transport_stays_uncertain(tmp_path, code):
    from google.genai.errors import ClientError
    async def generate(**kwargs):
        if code: raise ClientError(code, {'message': 'private provider message and credential'})
        raise TimeoutError('private transport endpoint')
    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    reviewer = MediaReviewer(client_factory=lambda: client)
    with ProviderJournal(tmp_path / 'journal.jsonl') as journal:
        with pytest.raises(Exception):
            asyncio.run(reviewer.review(b'film', 'video/mp4', sha256(b'film').hexdigest(), {}))
    assert len(journal.records) == (2 if code else 1)
    if code:
        assert journal.records[-1]['status'] == 'responded'
        assert journal.records[-1]['providerHttpStatus'] == code
    assert 'private' not in journal.path.read_text()


def test_real_ffmpeg_fixture_has_audio_and_full_decode(tmp_path):
    import shutil, subprocess
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg unavailable")
    path = tmp_path / "fixture.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "1", "-c:v", "libx264",
        "-c:a", "aac", str(path)], check=True)
    data = path.read_bytes()
    light, evidence = inspection_video(data, sha256(data).hexdigest(), tmp_path / "inspection")
    assert evidence["fullyDecoded"] and evidence["inspectionSha256"] == sha256(light).hexdigest()
    assert {s["codec_type"] for s in evidence["streams"]} == {"audio", "video"}


def test_director_invalid_response_retains_only_declared_public_fields(tmp_path):
    from vox_crew.autonomous_roles import AutonomousDirector
    from vox_crew.autonomous_contract import COVERAGE_REVIEW
    async def ask(*args):
        return {"adequate": "invalid", "privateReasoning": "must not persist"}
    role = SimpleNamespace(name="Director", ask=ask)
    director = AutonomousDirector(output_directory=tmp_path)
    with pytest.raises(ContractViolation):
        asyncio.run(director._ask(COVERAGE_REVIEW, "Judge coverage", {}, role))
    evidence = json.loads(next(tmp_path.glob("Director-*.json")).read_text())
    assert evidence == {"response": {"adequate": "invalid"}, "unexpectedFields": ["privateReasoning"]}
    assert role.answer_schema is COVERAGE_REVIEW


def test_contract_failure_records_diagnostic_without_repeating_call(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch)
    async def invalid(*args):
        raise ContractViolation("Coverage verdict is inconsistent")
    run.director.coverage = invalid
    assert asyncio.run(run.run())["status"] == "blocked"
    assert run.state["contractDiagnostic"]["error"] == "Coverage verdict is inconsistent"
    assert run.state["contractDiagnostic"]["step"]["name"] == "director.coverage"
    assert len(run.research.calls) == 1 and not run.client.calls


def test_v2_structural_echo_is_only_normalized_when_exact():
    from vox_crew.visual_planner import SplitVisualPlanner
    from test_visual_planner import structure
    slots = structure()
    fills = {"scenes": [{**s, "props": {}} for section in slots["sections"] for s in section["scenes"]]}
    with pytest.raises(ContractViolation, match="unknown fields"):
        SplitVisualPlanner._assemble(slots, fills)
    plan = SplitVisualPlanner._assemble(slots, fills, allow_structural_echo=True)
    assert plan["beats"] == slots["beats"]
    assert plan["sections"][0]["scenes"][0] == fills["scenes"][0]
    fills["scenes"][0]["component"] = "unauthorized_reselection"
    with pytest.raises(ContractViolation, match="immutable structure"):
        SplitVisualPlanner._assemble(slots, fills, allow_structural_echo=True)


def test_composition_role_result_is_cached_and_pending_role_blocks(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch)
    calls = []
    async def turn():
        calls.append(True)
        return {"scenes": []}
    first = asyncio.run(run.composition_step("scene_author", {}, turn))
    resumed = make(tmp_path, monkeypatch)
    assert asyncio.run(resumed.composition_step("scene_author", {}, turn)) == first
    assert calls == [True]
    resumed.state["pendingComposition"] = {"name": "uncertain"}
    with pytest.raises(AutonomousBlocked, match="interrupted composition"):
        asyncio.run(resumed.composition_step("scene_author", {"revision": 1}, turn))


def test_failed_composition_keeps_consumed_technical_repair(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch, director=Director((True,)))
    async def fail(*args, **kwargs):
        run.planner.repairs_spent = 1
        raise ContractViolation("Scene fill failed after a repair response")
    run.planner.plan = fail
    assert asyncio.run(run.run())["status"] == "blocked"
    assert json.loads(run.path.read_text())["technicalRepairs"] == 1


@pytest.mark.parametrize("changed_structure", [False, True])
def test_production_repair_persists_response_and_spend_before_assembly(tmp_path, monkeypatch, changed_structure):
    from vox_crew.visual_planner import SplitVisualPlanner
    from test_visual_planner import structure
    run = make(tmp_path, monkeypatch)
    plan = structure()
    plan["sections"][0]["scenes"][0]["props"] = {}
    run.state.update(runId="run-1", videoPlan=plan)
    report = {"errors": [{"sceneId": "claim", "code": "DEICTIC_ANCHOR_REQUIRED"}]}
    monkeypatch.setattr("vox_crew.refusals.read_refusal", lambda *args: SimpleNamespace(
        report=report, checks={}, as_text=lambda: "A named event anchor needs repair"))
    calls = []
    async def repair(*args):
        calls.append(True)
        fills = {"scenes": deepcopy(plan["sections"][0]["scenes"])}
        if changed_structure: fills["scenes"][0]["component"] = "forbidden"
        return fills
    run.planner._repair = SimpleNamespace(repair=repair)
    run.planner._assemble = SplitVisualPlanner._assemble
    run.planner._validate_scene = run.planner._validate_plan = lambda value: {}
    for _ in range(2):
        if changed_structure:
            with pytest.raises(ContractViolation, match="immutable structure"):
                asyncio.run(run.repair(None))
        else:
            asyncio.run(run.repair(None))
        assert run.state["pending"] is None
        assert run.state["technicalRepairs"] == 1
        assert calls == [True]
        assert run.state["steps"]


def test_adk_dispatch_receipt_preserves_public_response_without_thought_parts(tmp_path, monkeypatch):
    from vox_crew.adk_roles import AdkJsonRole
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "fixture-project")
    with ProviderJournal(tmp_path / "journal.jsonl") as journal:
        agent = AdkJsonRole("Director", "fixture").agent("Return JSON")
        agent.before_model_callback(None, SimpleNamespace(model_dump_json=lambda **kwargs: "{}"))
        agent.after_model_callback(None, SimpleNamespace(usage_metadata=None, content=SimpleNamespace(parts=[
            SimpleNamespace(text="private thought must not persist", thought=True),
            SimpleNamespace(text='{"action":"accept","observations":[]}', thought=False)])))
    assert journal.records[-1]["answerParts"] == [{"partIndex": 1, "text": '{"action":"accept","observations":[]}'}]
    assert "private thought" not in journal.path.read_text()


@pytest.mark.parametrize("previous, corrected", [("path", True), ("travel", False)])
def test_unique_published_anchor_repair_preserves_order_and_model_allowance(tmp_path, monkeypatch, previous, corrected):
    run = make(tmp_path, monkeypatch)
    plan = {"beats": [{"id": "b1", "text": "We travel a longer path."}], "sections": [{
        "id": "s", "spansBeats": ["b1"], "scenes": [{"id": "view", "component": "image_context",
        "spansBeats": ["b1"], "props": {}, "events": [
            {"action": "revealCopy", "at": "b1.word:" + previous},
            {"action": "emphasize", "at": "b1.word:travel", "payload": {"text": "longer path"}}]}]}]}
    report = {"errors": [{"code": "DEICTIC_ANCHOR_REQUIRED", "sectionId": "s", "sceneId": "view",
        "field": "events[1].at", "expected": ["b1.word:longer", "b1.word:path"]}]}
    run.state.update(runId="run-1", videoPlan=deepcopy(plan), technicalRepairs=1)
    monkeypatch.setattr("vox_crew.refusals.read_refusal", lambda *args: SimpleNamespace(
        report=report, checks={}, as_text=lambda: "Point at the published word"))
    run.planner._validate_scene = run.planner._validate_plan = lambda value: {}
    if corrected:
        asyncio.run(run.repair(None))
        expected = deepcopy(plan)
        expected["sections"][0]["scenes"][0]["events"][1]["at"] = "b1.word:path"
        assert run.state["videoPlan"] == expected
        saved = json.loads(run.path.read_text())
        assert saved["deterministicRepairs"][0]["beforePlanSha256"] == digest(plan)
        assert saved["deterministicRepairs"][0]["afterPlanSha256"] == digest(expected)
        assert saved["deterministicRepairs"][0]["report"] == report
    else:
        with pytest.raises(AutonomousBlocked, match="budget was exhausted"):
            asyncio.run(run.repair(None))
        assert run.state["videoPlan"] == plan
    assert run.state["technicalRepairs"] == 1
    assert not run.client.calls


@pytest.mark.parametrize('approved, failure_status', [(True, 'failed'), (False, 'failed'), (True, 'uncertain')])
def test_recovery_retries_only_explicitly_approved_429_and_preserves_voice_and_spend(tmp_path, monkeypatch, approved, failure_status):
    class RecoveringClient(Client):
        def status(self, run_id):
            data = {'jobs': self.jobs, 'takes': self.takes}
            if approved:
                data['imageRecoveryPolicy'] = {'maxImageAttempts': 8, 'attemptsUsed': len(self.jobs),
                    'nextImageDispatchAt': '2026-01-01T00:00:00Z'}
            return self.reply('run.status', data)
        def image_start(self, run_id, request):
            if not self.jobs:
                self.calls.append('image_start')
                self.original_request = deepcopy(request)
                job = {'id': 'failed-429', 'status': failure_status, 'candidate': None,
                    'failure': 'Image provider returned HTTP_429; no retry was started.'}
                self.jobs.append(job)
                return self.reply('run.image.start', {'job': job})
            assert request == {**self.original_request, 'retryOf': 'failed-429'}
            return super().image_start(run_id, request)
    client = RecoveringClient()
    run = make(tmp_path, monkeypatch, client=client, reviewer=Reviewer(images=(True,)))
    with ProviderJournal(tmp_path / 'journal.jsonl') as journal:
        result = asyncio.run(run.run())
    allowed = approved and failure_status == 'failed'
    assert result['status'] == ('reviewed' if allowed else 'blocked')
    assert client.takes == 1 and client.calls.count('image_start') == (2 if allowed else 1)
    assert client.jobs[0]['status'] == failure_status
    assert len([row for row in journal.records if row['status'] == 'dispatched']) == (3 if allowed else 2)
    assert run.state['limits']['maxImages'] == 5
    if allowed:
        before = list(client.calls)
        resumed = make(tmp_path, monkeypatch, client=client)
        assert asyncio.run(resumed.run()) == result and client.calls == before


def test_recovery_ceiling_stops_before_another_dispatch(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch)
    run.state['productionSnapshot'] = {'data': {'imageRecoveryPolicy': {
        'maxImageAttempts': 8, 'attemptsUsed': 8, 'nextImageDispatchAt': '2026-01-01T00:00:00Z'}}}
    with ProviderJournal(tmp_path / 'journal.jsonl') as journal:
        with pytest.raises(AutonomousBlocked, match='allowance was exhausted'):
            asyncio.run(run.command('image_start', 'run', {}))
        assert not journal.records
    assert not run.client.calls and run.state['pending'] is None


def test_historical_request_retains_bytes_when_checkpoint_reorders_intention_keys():
    from vox_crew.autonomous_roles import retained_image_request
    old = {'identityKey': 'image', 'requirementId': 'req', 'aspectRatio': '16:9', 'outputMimeType': 'image/png',
        'prompt': 'base\nVOX_COMPOSITION_INTENT_V2\n{"b":2,"a":1}\nfooter', 'requestSha256': 'old', 'seed': 1}
    new = {**old, 'prompt': 'base\nVOX_COMPOSITION_INTENT_V2\n{"a":1,"b":2}\nfooter', 'requestSha256': 'new', 'seed': 2}
    steps = {'original': {'name': 'production.image_start', 'dependencies': {'args': ['run', old]},
        'result': {'data': {'job': {'id': 'job'}}}}}
    assert retained_image_request(new, steps) == old
    changed = {**new, 'prompt': new['prompt'].replace('"b":2', '"b":3')}
    assert retained_image_request(changed, steps) == changed


def test_image_ceiling_stops_before_buying_an_unusable_new_intention(tmp_path, monkeypatch):
    run = make(tmp_path, monkeypatch)
    run.state['videoPlan'] = {'sections': [{'scenes': [{'props': {'assetRequirement': REQ}}]}]}
    run.state['productionSnapshot'] = {'data': {'imageRecoveryPolicy': {'attemptsUsed': 8, 'maxImageAttempts': 8}}}
    async def forbidden(_): raise AssertionError('No new image intention should be purchased.')
    run.director.image_intent = forbidden
    compiled = SimpleNamespace(data={'assetWorklist': [{'requirementId': AssetRequirement.from_mapping(REQ).requirement_id}]})
    with pytest.raises(AutonomousBlocked, match='allowance was exhausted'):
        asyncio.run(run.images(compiled))
    assert not run.client.calls


def test_resumed_recovery_includes_failed_images_omitted_from_placeholder_worklist(tmp_path, monkeypatch):
    class ClientWithFailedFallback(Client):
        approved = False
        def status(self, run_id):
            data = {'jobs': self.jobs, 'takes': self.takes}
            if self.approved:
                data['imageRecoveryPolicy'] = {'maxImageAttempts': 8, 'attemptsUsed': len(self.jobs),
                    'nextImageDispatchAt': '2026-01-01T00:00:00Z'}
            return self.reply('run.status', data)
        def compile(self, run_id):
            if self.jobs and self.jobs[-1]['status'] == 'failed':
                self.calls.append('compile')
                return self.reply('run.compile', {'assetWorklist': []})
            return super().compile(run_id)
        def image_start(self, run_id, request):
            if not self.jobs:
                self.calls.append('image_start')
                self.original_request = deepcopy(request)
                self.jobs.append({'id': '429', 'status': 'failed', 'candidate': None,
                    'failure': 'Image provider returned HTTP_429; no retry was started.'})
                return self.reply('run.image.start', {'job': self.jobs[-1]})
            assert request == {**self.original_request, 'retryOf': '429'}
            return super().image_start(run_id, request)
    client = ClientWithFailedFallback()
    run = make(tmp_path, monkeypatch, client=client, reviewer=Reviewer(images=(True,)))
    assert asyncio.run(run.run())['status'] == 'blocked'
    # Simulate the separately tested operator policy reconciliation; preserve every cached step.
    client.approved = True
    run.state['terminal'] = None
    run.state['productionSnapshot'] = run.snapshot()
    run.save()
    run = make(tmp_path, monkeypatch, client=client, reviewer=Reviewer(images=(True,)))
    assert asyncio.run(run.run())['status'] == 'reviewed'
    assert client.calls.count('image_start') == 2
    assert client.jobs[-1]['status'] == 'accepted' and client.takes == 1
