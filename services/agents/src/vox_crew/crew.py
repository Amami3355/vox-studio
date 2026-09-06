"""Deterministic orchestration behind the crew's single asynchronous interface.

This module is the domain state machine an ADK workflow agent drives.  It owns dependency order,
joins and authorization gates; injected adapters own provider judgment and Production execution.
Nothing in the public event stream exposes those adapters or their payloads.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from .crew_contract import (
    ArtifactHandle,
    Brief,
    BriefKind,
    ContractViolation,
    CrewEvent,
    CrewPhase,
    CrewRole,
    CrewTerminal,
    Declined,
    Failed,
    Narrative,
    OperatorPolicy,
    Paused,
    PhaseStatus,
    ProviderMode,
    ProviderAccess,
    Rendered,
    ResearchDossier,
    ResearchMode,
    TerminalResult,
    VisualBible,
    VisualVocabulary,
)
from .crew_state import CrewStateStore, InMemoryCrewStateStore
from .image_generation import ImageJob


class UnservableBrief(Exception):
    """The catalog cannot truthfully express an editorial need."""

    def __init__(self, summary: str, unmet_need: str, catalog_gap: str) -> None:
        super().__init__(summary)
        self.summary = summary
        self.unmet_need = unmet_need
        self.catalog_gap = catalog_gap


@dataclass(frozen=True, slots=True)
class ProductionExecution:
    """Sanitized milestones returned by an asset-aware deterministic Production driver."""

    terminal: TerminalResult
    state: Mapping[str, Any]
    requirement_count: int
    jobs: tuple[ImageJob, ...]


class ResearchAdapter(Protocol):
    mode: ProviderMode

    async def research(self, brief: Brief) -> Mapping[str, Any]: ...


class CreativeAdapter(Protocol):
    mode: ProviderMode

    async def narrate(self, brief: Brief, dossier: ResearchDossier) -> Mapping[str, Any]: ...

    async def art_direct(self, brief: Brief, dossier: ResearchDossier) -> Mapping[str, Any]: ...

    async def plan(
        self,
        brief: Brief,
        dossier: ResearchDossier,
        narrative: Narrative,
        visual_bible: VisualBible,
    ) -> Mapping[str, Any]: ...


class VisualPlannerAdapter(Protocol):
    mode: ProviderMode

    async def plan(
        self,
        brief: Brief,
        dossier: ResearchDossier,
        narrative: Narrative,
        visual_bible: VisualBible,
    ) -> Mapping[str, Any]: ...


class ProductionAdapter(Protocol):
    recording_mode: ProviderMode
    asset_capable: bool

    async def produce(
        self,
        brief: Brief,
        policy: OperatorPolicy,
        plan: Mapping[str, Any],
        visual_bible: VisualBible,
        resume: Mapping[str, Any] | None,
    ) -> TerminalResult | ProductionExecution: ...


class ProductionCrew:
    """One deep module: ``run`` yields validated progress and exactly one terminal result."""

    def __init__(
        self,
        research: ResearchAdapter,
        creative: CreativeAdapter,
        production: ProductionAdapter,
        *,
        visual_vocabulary: VisualVocabulary,
        visual_planner: VisualPlannerAdapter | None = None,
        state_store: CrewStateStore | None = None,
    ) -> None:
        self._research = research
        self._creative = creative
        self._production = production
        self._visual_planner = visual_planner if visual_planner is not None else creative
        self._visual_vocabulary = visual_vocabulary
        self._state_store = state_store if state_store is not None else InMemoryCrewStateStore()

    async def run(
        self, brief: Brief, policy: OperatorPolicy
    ) -> AsyncIterator[CrewEvent | CrewTerminal]:
        """Run a Brief once, in deterministic phase order, through injected async adapters."""
        stored = await self._state_store.load(brief.id)
        if stored is None:
            checkpoint: dict[str, Any] = {
                "schemaVersion": 1,
                "briefId": brief.id,
                "brief": brief.to_mapping(),
                "policy": policy.to_mapping(),
                "sequence": 0,
                "research": None,
                "narrative": None,
                "visualBible": None,
                "videoPlan": None,
                "terminal": None,
            }
        else:
            checkpoint = dict(stored)
            if checkpoint.get("brief") != brief.to_mapping():
                raise ContractViolation("The stored crew checkpoint belongs to a different Brief.")
            if checkpoint.get("policy") != policy.to_mapping():
                raise ContractViolation("A resumed crew Run must use its original operator policy.")
        stored_sequence = checkpoint.get("sequence", 0)
        if isinstance(stored_sequence, bool) or not isinstance(stored_sequence, int) or stored_sequence < 0:
            raise ContractViolation("The stored crew checkpoint has an invalid event sequence.")
        sequence = stored_sequence

        stored_terminal = checkpoint.get("terminal")
        if stored_terminal is not None:
            yield CrewTerminal.from_mapping(stored_terminal)
            return

        async def save(**changes: Any) -> None:
            checkpoint.update(changes)
            checkpoint["sequence"] = sequence
            await self._state_store.save(brief.id, checkpoint)

        def event(
            phase: CrewPhase,
            role: CrewRole,
            status: PhaseStatus,
            mode: ProviderMode,
            summary: str,
            *,
            counts: Mapping[str, int] | None = None,
            artifacts: tuple[ArtifactHandle, ...] = (),
        ) -> CrewEvent:
            nonlocal sequence
            sequence += 1
            return CrewEvent.from_mapping(
                {
                    "schemaVersion": 1,
                    "briefId": brief.id,
                    "sequence": sequence,
                    "phase": phase.value,
                    "role": role.value,
                    "status": status.value,
                    "providerMode": mode.value,
                    "summary": summary,
                    "counts": dict(counts or {}),
                    "artifacts": [artifact.to_mapping() for artifact in artifacts],
                }
            )

        def terminal(result: TerminalResult) -> CrewTerminal:
            nonlocal sequence
            sequence += 1
            # Round-trip our own result through the same strict parser used for untrusted callers.
            return CrewTerminal.from_mapping(
                CrewTerminal(brief_id=brief.id, sequence=sequence, result=result).to_mapping()
            )

        def checked_result(result: TerminalResult) -> TerminalResult:
            """Validate an adapter result without consuming a public sequence number."""
            return CrewTerminal.from_mapping(
                CrewTerminal(brief_id=brief.id, sequence=1, result=result).to_mapping()
            ).result

        def failed(code: str, summary: str) -> CrewTerminal:
            return terminal(Failed(run_id=None, summary=summary, code=code, retryable=False))

        stored_research = checkpoint.get("research")
        dossier = (
            ResearchDossier.from_mapping(stored_research)
            if isinstance(stored_research, Mapping)
            else None
        )
        if brief.kind is BriefKind.FACTUAL and dossier is None:
            authorization = self._authorization_failure(
                policy.research, self._research.mode, "research", brief.id
            )
            if authorization is not None:
                yield event(
                    CrewPhase.RESEARCH,
                    CrewRole.RESEARCH_AGENT,
                    self._authorization_status(authorization),
                    self._research.mode,
                    self._authorization_summary(authorization, "Research"),
                )
                yield terminal(authorization)
                return
            yield event(
                CrewPhase.RESEARCH,
                CrewRole.RESEARCH_AGENT,
                PhaseStatus.STARTED,
                self._research.mode,
                "Research started.",
            )
            try:
                dossier = ResearchDossier.from_mapping(await self._research.research(brief))
            except ContractViolation:
                yield event(
                    CrewPhase.RESEARCH,
                    CrewRole.RESEARCH_AGENT,
                    PhaseStatus.FAILED,
                    self._research.mode,
                    "Research output did not satisfy its contract.",
                )
                yield failed("RESEARCH_CONTRACT_INVALID", "Research output was rejected.")
                return
            except Exception:  # Provider details are deliberately not copied into public events.
                yield event(
                    CrewPhase.RESEARCH,
                    CrewRole.RESEARCH_AGENT,
                    PhaseStatus.FAILED,
                    self._research.mode,
                    "Research could not complete.",
                )
                yield failed("RESEARCH_FAILED", "Research could not complete.")
                return
            completed_research = event(
                CrewPhase.RESEARCH,
                CrewRole.RESEARCH_AGENT,
                PhaseStatus.COMPLETED,
                self._research.mode,
                "The Research dossier is ready.",
                counts={"sources": len(dossier.sources), "claims": len(dossier.claims)},
            )
            await save(research=dossier.to_mapping())
            yield completed_research
        elif brief.kind is not BriefKind.FACTUAL and dossier is None:
            dossier = ResearchDossier(
                mode=ResearchMode.NOT_REQUIRED,
                sources=(),
                claims=(),
                statistics=(),
                quotations=(),
                contradictions=(),
                visual_opportunities=(),
            )
            skipped_research = event(
                CrewPhase.RESEARCH,
                CrewRole.DIRECTOR,
                PhaseStatus.SKIPPED,
                ProviderMode.NOT_APPLICABLE,
                "The declared Brief kind requires no research.",
                counts={"providerCalls": 0},
            )
            await save(research=dossier.to_mapping())
            yield skipped_research

        assert dossier is not None

        stored_narrative = checkpoint.get("narrative")
        stored_bible = checkpoint.get("visualBible")
        if isinstance(stored_narrative, Mapping) and isinstance(stored_bible, Mapping):
            narrative = Narrative.from_mapping(stored_narrative, dossier)
            visual_bible = VisualBible.from_mapping(stored_bible, self._visual_vocabulary)
        else:
            authorization = self._authorization_failure(
                policy.models, self._creative.mode, "models", brief.id
            )
            if authorization is not None:
                yield event(
                    CrewPhase.NARRATIVE,
                    CrewRole.NARRATIVE_AGENT,
                    self._authorization_status(authorization),
                    self._creative.mode,
                    self._authorization_summary(authorization, "Creative work"),
                )
                yield terminal(authorization)
                return

            # Starts are emitted in a fixed order before either task is awaited. The tasks then
            # run together; completions are emitted in the same fixed order after the join so the
            # public stream remains deterministic even when scheduler completion order differs.
            yield event(
                CrewPhase.NARRATIVE,
                CrewRole.NARRATIVE_AGENT,
                PhaseStatus.STARTED,
                self._creative.mode,
                "Narrative work started.",
            )
            yield event(
                CrewPhase.ART_DIRECTION,
                CrewRole.ART_DIRECTOR_AGENT,
                PhaseStatus.STARTED,
                self._creative.mode,
                "Art direction started.",
            )
            try:
                narrative_value, bible_value = await asyncio.gather(
                    self._creative.narrate(brief, dossier),
                    self._creative.art_direct(brief, dossier),
                )
                narrative = Narrative.from_mapping(narrative_value, dossier)
            except ContractViolation:
                yield event(
                    CrewPhase.NARRATIVE,
                    CrewRole.NARRATIVE_AGENT,
                    PhaseStatus.FAILED,
                    self._creative.mode,
                    "Narrative output did not satisfy its contract.",
                )
                yield failed("NARRATIVE_CONTRACT_INVALID", "Narrative output was rejected.")
                return
            except Exception:
                yield event(
                    CrewPhase.NARRATIVE,
                    CrewRole.NARRATIVE_AGENT,
                    PhaseStatus.FAILED,
                    self._creative.mode,
                    "The parallel creative phase could not complete.",
                )
                yield failed("CREATIVE_PHASE_FAILED", "The creative phase could not complete.")
                return
            try:
                visual_bible = VisualBible.from_mapping(bible_value, self._visual_vocabulary)
            except ContractViolation:
                yield event(
                    CrewPhase.ART_DIRECTION,
                    CrewRole.ART_DIRECTOR_AGENT,
                    PhaseStatus.FAILED,
                    self._creative.mode,
                    "Visual bible output did not satisfy its contract.",
                )
                yield failed("VISUAL_BIBLE_CONTRACT_INVALID", "Visual bible output was rejected.")
                return
            narrative_completed = event(
                CrewPhase.NARRATIVE,
                CrewRole.NARRATIVE_AGENT,
                PhaseStatus.COMPLETED,
                self._creative.mode,
                "Narrative Beats are ready.",
                counts={"beats": len(narrative.beats)},
            )
            bible_completed = event(
                CrewPhase.ART_DIRECTION,
                CrewRole.ART_DIRECTOR_AGENT,
                PhaseStatus.COMPLETED,
                self._creative.mode,
                "The Visual bible is ready.",
                counts={"treatments": len(visual_bible.treatments)},
            )
            await save(
                narrative=narrative.to_mapping(), visualBible=visual_bible.to_mapping()
            )
            yield narrative_completed
            yield bible_completed

        stored_plan = checkpoint.get("videoPlan")
        if isinstance(stored_plan, Mapping):
            plan = self._plan(stored_plan, narrative)
        else:
            authorization = self._authorization_failure(
                policy.models, self._visual_planner.mode, "models", brief.id
            )
            if authorization is not None:
                yield event(
                    CrewPhase.VISUAL_PLANNING,
                    CrewRole.VISUAL_PLANNER,
                    self._authorization_status(authorization),
                    self._visual_planner.mode,
                    self._authorization_summary(authorization, "Visual planning"),
                )
                yield terminal(authorization)
                return
            yield event(
                CrewPhase.VISUAL_PLANNING,
                CrewRole.VISUAL_PLANNER,
                PhaseStatus.STARTED,
                self._visual_planner.mode,
                "Visual planning started.",
            )
            try:
                plan = self._plan(
                    await self._visual_planner.plan(brief, dossier, narrative, visual_bible),
                    narrative,
                )
            except UnservableBrief as refusal:
                yield event(
                    CrewPhase.VISUAL_PLANNING,
                    CrewRole.DIRECTOR,
                    PhaseStatus.COMPLETED,
                    self._visual_planner.mode,
                    "The catalog cannot serve the Brief without misleading degradation.",
                )
                decline = getattr(self._production, "decline", None)
                if decline is None:
                    yield failed("DECLINE_UNAVAILABLE", "Production cannot publish the Decline.")
                    return
                yield event(
                    CrewPhase.PRODUCTION,
                    CrewRole.DIRECTOR,
                    PhaseStatus.STARTED,
                    ProviderMode.NOT_APPLICABLE,
                    "Production is publishing the structured Decline.",
                )
                declined = await decline(
                    brief, refusal.summary, refusal.unmet_need, refusal.catalog_gap
                )
                execution = declined if isinstance(declined, ProductionExecution) else None
                result = checked_result(
                    execution.terminal if execution is not None else declined
                )
                completed = event(
                    CrewPhase.PRODUCTION,
                    CrewRole.DIRECTOR,
                    PhaseStatus.COMPLETED,
                    ProviderMode.NOT_APPLICABLE,
                    "Production published the structured Decline.",
                )
                update = terminal(result)
                changes: dict[str, Any] = {"terminal": update.to_mapping()}
                if execution is not None:
                    changes["productionState"] = dict(execution.state)
                await save(**changes)
                yield completed
                yield update
                return
            except ContractViolation:
                yield event(
                    CrewPhase.VISUAL_PLANNING,
                    CrewRole.VISUAL_PLANNER,
                    PhaseStatus.FAILED,
                    self._visual_planner.mode,
                    "The VideoPlan draft did not satisfy the crew contract.",
                )
                yield failed("VIDEO_PLAN_CONTRACT_INVALID", "The VideoPlan draft was rejected.")
                return
            except Exception:
                yield event(
                    CrewPhase.VISUAL_PLANNING,
                    CrewRole.VISUAL_PLANNER,
                    PhaseStatus.FAILED,
                    self._visual_planner.mode,
                    "Visual planning could not complete.",
                )
                yield failed("VISUAL_PLANNING_FAILED", "Visual planning could not complete.")
                return
            planned = event(
                CrewPhase.VISUAL_PLANNING,
                CrewRole.VISUAL_PLANNER,
                PhaseStatus.COMPLETED,
                self._visual_planner.mode,
                "A VideoPlan draft is ready for Production validation.",
                counts={"beats": len(narrative.beats)},
            )
            await save(videoPlan=dict(plan))
            yield planned

        asset_capable = bool(getattr(self._production, "asset_capable", False))
        if not asset_capable:
            yield event(
                CrewPhase.ASSET_RESOLUTION,
                CrewRole.ASSET_RESOLVER,
                PhaseStatus.SKIPPED,
                ProviderMode.NOT_APPLICABLE,
                "No generated-asset work was requested in this Run.",
                counts={"providerCalls": 0},
            )
            yield event(
                CrewPhase.IMAGE_CREATION,
                CrewRole.IMAGE_CREATOR_AGENT,
                PhaseStatus.SKIPPED,
                policy.images.mode,
                "No image-generation provider call was made.",
                counts={"providerCalls": 0},
            )

        authorization = self._authorization_failure(
            policy.recording, self._production.recording_mode, "recording", brief.id
        )
        if authorization is not None:
            yield event(
                CrewPhase.PRODUCTION,
                CrewRole.DIRECTOR,
                self._authorization_status(authorization),
                self._production.recording_mode,
                self._authorization_summary(authorization, "Production"),
            )
            yield terminal(authorization)
            return
        yield event(
            CrewPhase.PRODUCTION,
            CrewRole.DIRECTOR,
            PhaseStatus.STARTED,
            self._production.recording_mode,
            "Production started through the published client interface.",
        )
        try:
            if asset_capable:
                produced = await self._production.produce(
                    brief,
                    policy,
                    plan,
                    visual_bible,
                    checkpoint.get("productionState")
                    if isinstance(checkpoint.get("productionState"), Mapping)
                    else None,
                )
            else:
                # Compatibility seam for existing handed/scripted Production adapters.
                produced = await self._production.produce(brief, policy, plan)  # type: ignore[call-arg]
            execution = produced if isinstance(produced, ProductionExecution) else None
            result = execution.terminal if execution is not None else produced
            checked = checked_result(result)
        except ContractViolation:
            yield event(
                CrewPhase.PRODUCTION,
                CrewRole.DIRECTOR,
                PhaseStatus.FAILED,
                self._production.recording_mode,
                "Production returned an invalid terminal result.",
            )
            yield failed("PRODUCTION_CONTRACT_INVALID", "Production output was rejected.")
            return
        except Exception:
            yield event(
                CrewPhase.PRODUCTION,
                CrewRole.DIRECTOR,
                PhaseStatus.FAILED,
                self._production.recording_mode,
                "Production could not complete.",
            )
            yield failed("PRODUCTION_FAILED", "Production could not complete.")
            return
        if execution is not None:
            await save(productionState=dict(execution.state))
            yield event(
                CrewPhase.ASSET_RESOLUTION,
                CrewRole.ASSET_RESOLVER,
                PhaseStatus.COMPLETED if execution.requirement_count else PhaseStatus.SKIPPED,
                ProviderMode.NOT_APPLICABLE,
                (
                    "Production published the generated-asset worklist."
                    if execution.requirement_count
                    else "The compilation published no generated-asset work."
                ),
                counts={"requirements": execution.requirement_count},
            )
            candidate_count = sum(job.candidate is not None for job in execution.jobs)
            accepted_count = sum(job.status.value == "accepted" for job in execution.jobs)
            failed_count = sum(job.status.value in {"failed", "uncertain"} for job in execution.jobs)
            image_status = (
                PhaseStatus.PAUSED
                if isinstance(result, Paused)
                else PhaseStatus.COMPLETED
                if execution.jobs
                else PhaseStatus.SKIPPED
            )
            yield event(
                CrewPhase.IMAGE_CREATION,
                CrewRole.IMAGE_CREATOR_AGENT,
                image_status,
                policy.images.mode,
                (
                    "Image creation is waiting for an explicit candidate decision."
                    if image_status is PhaseStatus.PAUSED
                    else "Image work reached explicit job outcomes."
                    if execution.jobs
                    else "No image-generation provider call was made."
                ),
                counts={
                    "jobs": len(execution.jobs),
                    "candidates": candidate_count,
                    "accepted": accepted_count,
                    "failed": failed_count,
                },
                artifacts=tuple(
                    job.candidate.artifact for job in execution.jobs if job.candidate is not None
                ),
            )
            if isinstance(result, Paused):
                pause = terminal(result)
                await save(productionState=dict(execution.state))
                yield pause
                return

        production_completed = event(
            CrewPhase.PRODUCTION,
            CrewRole.DIRECTOR,
            PhaseStatus.COMPLETED,
            self._production.recording_mode,
            "Production reached an explicit terminal state.",
        )
        retrieval_completed: CrewEvent | None = None
        if isinstance(result, Rendered):
            retrieval_completed = event(
                CrewPhase.ARTIFACT_RETRIEVAL,
                CrewRole.DIRECTOR,
                PhaseStatus.COMPLETED,
                ProviderMode.NOT_APPLICABLE,
                "The preview artifact digest is verified.",
                counts={"artifacts": 1},
            )
        # Persist a paid/irreversible completion before yielding it. A caller that disappears
        # after Production answered can reconstruct the crew and retrieve this exact terminal
        # result without issuing another command sequence.
        terminal_update = terminal(checked)
        await save(terminal=terminal_update.to_mapping())
        yield production_completed
        if retrieval_completed is not None:
            yield retrieval_completed
        yield terminal_update

    @staticmethod
    def _authorization_failure(
        access: ProviderAccess, adapter_mode: ProviderMode, action: str, brief_id: str
    ) -> Paused | Failed | None:
        if access.mode is not adapter_mode:
            return Failed(
                run_id=None,
                summary="Provider configuration does not match operator policy.",
                code="PROVIDER_MODE_MISMATCH",
                retryable=False,
            )
        try:
            access.require_authorized(action)
        except ContractViolation:
            return Paused(
                run_id=None,
                summary="The Run is waiting for operator authorization.",
                reason=f"A live {action} call requires an operator grant.",
                resume_id=f"{brief_id}:{action}",
            )
        return None

    @staticmethod
    def _authorization_status(result: Paused | Failed) -> PhaseStatus:
        return PhaseStatus.PAUSED if isinstance(result, Paused) else PhaseStatus.FAILED

    @staticmethod
    def _authorization_summary(result: Paused | Failed, phase: str) -> str:
        if isinstance(result, Paused):
            return f"{phase} is waiting for operator authorization."
        return f"{phase} provider configuration was rejected."

    @staticmethod
    def _plan(value: Mapping[str, Any], narrative: Narrative) -> Mapping[str, Any]:
        if not isinstance(value, Mapping):
            raise ContractViolation("VideoPlan must be an object.")
        if set(value) != {"beats", "sections"}:
            raise ContractViolation("VideoPlan must contain exactly beats and sections.")
        beats = value.get("beats")
        sections = value.get("sections")
        if not isinstance(beats, list) or not isinstance(sections, list):
            raise ContractViolation("VideoPlan beats and sections must be arrays.")
        authored = tuple(
            (item.get("id"), item.get("text")) for item in beats if isinstance(item, Mapping)
        )
        narrated = tuple((item.id, item.text) for item in narrative.beats)
        if authored != narrated:
            raise ContractViolation("VideoPlan Beats must preserve the Narrative Beat text verbatim.")
        return value
