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
from .autonomous_roles import ImageIntentViolation, compile_intent, inspection_video, retained_image_request, verify_rendered_video
from .crew_contract import Brief, BriefKind, ContractViolation, Narrative, ResearchDossier, VisualBible
from .envelopes import ArtifactDescriptor, parse_envelope
from .hosted import write_json
from .recorded import ClientProductionAdapter
from .model_recovery import (RECOVERY, RESPONSE_RECOVERY_VERSION, ModelResponseInvalid,
                             ModelRecoveryExhausted, ModelRecoveryStalled, completed_model_calls)
from .model_output import recovery_output_tokens


MODEL_STEPS = frozenset({"director.interpret", "director.coverage", "director.narrative",
    "director.composition", "narrative", "art_direction", "image_intent", "image_review", "film_review",
    "technical_repair", "progress"})


class AutonomousBlocked(RuntimeError):
    pass


class AutonomousLimit(AutonomousBlocked):
    pass


class ImageReviewNeedsAction(AutonomousBlocked):
    """A completed review cannot be resolved by replaying its cached answer."""


class AutonomousRun:
    def __init__(self, client, surface, work: Path, request, *, director, research, creative,
                 planner, reviewer, vocabulary, palettes, language=None, max_searches=4,
                 on_snapshot=None, image_review_hook=None, production_limits=None, stop_requested=None):
        self.client, self.surface, self.work, self.request = client, surface, work, request
        self.director, self.research, self.creative = director, research, creative
        self.planner, self.reviewer = planner, reviewer
        self.vocabulary, self.palettes, self.language = vocabulary, palettes, language
        self.max_searches = production_limits["maxSearches"] if production_limits else min(max_searches, 4)
        self.production_limits = production_limits
        self.stop_requested = stop_requested
        self.on_snapshot, self.image_review_hook = on_snapshot, image_review_hook
        brief = {**request["brief"], "kind": "factual"}
        if production_limits:
            brief.pop("maxGeneratedImages", None)
            if production_limits["maxImages"] is not None:
                brief["maxGeneratedImages"] = production_limits["maxImages"]
        self.brief = Brief.from_mapping(brief)
        from .provider_usage import CURRENT
        journal = CURRENT.get()
        self.journal = journal
        limits = {"maxSearches": self.max_searches, "maxCalls": journal.max_calls if journal else 40,
                  "maxImages": production_limits["maxImages"] if production_limits else self.brief.max_generated_images}
        self.path = work / "autonomous-v2.json"
        self.state = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {
            "schemaVersion": 2, "originalRequest": deepcopy(request), "language": language, "limits": limits,
            "steps": {}, "pending": None, "phase": "preparation", "searches": [],
            "editorialCorrections": 0, "technicalRepairs": 0, "filmCorrections": 0,
            "images": {}, "events": [], "runId": None, "terminal": None,
        }
        if self.state.get("schemaVersion") != 2 or self.state["originalRequest"] != request or self.state["language"] != language:
            raise AutonomousBlocked("Checkpoint version or original request mismatch; historical Runs are not converted.")
        if production_limits and all(value is None for value in production_limits.values()):
            self.state["limits"] = limits
        if self.state.get("limits") != limits:
            raise AutonomousBlocked("The original autonomous ceilings must survive restart unchanged.")
        review_mode = ("studio_automatic" if production_limits and all(v is None for v in production_limits.values())
                       else "studio" if image_review_hook else "autonomous")
        if self.path.exists() and review_mode != "studio_automatic" and self.state.get("imageReviewMode", "autonomous") != review_mode:
            raise AutonomousBlocked("Image review authority must remain unchanged after restart.")
        self.state["imageReviewMode"] = review_mode
        if production_limits and not self.path.exists():
            self.state["requestedLimits"] = deepcopy(production_limits)

    def save(self):
        from .provider_usage import CURRENT, merge_usage
        journal = self.journal if getattr(self, "coordinating_images", False) else self.journal or CURRENT.get()
        if journal or self.state.get("imagePipelines"):
            self.state["providerUsage"] = merge_usage([
                journal.summary() if journal else {},
                *(pipeline.get("usage", {}) for pipeline in self.state.get("imagePipelines", {}).values())])
        self.state["savedAt"] = datetime.now(timezone.utc).isoformat()
        write_json(self.path, self.state)
        if self.on_snapshot:
            self.on_snapshot(deepcopy(self.state))

    def event(self, phase, status, summary):
        row = {"schemaVersion": 2, "sequence": len(self.state["events"]) + 1,
               "phase": phase, "status": status, "summary": summary,
               "observedAt": datetime.now(timezone.utc).isoformat()}
        self.state["events"].append(row)
        self.save()
        print(json.dumps(row), flush=True)

    def check_stop(self):
        from .provider_usage import ProviderStopped
        if self.stop_requested and self.stop_requested():
            raise ProviderStopped("Stopped after the current operation. Your completed work is saved.")

    @staticmethod
    def work_dependencies(name, dependencies):
        value = deepcopy(dependencies)
        if name == "image_intent":
            correction = value.get("context", {}).get("userCorrection")
            if correction:
                correction.pop("id", None)
        return value

    async def step(self, name, dependencies, fn):
        dependencies = self.work_dependencies(name, dependencies)
        identity = digest({"name": name, "dependencies": dependencies})
        old = self.state["steps"].get(identity)
        if old is None and name == "image_intent":
            # Reuse preparations written before decision IDs were excluded from work identity.
            old = next((row for row in reversed(list(self.state["steps"].values()))
                        if row["name"] == name and self.work_dependencies(name, row["dependencies"]) == dependencies), None)
        if old is not None:
            return deepcopy(old["result"])
        self.check_stop()
        if self.state["pending"]:
            raise AutonomousBlocked("An interrupted action requires reconciliation; no action was repeated.")
        self.state["pending"] = {"name": name, "identity": identity, "dependencies": deepcopy(dependencies)}
        self.save()
        try:
            result = await self.model_step(name, fn) if name in MODEL_STEPS else await self.provider_operation(name, fn)
        except Exception as error:
            from .provider_usage import ProviderLimit, CURRENT
            if isinstance(error, (ProviderLimit, AutonomousLimit)) and (not CURRENT.get() or not CURRENT.get().summary()["uncertain"]):
                # A refused dispatch never happened. Preserve its dependency record in history.
                self.state.setdefault("refusedDispatches", []).append(deepcopy(self.state["pending"]))
                self.state["pending"] = None
                self.state["pendingComposition"] = None
                self.save()
            raise
        self.state["steps"][identity] = {"name": name, "dependencies": deepcopy(dependencies), "result": result}
        self.state["pending"] = None
        self.save()
        return deepcopy(result)

    @staticmethod
    async def invoke(fn):
        result = fn()
        return await result if inspect.isawaitable(result) else result

    async def invoke_limited(self, name, fn):
        capacity = getattr(self, "capacities", {}).get(name)
        if capacity is None:
            return await self.invoke(fn)
        async with capacity:
            self.check_stop()
            return await self.invoke(fn)

    async def provider_operation(self, name, fn):
        from .provider_failure import ProviderFailure
        from .provider_usage import CURRENT
        attempt = 0
        while True:
            self.check_stop()
            try:
                result = await self.invoke_limited(name, fn)
                self.state.pop("providerRetry", None)
                return result
            except ProviderFailure as error:
                if not error.retryable or (CURRENT.get() and CURRENT.get().summary()["uncertain"]):
                    raise
                attempt += 1
                delay = min(300, 5 * 2 ** min(attempt - 1, 6))
                self.state["providerRetry"] = {"step": name, "httpStatus": error.status,
                    "retryAt": datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + delay, timezone.utc).isoformat()}
                self.event(self.model_phase(name), "waiting",
                    f"The provider returned HTTP {error.status}. Retrying in {delay} seconds. You can stop production.")
                await self.wait_for_provider(delay)

    async def check_progress(self, stage, history, **context):
        decision = await self.step("progress", {"stage": stage, "history": history, **context},
            lambda: self.director.progress({"stage": stage, "history": history, **self.context(), **context}))
        self.state.setdefault("progressReviews", []).append({"stage": stage, **decision})
        self.save()
        if decision["action"] != "continue" or not decision["correction"].strip():
            raise AutonomousBlocked(decision["reason"])
        return decision["correction"]

    def reserve_repair(self, *, response_recovery=True):
        from .provider_usage import CURRENT
        if CURRENT.get():
            CURRENT.get().check_available()
        spent = max(self.state["technicalRepairs"], self.planner.repairs_spent)
        if self.exhausted("maxTechnicalRepairs", spent, getattr(self.planner, "_repair_budget", 1)):
            if not response_recovery:
                raise AutonomousLimit("The shared technical PlanRepair budget was exhausted.")
            raise ModelRecoveryExhausted("The technical response recovery allowance was exhausted.")
        self.state["technicalRepairs"] = self.planner.repairs_spent = spent + 1
        # Reserve durably BEFORE another attempt, including a crash during that attempt.
        self.save()

    async def model_step(self, name, fn):
        from .provider_usage import CURRENT
        journal = CURRENT.get()
        saved_recovery = self.state.get("pendingModelRecovery")
        recovery = saved_recovery["context"] if saved_recovery and saved_recovery["step"] == name else None
        if recovery or name in ("plan_repair", "technical_repair"):
            self.reserve_repair(response_recovery=bool(recovery))
        while True:
            since = len(journal.records) if journal else 0
            token = RECOVERY.set(recovery)
            try:
                result = await self.provider_operation(name, fn)
                if (self.state.get("pendingModelRecovery") or {}).get("step") == name:
                    self.state.pop("pendingModelRecovery")
                return result
            except ContractViolation as error:
                evidence = completed_model_calls(journal, since)
                if not evidence or isinstance(error, ModelRecoveryExhausted):
                    raise
                self.state.setdefault("modelResponseFailures", []).append({"step": name,
                    "pending": deepcopy(self.state.get("pending")),
                    "pendingComposition": deepcopy(self.state.get("pendingComposition")),
                    "calls": evidence, "diagnostic": str(error)})
                truncated = any(row["finishReason"] == "MAX_TOKENS" for row in evidence)
                # Missing historical finish reasons cannot prove truncation; malformed JSON
                # still gets bounded headroom. A valid object failing a schema keeps its cap.
                recovery = {"maxOutputTokens": recovery_output_tokens(evidence,
                    grow=truncated or isinstance(error, ModelResponseInvalid)),
                    "validationError": str(error)[:2000]}
                from .visual_planner import SceneScopeViolation
                if isinstance(error, SceneScopeViolation):
                    recovery["publicReason"] = error.public_reason
                previous_recovery = (self.state.get("pendingModelRecovery") or {}).get("context")
                self.state["pendingModelRecovery"] = {"step": name, "context": recovery}
                if self.production_limits and self.production_limits["maxTechnicalRepairs"] is None and previous_recovery == recovery:
                    self.save()
                    raise ModelRecoveryStalled(recovery.get("publicReason"))
                self.save()
                self.reserve_repair()
                self.event(self.model_phase(name), "recovering",
                    "A generated response was incomplete or unusable. Regenerating this step automatically; saved work is retained.")
            finally:
                RECOVERY.reset(token)

    @staticmethod
    def model_phase(name):
        if name in ("structurer", "scene_author", "plan_repair", "composition", "director.composition", "art_direction"):
            return "composition"
        if name in ("narrative", "director.narrative"):
            return "narrative"
        if name in ("image_intent", "image_review"):
            return name
        if name == "production.image_start":
            return "image_generation"
        if name == "production.record":
            return "recording"
        if name == "production.render":
            return "render"
        if name == "director.coverage":
            return "research_coverage"
        return "verification" if name == "film_review" else "preparation"

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
            if name == "image_start":
                self.event("image_generation", "started", "Generating an illustration. Waiting for the provider result.")
            try:
                envelope = await asyncio.to_thread(getattr(self.client, name), *args)
            except Exception:
                if name == "record" and self.state.get("runId"):
                    # A lost command response may still have a durable paid receipt.
                    # Observe only: never request synthesis again to obtain usage.
                    self.state["productionSnapshot"] = await asyncio.to_thread(self.snapshot)
                    self.save()
                if name != "image_start":
                    raise
                envelope = await self.observe_image(args[1])
            job = envelope.data.get("job") if name == "image_start" else None
            if not job or job.get("status") not in ("uncertain", "dispatching"):
                finish_call(call_id, providerOutcome="responded" if envelope.succeeded
                            and (not job or job.get("status") != "failed") else "failed",
                            imageConsumption=(job or {}).get("consumption")
                                if envelope.data.get("disposition") != "reused" else None)
            if name == "init" and envelope.run:
                self.state["runId"] = envelope.run.id
            if self.state["runId"]:
                self.state["productionSnapshot"] = await asyncio.to_thread(self.snapshot)
            return json.loads(envelope.raw)
        dependencies = {"args": args, "key": key}
        identity = digest({"name": "production." + name, "dependencies": dependencies})
        if name == "image_start" and identity not in self.state["steps"]:
            policy = self.state.get("productionSnapshot", {}).get("data", {}).get("imageRecoveryPolicy")
            if policy:
                if self.exhausted("maxImages", policy["attemptsUsed"], policy["maxImageAttempts"]):
                    raise AutonomousBlocked("The operator-authorized image attempt allowance was exhausted.")
                deadline = datetime.fromisoformat(policy["nextImageDispatchAt"].replace("Z", "+00:00"))
                delay = (deadline - datetime.now(timezone.utc)).total_seconds() + 1
                if delay > 0:
                    self.event("image_generation", "waiting", "Waiting for the operator-authorized image dispatch interval.")
                    await self.wait_for_provider(delay)
        raw = await self.step("production." + name, dependencies, send)
        return parse_envelope(json.dumps(raw))

    @staticmethod
    def image_job_id(request):
        from .image_generation import _purpose_digest
        identity = request["requestSha256"]
        if request.get("retryOf"):
            identity = sha256((identity + ":" + request["retryOf"]).encode()).hexdigest()
        return "image-job-" + _purpose_digest("image-job", {"identityKey": request["identityKey"], "requestSha256": identity})[:20]

    async def observe_image(self, request):
        job_id = self.image_job_id(request)
        self.event("image_generation", "waiting", "The generation response was lost. Checking the existing operation before continuing.")
        while True:
            try:
                envelope = await asyncio.to_thread(self.client.image_status, self.state["runId"], job_id)
            except Exception:
                raise AutonomousBlocked("The image generation result is unknown and could not be retrieved. Production is suspended; no duplicate generation was started.") from None
            job = envelope.data.get("job")
            if not envelope.succeeded or not job or job.get("requestSha256") != request["requestSha256"] or job.get("id") != job_id:
                raise AutonomousBlocked("The existing image generation could not be verified. Production is suspended; no duplicate generation was started.")
            if job["status"] != "dispatching":
                return envelope
            await self.wait_for_provider(5)

    def require_success(self, envelope):
        if not envelope.succeeded:
            code = envelope.error.code if envelope.error else envelope.outcome
            raise AutonomousBlocked(f"Production stopped: {code}.")
        return envelope

    def context(self):
        return {k: self.state.get(k) for k in ("editorialBrief", "researchDossier", "narrative", "visualBible")}

    async def run(self):
        from .provider_usage import CURRENT
        self.journal = self.journal or CURRENT.get()
        # Read authority before returning a cached terminal, and before any new provider work.
        if self.state["runId"]:
            observed = self.snapshot()
            if observed != self.state.get("productionSnapshot"):
                if (self.state.get("imageWorkflow", {}).get("invocationId")
                        and not self.state.get("pending") and not self.state.get("terminal")):
                    from .image_workflow import assert_image_only_transition
                    assert_image_only_transition(self.state.get("productionSnapshot"), observed)
                    self.state["productionSnapshot"] = observed
                    self.save()
                else:
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
            from .provider_usage import ProviderLimit, ProviderStopped
            from .provider_failure import ProviderFailure
            # Provider exception messages can contain credentials or internal prompts.
            reason = str(error) if isinstance(error, (AutonomousBlocked, ProviderLimit, ImageIntentViolation, ProviderFailure)) else type(error).__name__ + ": inspect operator evidence before resuming."
            if isinstance(error, ModelRecoveryExhausted):
                reason = (getattr(error, "public_reason", None)
                          or (self.state.get("pendingModelRecovery") or {}).get("context", {}).get("publicReason")
                          or "Automatic response repair is no longer making progress. Your completed work is saved.")
            elif isinstance(error, ModelResponseInvalid):
                reason = "The generation service did not return a usable response. Your completed work is saved."
            elif isinstance(error, ContractViolation) and not isinstance(error, ImageIntentViolation):
                reason = "The generated content could not pass the required checks. Your completed work is saved."
            self.state["terminal"] = {"status": "blocked", "runId": self.state["runId"], "reason": reason}
            if isinstance(error, (AutonomousLimit, ProviderLimit)):
                self.state["terminal"]["code"] = "limit"
            if isinstance(error, ProviderStopped):
                self.state["terminal"]["code"] = "stopped"
            if isinstance(error, ImageReviewNeedsAction):
                self.state["terminal"]["code"] = "image_review_requires_action"
            if isinstance(error, ModelRecoveryExhausted):
                self.state["terminal"]["code"] = "model_response"
                if isinstance(error, ModelRecoveryStalled):
                    self.state["terminal"]["responseRecoveryStalled"] = RESPONSE_RECOVERY_VERSION
            elif isinstance(error, ModelResponseInvalid):
                self.state["terminal"]["code"] = "provider_response"
            if isinstance(error, ProviderFailure):
                self.state["terminal"]["code"] = "provider_temporary" if error.retryable else "provider_requires_action"
            if isinstance(error, (ContractViolation, ProviderFailure)):
                self.state["contractDiagnostic"] = {"step": self.state["pending"], "error": str(error)}
                from .provider_usage import CURRENT
                pending = self.state.get("pending")
                if CURRENT.get() and not CURRENT.get().summary()["uncertain"] and pending and not pending["name"].startswith("production."):
                    self.state["recoverableFailure"] = {"pending": deepcopy(pending),
                        "pendingComposition": deepcopy(self.state.get("pendingComposition"))}
            failed_step = (self.state.get("pendingComposition") or self.state.get("pending") or {}).get("name", "")
            if not failed_step and isinstance(error, (ProviderLimit, AutonomousLimit)) and self.state.get("refusedDispatches"):
                failed_step = self.state["refusedDispatches"][-1]["name"]
            phase = self.model_phase(failed_step) if failed_step else (self.state["events"][-1]["phase"] if self.state["events"] else "preparation")
            self.event(phase, "blocked", reason)
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
                async def narrate():
                    value = await self.creative.narrate(self.brief, dossier)
                    if "insufficientEvidence" in value:
                        gaps = value["insufficientEvidence"]
                        if (set(value) != {"insufficientEvidence"} or not isinstance(gaps, list) or not gaps
                                or any(not isinstance(g, str) or not g.strip() for g in gaps)):
                            raise ContractViolation("Narrator evidence gaps must be only insufficientEvidence: "
                                "a nonempty list of specific missing facts as nonempty strings.")
                    else:
                        Narrative.from_mapping(value, dossier)
                    return value
                dependencies = self.context() | {"revision": self.state["editorialCorrections"]}
                # Preserve first-search checkpoint identities. A completed follow-up search
                # must reach the narrator even when citation deduplication leaves the dossier unchanged.
                if len(self.state["searches"]) > 1:
                    dependencies["researchRevision"] = len(self.state["searches"])
                value = await self.step("narrative", dependencies, narrate)
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
            if not await self.apply_decision(decision, "narrative"):
                continue
            if not self.state.get("visualBible"):
                async def art_direct():
                    value = await self.creative.art_direct(self.brief, dossier, self.vocabulary)
                    VisualBible.from_mapping(value, self.vocabulary)
                    return value
                value = await self.step("art_direction", self.context(),
                    art_direct)
                self.state["visualBible"] = VisualBible.from_mapping(value, self.vocabulary).to_mapping()
                self.save()
            if not self.state.get("videoPlan"):
                self.state["videoPlan"] = await self.compose()
                self.save()
            payload = self.context() | {"videoPlan": self.state["videoPlan"],
                "selectedSpecifications": self.selected_specs(self.state["videoPlan"])}
            decision = await self.step("director.composition", payload,
                lambda: self.director.judge("composition", payload))
            if await self.apply_decision(decision, "composition"):
                return

    async def apply_decision(self, decision, stage):
        action = decision["action"]
        if action == "accept":
            return True
        if action == "stop":
            raise AutonomousBlocked("Director stopped preparation: " + decision["observations"][0]["problem"])
        if action == "composition" and stage == "narrative":
            raise AutonomousBlocked("Director requested composition repair before composition exists.")
        history = self.state.setdefault("editorialReviews", [])
        reviewed = {"stage": stage, "decision": deepcopy(decision), "narrative": deepcopy(self.state.get("narrative")),
                    "videoPlan": deepcopy(self.state.get("videoPlan"))}
        if any(row == reviewed for row in history):
            raise AutonomousBlocked("The editorial correction repeats the same rejected content without progress. Your direction is needed.")
        if history and self.production_limits and self.production_limits["maxEditorialCorrections"] is None:
            direction = await self.check_progress("editorial", history + [reviewed], userDirection=self.state.get("feedback"))
            decision = {**decision, "nextCorrection": direction}
        history.append(reviewed)
        self.state["feedback"] = decision
        if action == "research":
            self.state.update(coverageAccepted=False,
                targetedQuestions=[o["expected"] for o in decision["observations"]])
        else:
            if self.exhausted("maxEditorialCorrections", self.state["editorialCorrections"], 2):
                raise AutonomousLimit("The editorial correction allowance was exhausted.")
            self.state["editorialCorrections"] += 1
            self.state["videoPlan"] = None
            if action == "narrative":
                self.state["narrative"] = None
        self.event("editorial_correction", "started", "Applying the Director's structured observations.")
        return False

    async def cover_research(self):
        while not self.state.get("coverageAccepted"):
            revision = len(self.state["searches"])
            if self.max_searches is not None and revision >= self.max_searches:
                raise AutonomousLimit("Research coverage remains insufficient after the allowed searches; narration is stopped.")
            if self.production_limits and self.production_limits["maxSearches"] is None and revision > 1:
                direction = await self.check_progress("research", self.state["searches"])
                self.state["targetedQuestions"] = [direction]
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
        self.state["technicalRepairs"] = max(self.state["technicalRepairs"], result["technicalRepairs"])
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
        if fn is None:
            # Lookup only: retain a whole-film answer authored before section checkpoints.
            return None
        self.state["pendingComposition"] = {"name": name, "identity": identity}
        self.save()
        scope = dependencies.get("context", {}).get("authoringScope") if name == "scene_author" else None
        if scope:
            self.event("composition", "started", f"Creating section {scope['sectionIndex'] + 1} of {scope['sectionCount']}.")
        result = await self.model_step(name, fn)
        steps[identity] = {"name": name, "dependencies": deepcopy(dependencies), "result": result}
        self.state["pendingComposition"] = None
        self.save()
        if scope:
            self.event("composition", "completed", f"Section {scope['sectionIndex'] + 1} of {scope['sectionCount']} is saved.")
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
            value = await self.planner._repair.repair(plan, report,
                self.planner._catalog.for_role(CatalogProjectionRole.PLAN_REPAIR, ids), tools)
            self.planner._assemble(plan, value, allow_structural_echo=True)
            return value
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
        seen_plans = set()
        while True:
            self.check_stop()
            plan = self.state["videoPlan"]
            if digest(plan) in seen_plans:
                raise AutonomousBlocked("The technical correction repeats a rejected plan without progress. Your direction is needed.")
            seen_plans.add(digest(plan))
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
        if self.state.get("pendingFilmCorrection"):
            await self.correct_film()
        revision = self.state["filmCorrections"]
        self.event("preparation", "started", "Preparing the visual requirements.")
        if self.state.get("imageWorkflow", {}).get("invocationId"):
            previous = next(row for row in reversed(list(self.state["steps"].values()))
                if row["name"] == "production.compile")
            compiled = parse_envelope(json.dumps(previous["result"]))
        else:
            compiled = await self.validated_compile({"film": revision, "phase": "requirements"})
        await self.images(compiled)
        self.event("compilation", "started", "All required illustrations are accepted. Preparing the film.")
        compiled = await self.validated_compile({"film": revision, "phase": "final"})
        if compiled.data.get("assetWorklist"):
            raise AutonomousBlocked("Required image placeholders remain; delivery cannot be rendered.")
        self.state.pop("renderProgress", None)
        self.state.pop("progressConnectionLost", None)
        self.event("render", "started", "Rendering the picture and soundtrack.")
        finished = asyncio.Event()
        observer = asyncio.create_task(self.observe_render_progress(finished))
        try:
            rendered = self.require_success(await self.command("render", self.state["runId"],
                key={"film": revision, "plan": digest(self.state["videoPlan"]), "images": digest(self.state["images"])}))
        finally:
            finished.set()
            await observer
        descriptor = rendered.artifact("preview")
        if descriptor is None:
            raise AutonomousBlocked("Render returned no inspectable MP4.")
        self.event("media_validation", "started", "Checking the video and audio file.")
        artifact = await asyncio.to_thread(self.client.fetch_artifact, self.state["runId"], descriptor)
        verification = await asyncio.to_thread(verify_rendered_video, artifact.data, artifact.sha256, self.work / "media")
        self.state["terminal"] = {"status": "ready", "runId": self.state["runId"],
            "preview": descriptor.as_wire(), "verifiedSha256": artifact.sha256,
            "technicalVerification": verification, "humanJudgment": "optional"}
        self.event("delivery", "completed", "Your film is ready to watch and download.")

    async def observe_render_progress(self, finished):
        if not hasattr(self.client, "progress"):
            return
        while not finished.is_set():
            try:
                await asyncio.wait_for(finished.wait(), timeout=2)
                return
            except TimeoutError:
                pass
            try:
                envelope = await asyncio.to_thread(self.client.progress, self.state["runId"])
                if envelope.succeeded and envelope.data.get("activity"):
                    self.state["renderProgress"] = envelope.data["activity"]
                    self.state.pop("progressConnectionLost", None)
                    self.save()
            except Exception:
                # Observation failure never retries or cancels the rendering operation.
                self.state["progressConnectionLost"] = True
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
        if "revision" not in review:
            review["revision"] = self.state["filmCorrections"] + 1
            self.save()
        self.state["filmCorrections"] = review["revision"]
        self.state["videoPlan"] = await self.compose(review)
        self.state["pendingFilmCorrection"] = None
        self.event("film_correction", "started", "Correcting visuals while preserving the original Take.")

    def limit(self, name, fallback):
        return self.production_limits[name] if self.production_limits else fallback

    def exhausted(self, name, used, fallback):
        maximum = self.limit(name, fallback)
        return maximum is not None and used >= maximum

    async def wait_for_provider(self, seconds):
        while seconds > 0:
            self.check_stop()
            interval = min(seconds, 1)
            await asyncio.sleep(interval)
            seconds -= interval
        self.check_stop()

    async def images(self, compiled):
        requirements = {r.requirement_id: r for r in ClientProductionAdapter._requirements(self.state["videoPlan"])}
        # Production distinguishes a failed fallback from a pending placeholder. A resumed
        # autonomous film still needs accepted bytes for every authored image requirement.
        # Start with the published pending work, then include failed/omitted requirements.
        ordered = dict.fromkeys([item["requirementId"] for item in compiled.data["assetWorklist"]] + list(requirements))
        identities = {requirements[key].identity: requirements[key] for key in ordered}
        self.state["requiredImageIdentities"] = list(identities)
        self.save()
        if self.state["imageReviewMode"] == "studio_automatic":
            from .image_workflow import run_image_workflow
            await run_image_workflow(self, list(identities.values()))
        else:
            for requirement in identities.values():
                await self.image_requirement(requirement)

    async def image_requirement(self, requirement):
        history = self.state["images"].setdefault(requirement.identity, [])
        while not history or not history[-1].get("accepted"):
            if self.exhausted("maxImageCorrections", len(history) - 1, 2):
                raise AutonomousLimit("Image remains rejected after the allowed corrections for this identity.")
            if self.production_limits:
                from .provider_usage import CURRENT
                reviewed_ids = {row["job"]["id"] for rows in self.state["images"].values() for row in rows}
                dispatched = [(step["result"].get("data") or {}).get("job") for step in self.state["steps"].values()
                              if step["name"] == "production.image_start"]
                reusable = any(job and job.get("identityKey") == requirement.identity and job["id"] not in reviewed_ids
                               and job["status"] == "candidate" for job in dispatched)
                used = CURRENT.get().summary()["images"] if CURRENT.get() else len([job for job in dispatched if job])
                if self.exhausted("maxImages", used, None) and not reusable:
                    raise AutonomousLimit("The total image generation ceiling has been reached.")
            policy = self.state.get('productionSnapshot', {}).get('data', {}).get('imageRecoveryPolicy')
            if policy and self.exhausted('maxImages', policy['attemptsUsed'], policy['maxImageAttempts']):
                reviewed = {row['job']['id'] for row in history}
                candidates = [(step['result'].get('data') or {}).get('job') for step in self.state['steps'].values()
                    if step['name'] == 'production.image_start']
                if not any(job and job['status'] == 'candidate' and job['identityKey'] == requirement.identity
                           and job['id'] not in reviewed for job in candidates):
                    raise AutonomousBlocked('The operator-authorized image attempt allowance was exhausted.')
            payload = self.context() | {"requirement": requirement.to_mapping(),
                "videoPlan": self.state["videoPlan"], "previousCandidates": history}
            if self.production_limits:
                payload["imagePromptVersion"] = 3
            correction = self.state.get("imageUserCorrections", {}).get(requirement.identity)
            if correction:
                correction = {k: v for k, v in correction.items() if k != "id"}
                payload["userCorrection"] = correction
            if self.production_limits and self.production_limits["maxImageCorrections"] is None and len(history) > 1:
                payload["nextCorrection"] = await self.check_progress("image", history,
                    identity=requirement.identity, userCorrection=correction)
            self.event("image_intent", "started", "Preparing the illustration and its correction instructions.")
            bible = VisualBible.from_mapping(self.state["visualBible"], self.vocabulary)
            def compile_request(intention):
                return compile_intent(requirement, intention, bible, self.palettes,
                    user_correction=correction["instruction"] if correction else None,
                    separate_renderer=bool(self.production_limits)).production_mapping(requirement)
            async def prepare_intention():
                value = await self.director.image_intent(payload)
                # Schema-valid prose can still exceed the provider's final prompt limit.
                # Refuse before checkpoint success so response repair can shorten it.
                compile_request(value)
                return value
            dependencies = {"identity": requirement.identity, "revision": len(history), "context": payload}
            from .autonomous_roles import recover_invalid_cached_intent
            recover_invalid_cached_intent(self, dependencies, compile_request)
            intention = await self.step("image_intent", dependencies, prepare_intention)
            request = compile_request(intention)
            if self.production_limits and history:
                from .image_generation import _purpose_digest
                request["sourceCandidateSha256"] = history[-1]["job"]["candidate"]["artifact"]["sha256"]
                provider_request = {key: request[key] for key in ("prompt", "aspectRatio", "outputMimeType", "seed", "sourceCandidateSha256")}
                request["requestSha256"] = _purpose_digest("image-generation-request", provider_request)
            if any(row.get("request", {}).get("prompt") == request["prompt"] and not row.get("accepted") for row in history):
                raise AutonomousBlocked("The correction repeats the same image instructions without improvement. Revise the direction before generating again.")
            request = deepcopy(retained_image_request(request, self.state['steps']))
            if any(row.get("request", {}).get("requestSha256") == request["requestSha256"] for row in history):
                raise AutonomousBlocked("The image intention repeats a rejected request. Revise the correction before generating another candidate.")
            envelope = self.require_success(await self.command("image_start", self.state["runId"], request))
            job = envelope.data.get("job")
            image_retries = 0
            while job and job["status"] == "failed" and any(f"HTTP_{code};" in (job.get("failure") or "") for code in (429, 500, 502, 503, 504)):
                policy = self.state.get("productionSnapshot", {}).get("data", {}).get("imageRecoveryPolicy")
                if not policy and not self.production_limits:
                    break
                # Exact same provider bytes, with an explicit predecessor for a new counted attempt.
                request = {**request, "retryOf": job["id"]}
                image_retries += 1
                delay = min(300, 5 * 2 ** min(image_retries - 1, 6))
                self.event("image_generation", "retry", f"The image provider reported a temporary error. Retrying in {delay} seconds. You can stop production.")
                await self.wait_for_provider(delay)
                envelope = self.require_success(await self.command("image_start", self.state["runId"], request))
                job = envelope.data.get("job")
            if not job or job["status"] != "candidate":
                detail = f" {job['id']} ({job['status']}): {job.get('failure')}" if job else ""
                raise AutonomousBlocked("Image call has no inspectable candidate; no unapproved replacement was started." + detail)
            descriptor = ArtifactDescriptor(**job["candidate"]["artifact"])
            artifact = await asyncio.to_thread(self.client.fetch_artifact, self.state["runId"], descriptor)
            self.event("image_review", "started", "Inspecting verified candidate bytes against their intended uses.")
            review = await self.step("image_review", {"sha256": artifact.sha256, "intention": intention},
                lambda: self.reviewer.review(artifact.data, "image/png", artifact.sha256,
                    {**payload, "intention": intention, "imageIdentity": requirement.identity}))
            if not review["inspectionPossible"]:
                raise ImageReviewNeedsAction("The reviewer could not inspect the saved image. The review needs a technical correction before production can continue.")
            if review["requiresNarrationChange"]:
                raise ImageReviewNeedsAction("The image review requires a change to the recorded narration. The existing recording is preserved; continuing the same image cannot resolve this.")
            if review["accepted"] and self.image_review_hook and self.state["imageReviewMode"] != "studio_automatic":
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
