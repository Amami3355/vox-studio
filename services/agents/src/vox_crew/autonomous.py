"""Prompt-to-reviewed-film v2. Deterministic gates own all Production commands and budgets."""
from __future__ import annotations

from copy import deepcopy
import inspect
import asyncio
import json
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from .autonomous_contract import digest, merge_dossiers
from .autonomous_roles import compile_intent, inspection_video, retained_image_request
from .crew_contract import Brief, BriefKind, ContractViolation, Narrative, ResearchDossier, VisualBible
from .envelopes import ArtifactDescriptor, parse_envelope
from .hosted import write_json
from .recorded import ClientProductionAdapter


class AutonomousBlocked(RuntimeError):
    pass


class AutonomousRun:
    def __init__(self, client, surface, work: Path, request, *, director, research, creative,
                 planner, reviewer, vocabulary, palettes, language=None, max_searches=4,
                 on_snapshot=None, image_review_hook=None):
        self.client, self.surface, self.work, self.request = client, surface, work, request
        self.director, self.research, self.creative = director, research, creative
        self.planner, self.reviewer = planner, reviewer
        self.vocabulary, self.palettes, self.language = vocabulary, palettes, language
        self.max_searches = min(max_searches, 4)
        self.on_snapshot, self.image_review_hook = on_snapshot, image_review_hook
        self.brief = Brief.from_mapping({**request["brief"], "kind": "factual"})
        from .provider_usage import CURRENT
        journal = CURRENT.get()
        limits = {"maxSearches": self.max_searches, "maxCalls": journal.max_calls if journal else 40,
                  "maxImages": self.brief.max_generated_images}
        self.path = work / "autonomous-v2.json"
        self.state = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {
            "schemaVersion": 2, "originalRequest": deepcopy(request), "language": language, "limits": limits,
            "steps": {}, "pending": None, "phase": "preparation", "searches": [],
            "editorialCorrections": 0, "technicalRepairs": 0, "filmCorrections": 0,
            "images": {}, "events": [], "runId": None, "terminal": None,
        }
        if self.state.get("schemaVersion") != 2 or self.state["originalRequest"] != request or self.state["language"] != language:
            raise AutonomousBlocked("Checkpoint version or original request mismatch; historical Runs are not converted.")
        if self.state.get("limits") != limits:
            raise AutonomousBlocked("The original autonomous ceilings must survive restart unchanged.")
        review_mode = "studio" if image_review_hook else "autonomous"
        if self.path.exists() and self.state.get("imageReviewMode", "autonomous") != review_mode:
            raise AutonomousBlocked("Image review authority must remain unchanged after restart.")
        self.state["imageReviewMode"] = review_mode

    def save(self):
        write_json(self.path, self.state)
        if self.on_snapshot:
            self.on_snapshot(deepcopy(self.state))

    def event(self, phase, status, summary):
        row = {"schemaVersion": 2, "sequence": len(self.state["events"]) + 1,
               "phase": phase, "status": status, "summary": summary}
        self.state["events"].append(row)
        self.save()
        print(json.dumps(row), flush=True)

    async def step(self, name, dependencies, fn):
        identity = digest({"name": name, "dependencies": dependencies})
        old = self.state["steps"].get(identity)
        if old is not None:
            return deepcopy(old["result"])
        if self.state["pending"]:
            raise AutonomousBlocked("An interrupted action requires reconciliation; no action was repeated.")
        self.state["pending"] = {"name": name, "identity": identity, "dependencies": deepcopy(dependencies)}
        self.save()
        result = fn()
        if inspect.isawaitable(result):
            result = await result
        self.state["steps"][identity] = {"name": name, "dependencies": deepcopy(dependencies), "result": result}
        self.state["pending"] = None
        self.save()
        return deepcopy(result)

    def snapshot(self):
        envelope = self.client.status(self.state["runId"])
        if not envelope.succeeded:
            raise AutonomousBlocked("Production status could not be reconciled.")
        return {"stage": envelope.run.stage, "data": envelope.data}

    async def command(self, name, *args, key=None):
        async def send():
            from .provider_usage import CURRENT, finish_call
            journal = CURRENT.get()
            call_id = journal.begin("ImageGeneration" if name == "image_start" else "Recording", "production",
                provider="google-cloud" if name == "image_start" else "elevenlabs") if journal and name in ("image_start", "record") else None
            envelope = getattr(self.client, name)(*args)
            finish_call(call_id)
            if name == "init" and envelope.run:
                self.state["runId"] = envelope.run.id
            if self.state["runId"]:
                self.state["productionSnapshot"] = self.snapshot()
            return json.loads(envelope.raw)
        dependencies = {"args": args, "key": key}
        identity = digest({"name": "production." + name, "dependencies": dependencies})
        if name == "image_start" and identity not in self.state["steps"]:
            policy = self.state.get("productionSnapshot", {}).get("data", {}).get("imageRecoveryPolicy")
            if policy:
                if policy["attemptsUsed"] >= policy["maxImageAttempts"]:
                    raise AutonomousBlocked("The operator-authorized image attempt allowance was exhausted.")
                deadline = datetime.fromisoformat(policy["nextImageDispatchAt"].replace("Z", "+00:00"))
                delay = (deadline - datetime.now(timezone.utc)).total_seconds() + 1
                if delay > 0:
                    self.event("image_generation", "waiting", "Waiting for the operator-authorized image dispatch interval.")
                    await asyncio.sleep(delay)
        raw = await self.step("production." + name, dependencies, send)
        return parse_envelope(json.dumps(raw))

    def require_success(self, envelope):
        if not envelope.succeeded:
            code = envelope.error.code if envelope.error else envelope.outcome
            raise AutonomousBlocked(f"Production stopped: {code}.")
        return envelope

    def context(self):
        return {k: self.state.get(k) for k in ("editorialBrief", "researchDossier", "narrative", "visualBible")}

    async def run(self):
        # Read authority before returning a cached terminal, and before any new provider work.
        if self.state["runId"]:
            observed = self.snapshot()
            if observed != self.state.get("productionSnapshot"):
                write_json(self.work / "reconciliation.json", observed)
                raise AutonomousBlocked("Production changed since the checkpoint; reconciliation is required.")
        if self.state["pending"]:
            raise AutonomousBlocked("An interrupted action requires reconciliation; no implicit new spend.")
        if self.state["terminal"]:
            return self.state["terminal"]
        try:
            if self.state["phase"] == "preparation":
                await self.prepare()
                self.state["phase"] = "production"
                self.save()
            await self.produce()
        except Exception as error:
            # Provider exception messages can contain credentials or internal prompts.
            reason = str(error) if isinstance(error, AutonomousBlocked) else type(error).__name__ + ": inspect operator evidence before resuming."
            self.state["terminal"] = {"status": "blocked", "runId": self.state["runId"], "reason": reason}
            if isinstance(error, ContractViolation):
                self.state["contractDiagnostic"] = {"step": self.state["pending"], "error": str(error)}
            self.event("verification", "blocked", reason)
        self.save()
        return self.state["terminal"]

    async def prepare(self):
        self.state["editorialBrief"] = await self.step("director.interpret",
            {"prompt": self.brief.text, "duration": self.brief.duration_seconds or 50, "language": self.language},
            lambda: self.director.interpret(self.brief.text, self.brief.duration_seconds or 50, self.language))
        # Operator duration/language are constraints, not suggestions for the model.
        self.state["editorialBrief"]["durationSeconds"] = self.brief.duration_seconds or 50
        if self.language:
            self.state["editorialBrief"]["language"] = self.language
        self.save()
        while True:
            if not self.state.get("coverageAccepted"):
                await self.cover_research()
            dossier = ResearchDossier.from_mapping(self.state["researchDossier"])
            self.creative.editorial_context = {"editorialBrief": self.state["editorialBrief"],
                "editorialFeedback": self.state.get("feedback")}
            if not self.state.get("narrative"):
                self.event("narrative", "started", "Writing the complete spoken Beats.")
                value = await self.step("narrative", self.context() | {"revision": self.state["editorialCorrections"]},
                    lambda: self.creative.narrate(self.brief, dossier))
                if "insufficientEvidence" in value:
                    gaps = value["insufficientEvidence"]
                    if not isinstance(gaps, list) or not gaps or any(not isinstance(g, str) or not g.strip() for g in gaps):
                        raise AutonomousBlocked("Narrator returned malformed evidence gaps.")
                    self.state.update(coverageAccepted=False, targetedQuestions=gaps)
                    self.save()
                    continue
                self.state["narrative"] = Narrative.from_mapping(value, dossier).to_mapping()
                self.save()
            narrative = Narrative.from_mapping(self.state["narrative"], dossier)
            narrative_context = {k: self.state[k] for k in ("editorialBrief", "researchDossier", "narrative")}
            decision = await self.step("director.narrative", narrative_context,
                lambda: self.director.judge("narrative", narrative_context))
            if not self.apply_decision(decision, "narrative"):
                continue
            if not self.state.get("visualBible"):
                value = await self.step("art_direction", self.context(),
                    lambda: self.creative.art_direct(self.brief, dossier, self.vocabulary))
                self.state["visualBible"] = VisualBible.from_mapping(value, self.vocabulary).to_mapping()
                self.save()
            if not self.state.get("videoPlan"):
                self.state["videoPlan"] = await self.compose()
                self.save()
            payload = self.context() | {"videoPlan": self.state["videoPlan"],
                "selectedSpecifications": self.selected_specs(self.state["videoPlan"])}
            decision = await self.step("director.composition", payload,
                lambda: self.director.judge("composition", payload))
            if self.apply_decision(decision, "composition"):
                return

    def apply_decision(self, decision, stage):
        action = decision["action"]
        if action == "accept":
            return True
        if action == "stop":
            raise AutonomousBlocked("Director stopped preparation: " + decision["observations"][0]["problem"])
        if action == "composition" and stage == "narrative":
            raise AutonomousBlocked("Director requested composition repair before composition exists.")
        self.state["feedback"] = decision
        if action == "research":
            self.state.update(coverageAccepted=False,
                targetedQuestions=[o["expected"] for o in decision["observations"]])
        else:
            if self.state["editorialCorrections"] >= 2:
                raise AutonomousBlocked("The two shared editorial correction cycles were exhausted.")
            self.state["editorialCorrections"] += 1
            self.state["videoPlan"] = None
            if action == "narrative":
                self.state["narrative"] = None
        self.event("editorial_correction", "started", "Applying the Director's structured observations.")
        return False

    async def cover_research(self):
        while not self.state.get("coverageAccepted"):
            revision = len(self.state["searches"])
            if revision >= self.max_searches:
                raise AutonomousBlocked("Research coverage remains insufficient after the allowed searches; narration is stopped.")
            questions = self.state.get("targetedQuestions") or [self.state["editorialBrief"]["centralQuestion"],
                "Explain the causal mechanism and its necessary qualifications using original sources."]
            sources = [s["url"] for s in self.state.get("researchDossier", {}).get("sources", [])]
            inquiry = questions + (["Follow useful primary sources already discovered: " + " ".join(sources)] if sources else [])
            async def search():
                value = await self.research.research(self.brief, inquiry)
                return {"dossier": ResearchDossier.from_mapping(value).to_mapping(), "evidence": self.research.evidence}
            self.event("research", "started", "Researching the central question and identified coverage gaps.")
            response = await self.step("research", {"revision": revision, "inquiry": inquiry}, search)
            merged, provenance = merge_dossiers(self.state.get("researchDossier"), response["dossier"], revision)
            coverage = await self.step("director.coverage", {"dossier": merged, "revision": revision},
                lambda: self.director.coverage(self.state["editorialBrief"], merged, response["evidence"]))
            self.state["searches"].append({**response, "provenance": provenance, "coverage": coverage})
            self.state.update(researchDossier=merged, coverageAccepted=coverage["adequate"],
                targetedQuestions=coverage["targetedQuestions"], narrative=None, visualBible=None, videoPlan=None)
            self.event("research_coverage", "accepted" if coverage["adequate"] else "correction",
                       "Coverage review recorded with citation provenance.")

    def selected_specs(self, plan):
        from .visual_planner import CatalogProjectionRole
        ids = tuple(dict.fromkeys(s["component"] for section in plan["sections"] for s in section["scenes"]))
        return list(self.planner._catalog.for_role(CatalogProjectionRole.SCENE_AUTHOR, ids))

    async def compose(self, feedback=None):
        dossier = ResearchDossier.from_mapping(self.state["researchDossier"])
        narrative = Narrative.from_mapping(self.state["narrative"], dossier)
        bible = VisualBible.from_mapping(self.state["visualBible"], self.vocabulary)
        async def author():
            self.planner.repairs_spent = self.state["technicalRepairs"]
            try:
                plan = await self.planner.plan(self.brief, dossier, narrative, bible,
                    editorial_context={"editorialBrief": self.state["editorialBrief"]},
                    feedback=feedback or self.state.get("feedback"), reset_repairs=False,
                    checkpoint=self.composition_step)
            finally:
                self.state["technicalRepairs"] = self.planner.repairs_spent
                self.save()
            return {"plan": plan, "technicalRepairs": self.planner.repairs_spent}
        result = await self.step("composition", self.context() | {"feedback": feedback or self.state.get("feedback"),
            "revision": self.state["editorialCorrections"], "filmRevision": self.state["filmCorrections"]}, author)
        self.state["technicalRepairs"] = result["technicalRepairs"]
        expected = [{"id": b.id, "text": b.text} for b in narrative.beats]
        if result["plan"]["beats"] != expected:
            raise AutonomousBlocked("Composition changed spoken Beats; the Take must remain unchanged.")
        return result["plan"]

    async def composition_step(self, name, dependencies, fn):
        identity = digest({"name": name, "dependencies": dependencies})
        steps = self.state.setdefault("compositionSteps", {})
        if identity in steps:
            return deepcopy(steps[identity]["result"])
        if self.state.get("pendingComposition"):
            raise AutonomousBlocked("An interrupted composition role requires reconciliation.")
        self.state["pendingComposition"] = {"name": name, "identity": identity}
        self.save()
        result = await fn()
        steps[identity] = {"name": name, "dependencies": deepcopy(dependencies), "result": result}
        self.state["pendingComposition"] = None
        self.save()
        return deepcopy(result)

    async def repair(self, envelope):
        from .refusals import read_refusal
        from .visual_planner import PlanRefusal, VisualCatalogTools, CatalogProjectionRole, PLAN_REPAIR_BUDGET
        refusal = read_refusal(self.client, self.state["runId"], envelope, self.surface)
        plan = self.state["videoPlan"]
        from .anchor_repair import unique_anchor_repair
        revised = unique_anchor_repair(plan, refusal.report)
        if revised is not None:
            self.state.setdefault("deterministicRepairs", []).append({
                "beforePlanSha256": digest(plan), "afterPlanSha256": digest(revised),
                "report": deepcopy(refusal.report), "source": "production.expected"})
            self.state["videoPlan"] = revised
            self.event("technical_repair", "completed", "Applied the single published word anchor consistent with event order; Production must revalidate it.")
            return
        scenes = [s for section in plan["sections"] for s in section["scenes"]]
        # Exact Production report remains intact. Narrow full specs to named scenes when available.
        encoded = json.dumps(refusal.report)
        affected = [s for s in scenes if json.dumps(s["id"]) in encoded]
        if not affected:
            raise AutonomousBlocked("Production refusal names no repairable scene; explicit preparation is required.")
        ids = tuple(dict.fromkeys(s["component"] for s in affected))
        report = PlanRefusal(tuple({"where": "sceneInstance", "sceneId": s["id"], "report": refusal.report}
            for s in affected), ids, refusal.as_text(), dict(refusal.checks))
        tools = VisualCatalogTools(self.planner._catalog, frozenset(ids), self.planner._validate_scene, self.planner._validate_plan)
        async def fix():
            if self.state["technicalRepairs"] >= PLAN_REPAIR_BUDGET:
                raise AutonomousBlocked("The shared technical PlanRepair budget was exhausted.")
            self.state["technicalRepairs"] += 1
            self.save()
            return await self.planner._repair.repair(plan, report,
                self.planner._catalog.for_role(CatalogProjectionRole.PLAN_REPAIR, ids), tools)
        fills = await self.step("technical_repair", {"plan": plan, "report": refusal.report}, fix)
        from .visual_planner import _retaining
        revised = _retaining(plan, self.planner._assemble(plan, fills, allow_structural_echo=True),
            frozenset(s["id"] for s in affected))
        if revised["beats"] != plan["beats"]:
            raise AutonomousBlocked("Technical repair requires changed narration; recording is stopped.")
        self.state["videoPlan"] = revised
        self.save()

    async def validated_compile(self, key):
        run_id = self.state["runId"]
        while True:
            plan = self.state["videoPlan"]
            if self.state.get("recordedBeats") and plan["beats"] != self.state["recordedBeats"]:
                raise AutonomousBlocked("A recorded film cannot change its spoken Beats.")
            refused = None
            for name, args in (("validate", (run_id, plan)), ("preflight", (run_id,))):
                envelope = await self.command(name, *args, key={"plan": digest(plan), "cycle": key})
                if envelope.outcome == "needs_repair":
                    refused = envelope
                    break
                self.require_success(envelope)
            if refused:
                await self.repair(refused)
                continue
            if not self.state.get("take"):
                envelope = self.require_success(await self.command("record", run_id, key="only-take"))
                self.state["take"] = dict(envelope.data)
                self.state["recordedBeats"] = deepcopy(plan["beats"])
                self.save()
            compiled = await self.command("compile", run_id, key={"plan": digest(plan), "cycle": key,
                "images": digest(self.state["images"])})
            if compiled.outcome == "needs_repair":
                await self.repair(compiled)
                continue
            return self.require_success(compiled)

    async def produce(self):
        if not self.state["runId"]:
            self.require_success(await self.command("init", self.request))
        while True:
            if self.state.get("pendingFilmCorrection"):
                await self.correct_film()
            revision = self.state["filmCorrections"]
            compiled = await self.validated_compile({"film": revision, "phase": "requirements"})
            await self.images(compiled)
            compiled = await self.validated_compile({"film": revision, "phase": "final"})
            if compiled.data.get("assetWorklist"):
                raise AutonomousBlocked("Required image placeholders remain; no final delivery can be rendered.")
            rendered = self.require_success(await self.command("render", self.state["runId"],
                key={"film": revision, "plan": digest(self.state["videoPlan"]), "images": digest(self.state["images"])}))
            descriptor = rendered.artifact("preview")
            if descriptor is None:
                raise AutonomousBlocked("Render returned no inspectable MP4.")
            artifact = self.client.fetch_artifact(self.state["runId"], descriptor)
            light, media = inspection_video(artifact.data, artifact.sha256, self.work / "media")
            timing = compiled.artifact("compiled_document")
            timed_document = self.client.fetch_artifact(self.state["runId"], timing).json() if timing else None
            payload = self.context() | {"videoPlan": self.state["videoPlan"], "media": media,
                "compiledTimingReferences": timed_document,
                "images": self.state["images"], "take": self.state["take"]}
            self.event("film_review", "started", "Inspecting the rendered film with its soundtrack.")
            review = await self.step("film_review", {"sha256": artifact.sha256},
                lambda: self.reviewer.review(light, "video/mp4", media["inspectionSha256"], payload))
            self.state.setdefault("filmReviews", {})[artifact.sha256] = {"media": media, "review": review}
            self.save()
            if not review["inspectionPossible"]:
                raise AutonomousBlocked("Audiovisual inspection was impossible; no correction was purchased.")
            if review["accepted"]:
                self.state["terminal"] = {"status": "reviewed", "runId": self.state["runId"],
                    "preview": descriptor.as_wire(), "reviewedSha256": artifact.sha256,
                    "humanJudgment": "pending"}
                self.event("delivery", "completed", "A byte-bound audiovisual review accepted the film.")
                return
            if review["requiresNarrationChange"]:
                raise AutonomousBlocked("Film review requires changed narration; the existing Take is preserved.")
            if revision >= 1:
                raise AutonomousBlocked("Film remains rejected after its one visual correction cycle.")
            self.state["pendingFilmCorrection"] = {"previousPlan": self.state["videoPlan"], **review}
            self.save()

    async def correct_film(self):
        review = self.state["pendingFilmCorrection"]
        # Only explicitly named bitmap identities are withdrawn. Layout issues name scenes.
        affected = {i for o in review["observations"] for i in o["affectedIds"]}
        for identity, history in self.state["images"].items():
            if identity in affected and history and history[-1].get("accepted"):
                latest = history[-1]
                reason = " ".join(o["problem"] for o in review["observations"] if identity in o["affectedIds"])
                self.require_success(await self.command("image_reject", self.state["runId"],
                    {"protocolVersion": 1, "jobId": latest["job"]["id"],
                     "candidateSha256": latest["job"]["candidate"]["artifact"]["sha256"], "reason": reason}))
                latest.update(accepted=False, review=review)
                self.save()
        self.state["filmCorrections"] = 1
        self.state["videoPlan"] = await self.compose(review)
        self.state["pendingFilmCorrection"] = None
        self.event("film_correction", "started", "Correcting visuals while preserving the original Take.")

    async def images(self, compiled):
        requirements = {r.requirement_id: r for r in ClientProductionAdapter._requirements(self.state["videoPlan"])}
        # Production distinguishes a failed fallback from a pending placeholder. A resumed
        # autonomous film still needs accepted bytes for every authored image requirement.
        # Start with the published pending work, then include failed/omitted requirements.
        ordered = dict.fromkeys([item["requirementId"] for item in compiled.data["assetWorklist"]] + list(requirements))
        for requirement_id in ordered:
            requirement = requirements[requirement_id]
            history = self.state["images"].setdefault(requirement.identity, [])
            while not history or not history[-1].get("accepted"):
                if len(history) >= 3:
                    raise AutonomousBlocked("Image remains rejected after two corrections for this identity.")
                policy = self.state.get('productionSnapshot', {}).get('data', {}).get('imageRecoveryPolicy')
                if policy and policy['attemptsUsed'] >= policy['maxImageAttempts']:
                    reviewed = {row['job']['id'] for row in history}
                    candidates = [(step['result'].get('data') or {}).get('job') for step in self.state['steps'].values()
                        if step['name'] == 'production.image_start']
                    if not any(job and job['status'] == 'candidate' and job['identityKey'] == requirement.identity
                               and job['id'] not in reviewed for job in candidates):
                        raise AutonomousBlocked('The operator-authorized image attempt allowance was exhausted.')
                payload = self.context() | {"requirement": requirement.to_mapping(),
                    "videoPlan": self.state["videoPlan"], "previousCandidates": history}
                intention = await self.step("image_intent", {"identity": requirement.identity, "revision": len(history),
                    "context": payload}, lambda: self.director.image_intent(payload))
                bible = VisualBible.from_mapping(self.state["visualBible"], self.vocabulary)
                request = compile_intent(requirement, intention, bible, self.palettes).production_mapping(requirement)
                request = deepcopy(retained_image_request(request, self.state['steps']))
                envelope = self.require_success(await self.command("image_start", self.state["runId"], request))
                job = envelope.data.get("job")
                while job and job["status"] == "failed" and "HTTP_429;" in (job.get("failure") or ""):
                    policy = self.state.get("productionSnapshot", {}).get("data", {}).get("imageRecoveryPolicy")
                    if not policy:
                        break
                    # Exact same provider bytes, with an explicit predecessor for a new counted attempt.
                    request = {**request, "retryOf": job["id"]}
                    self.event("image_generation", "retry", "Retrying a confirmed HTTP 429 under the separate operator recovery policy.")
                    envelope = self.require_success(await self.command("image_start", self.state["runId"], request))
                    job = envelope.data.get("job")
                if not job or job["status"] != "candidate":
                    detail = f" {job['id']} ({job['status']}): {job.get('failure')}" if job else ""
                    raise AutonomousBlocked("Image call has no inspectable candidate; no unapproved replacement was started." + detail)
                descriptor = ArtifactDescriptor(**job["candidate"]["artifact"])
                artifact = self.client.fetch_artifact(self.state["runId"], descriptor)
                self.event("image_review", "started", "Inspecting verified candidate bytes against their intended uses.")
                review = await self.step("image_review", {"sha256": artifact.sha256, "intention": intention},
                    lambda: self.reviewer.review(artifact.data, "image/png", artifact.sha256,
                        {**payload, "intention": intention, "imageIdentity": requirement.identity}))
                if not review["inspectionPossible"] or review["requiresNarrationChange"]:
                    raise AutonomousBlocked("Image review is impossible or requires changed narration; the Take is preserved.")
                if review["accepted"] and self.image_review_hook:
                    human = await self.image_review_hook(artifact, intention)
                    self.state.setdefault("humanImageReviews", {})[artifact.sha256] = human
                    self.save()
                    if not human["accepted"]:
                        review = {**review, "accepted": False, "observations": [{
                            "problem": human["reason"], "affectedIds": [requirement.identity],
                            "expected": "Address the human image review before delivery.",
                            "startSeconds": 0, "endSeconds": 0}]}
                decision = {"protocolVersion": 1, "jobId": job["id"], "candidateSha256": artifact.sha256}
                if not review["accepted"]:
                    decision["reason"] = " ".join(o["problem"] for o in review["observations"])
                self.require_success(await self.command("image_accept" if review["accepted"] else "image_reject",
                    self.state["runId"], decision))
                history.append({"intention": intention, "request": request, "job": job, "review": review,
                                "accepted": review["accepted"]})
                self.save()
