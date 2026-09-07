"""Named ADK model roles behind narrow, schema-validated crew adapters."""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from .crew_contract import (
    Brief,
    ContractViolation,
    Narrative,
    ProviderMode,
    ResearchDossier,
    VisualBible,
    VisualVocabulary,
    OperatorPolicy,
)
from .visual_planner import VisualCatalogTools

#: The one model every crew role is pinned to.
#:
#: Named once because a bundle has to be able to say which model authored a Run, and a
#: pin repeated at each role is one an upgrade can move by fours and leave by ones. The
#: reasoning for pinning an exact name rather than an alias is on `AdkProducer` in
#: `planner.py`, which reads this constant.
CREW_MODEL = "gemini-3.6-flash"


def _json_answer(text: str, what: str) -> Mapping[str, Any]:
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.DOTALL)
    body = fenced.group(1) if fenced else text
    try:
        value = json.loads(body)
    except json.JSONDecodeError as error:
        raise ContractViolation(f"{what} did not answer with JSON.") from error
    if not isinstance(value, Mapping):
        raise ContractViolation(f"{what} JSON output must be an object.")
    return value


class AdkJsonRole:
    """One persistent ADK `LlmAgent`; provider output is normalized to a JSON object."""

    def __init__(
        self,
        name: str,
        description: str,
        *,
        model: str = CREW_MODEL,
        app_name: str = "vox-production-crew",
        session_service: Any | None = None,
        session_id: str | None = None,
    ) -> None:
        from google.adk.agents import LlmAgent  # noqa: PLC0415
        from google.adk.sessions import InMemorySessionService  # noqa: PLC0415

        self.name = name
        self.description = description
        self.model = model
        self.app_name = app_name
        self.session_service = session_service or InMemorySessionService()
        self.session_id = session_id
        self._agent_type = LlmAgent

    def agent(self, instruction: str, tools: Sequence[Callable[..., Any]] = ()) -> Any:
        return self._agent_type(
            name=self.name,
            model=self.model,
            description=self.description,
            instruction=instruction,
            tools=list(tools),
        )

    async def ask(
        self,
        instruction: str,
        payload: Mapping[str, Any],
        *,
        tools: Sequence[Callable[..., Any]] = (),
    ) -> Mapping[str, Any]:
        from google.adk.runners import Runner  # noqa: PLC0415
        from google.genai import types  # noqa: PLC0415

        if self.session_id is None:
            session = await self.session_service.create_session(
                app_name=self.app_name, user_id=self.name
            )
            self.session_id = session.id
        runner = Runner(
            agent=self.agent(instruction, tools),
            app_name=self.app_name,
            session_service=self.session_service,
        )
        answered: list[str] = []
        async for event in runner.run_async(
            user_id=self.name,
            session_id=self.session_id,
            new_message=types.Content(
                role="user",
                parts=[
                    types.Part(
                        text=json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                    )
                ],
            ),
        ):
            if event.is_final_response() and event.content:
                answered.extend(
                    part.text for part in (event.content.parts or ()) if part.text
                )
        return _json_answer("".join(answered).strip(), self.name)


MAX_PLANNED_QUESTIONS = 8
"""How many questions one inquiry may carry.

A ceiling rather than a target. The Brief still travels with the questions, so a thin plan costs
nothing; an unbounded one turns a single metered Task Run into a long one, and length is the part
of a provider's bill the crew controls.
"""


class AdkResearchAgent:
    """The role half of research: plans the inquiry, then executes it through the tool.

    The spec splits research into an agent and one provider-neutral tool (spec.md:197). The tool
    owns authentication, request formatting, polling, retry behaviour and Parallel's response
    shapes; this owns the one editorial decision in the phase — *what to ask* — which US31 wants
    made by the crew rather than inherited from whatever a vendor decomposes a Brief into.

    It deliberately does **not** interpret the dossier that comes back. The tool validates the
    provider's answer against the published dossier schema and this returns it unchanged: a model
    permitted to rewrite claims, sources or support values could produce a sourced-looking
    statement no source made, which is the one failure the whole dossier contract exists to
    prevent. Planning the inquiry is the agent's judgement; the evidence is not.

    The no-call path never reaches here: `ProductionCrew.run` decides research is not required
    from the Brief kind before it touches this adapter, so a fictional or test-data Brief costs
    zero calls, including zero planning calls.
    """

    def __init__(
        self,
        tool: Any,
        *,
        model: str = CREW_MODEL,
        session_service: Any | None = None,
    ) -> None:
        self._tool = tool
        self.role = AdkJsonRole(
            "ResearchAgent",
            "Decides which questions a factual Brief needs answered before research runs.",
            model=model,
            session_service=session_service,
        )
        #: The last inquiry planned, so evidence can record what was asked and not only answered.
        self.inquiry: tuple[str, ...] = ()

    @property
    def mode(self) -> ProviderMode:
        """The tool's mode, not the agent's.

        Crew code must never branch on which adapter it holds, so the phase's provider mode stays
        a property of the thing that reaches a provider.
        """
        return self._tool.mode

    async def research(self, brief: Brief) -> Mapping[str, Any]:
        self.inquiry = await self._plan_inquiry(brief)
        return await self._tool.research(brief, self.inquiry)

    async def _plan_inquiry(self, brief: Brief) -> tuple[str, ...]:
        """Plan the questions, and treat a failure to plan as a reason to ask the Brief plainly.

        A planning turn that answers badly must not cost the Run its research. The provider
        accepts a bare Brief perfectly well — that is what it received before this role existed —
        so a malformed plan degrades to the previous behaviour instead of failing a phase that
        has not yet spent anything.
        """
        try:
            answer = await self.role.ask(
                "Return only JSON: {\"questions\": [...]}. Each question must be answerable from "
                "public sources, must be specific enough that a wrong answer would be visibly "
                "wrong, and must serve the supplied Brief. Ask for the evidence a short factual "
                f"explainer needs — figures, dates, named parties, disagreements. At most "
                f"{MAX_PLANNED_QUESTIONS}. Do not answer them.",
                {"brief": brief.to_mapping()},
            )
        except Exception:
            return ()
        if not isinstance(answer, Mapping):
            return ()
        questions = answer.get("questions")
        if not isinstance(questions, Sequence) or isinstance(questions, (str, bytes)):
            return ()
        planned: list[str] = []
        for question in questions:
            if isinstance(question, str) and question.strip() and question not in planned:
                planned.append(question.strip())
        return tuple(planned[:MAX_PLANNED_QUESTIONS])


class AdkCreativeAdapter:
    """Independent Narrative and Art Director ADK agents, joined by `ProductionCrew`."""

    mode = ProviderMode.LIVE

    def __init__(
        self,
        *,
        model: str = CREW_MODEL,
        session_service: Any | None = None,
    ) -> None:
        self.narrative_agent = AdkJsonRole(
            "NarrativeAgent",
            "Turns sourced evidence into narration Beats without inventing claims.",
            model=model,
            session_service=session_service,
        )
        self.art_director_agent = AdkJsonRole(
            "ArtDirectorAgent",
            "Chooses a closed-vocabulary visual bible for the factual story.",
            model=model,
            session_service=session_service,
        )

    async def narrate(
        self, brief: Brief, dossier: ResearchDossier
    ) -> Mapping[str, Any]:
        return await self.narrative_agent.ask(
            "Return only Narrative JSON: schemaVersion, angle, hook, and Beats with id, text, "
            "claimIds, factual. Every factual Beat must cite supplied claim IDs. Do not expose "
            "reasoning.",
            {"brief": brief.to_mapping(), "researchDossier": dossier.to_mapping()},
        )

    async def art_direct(
        self, brief: Brief, dossier: ResearchDossier, vocabulary: VisualVocabulary
    ) -> Mapping[str, Any]:
        """The vocabulary is supplied, not assumed.

        The instruction has always said "the supplied closed vocabulary" and the payload never
        carried one, so the role was asked to obey a list it could not read and had to guess
        `editorial-cold` from the Brief. `VisualBible.from_mapping` caught a wrong guess at the
        gate, which made it safe and not cheap: a rejected bible ends the Run having paid for
        research and two model calls. Sending the four published lists costs a few hundred
        characters and removes the guess.
        """
        return await self.art_director_agent.ask(
            "Return only VisualBible JSON using only the closed vocabulary in visualVocabulary: "
            "schemaVersion, theme, motionIntent, colorRoles, treatments, motifs, "
            "forbiddenTreatments. theme must be one of visualVocabulary.themes; motionIntent, "
            "colorRoles, treatments and forbiddenTreatments may name only values published in "
            "the matching visualVocabulary list. Do not add provider prompts or raw style values.",
            {
                "brief": brief.to_mapping(),
                "researchDossier": dossier.to_mapping(),
                "visualVocabulary": vocabulary.to_mapping(),
            },
        )

    async def plan(
        self,
        brief: Brief,
        dossier: ResearchDossier,
        narrative: Narrative,
        visual_bible: VisualBible,
    ) -> Mapping[str, Any]:
        """Refuses the fallback `ProductionCrew` allows, deliberately.

        A crew built without a `visual_planner` uses its creative adapter as one, which is how
        the recorded adapters plan. For the live roles that fallback would hand one generalist
        agent the whole catalog — exactly what ADR-0019 supersedes — so this says no instead of
        quietly doing it. The signature matches `CreativeAdapter.plan` rather than absorbing
        anything, so a caller that gets here got here the one way it can.
        """
        raise ContractViolation("Live visual planning requires the role-scoped SplitVisualPlanner.")


class AdkVisualStructurer:
    def __init__(self, *, model: str = CREW_MODEL, session_service: Any | None = None) -> None:
        self.role = AdkJsonRole(
            "VisualStructurer",
            "Selects scene capabilities and semantic structure without authoring props.",
            model=model,
            session_service=session_service,
        )

    async def structure(
        self,
        brief: Brief,
        dossier: ResearchDossier,
        narrative: Narrative,
        visual_bible: VisualBible,
        selection_catalog: tuple[dict[str, Any], ...],
    ) -> Mapping[str, Any]:
        return await self.role.ask(
            "Return only visual-structure JSON. Preserve Narrative Beats verbatim. Select only "
            "published component IDs and write section/scene ids and spansBeats. Scene objects "
            "must contain exactly id, component, spansBeats; never write props. If no published "
            "component can honestly carry the story, do not substitute a loose fit and do not "
            "name an unpublished component: answer instead with a single unservable object "
            "holding summary, unmetNeed and catalogGap, and nothing else.",
            {
                "brief": brief.to_mapping(),
                "researchDossier": dossier.to_mapping(),
                "narrative": narrative.to_mapping(),
                "visualBible": visual_bible.to_mapping(),
                "selectionCatalog": list(selection_catalog),
            },
        )


class AdkSceneAuthor:
    def __init__(self, *, model: str = CREW_MODEL, session_service: Any | None = None) -> None:
        self.role = AdkJsonRole(
            "SceneAuthor",
            "Fills existing scene slots from selected full capability specifications.",
            model=model,
            session_service=session_service,
        )

    async def author(
        self,
        structure: Mapping[str, Any],
        specifications: tuple[dict[str, Any], ...],
        tools: VisualCatalogTools,
    ) -> Mapping[str, Any]:
        def searchScenes(intent: str = "") -> list[dict[str, Any]]:
            """Search compact published SceneCapabilities by editorial intent."""
            return list(tools.search_scenes(intent))

        def getSceneSpec(capability_id: str) -> dict[str, Any]:
            """Read the full selected SceneCapability specification."""
            return tools.get_scene_spec(capability_id)

        def validateScene(instance: Mapping[str, Any]) -> Mapping[str, Any]:
            """Validate one authored SceneInstance and return structured findings."""
            return tools.validate_scene(instance)

        def validateVideoPlan(plan: Mapping[str, Any]) -> Mapping[str, Any]:
            """Validate the assembled VideoPlan and return structured findings."""
            return tools.validate_video_plan(plan)

        return await self.role.ask(
            "Return only JSON with a scenes array. Fill each existing scene id exactly once. "
            "Each fill may contain only id, props, layout, motionProfile, events. Do not add, "
            "remove, or select scenes. Use the four offered catalog tools when needed.",
            {"structure": dict(structure), "specifications": list(specifications)},
            tools=(searchScenes, getSceneSpec, validateScene, validateVideoPlan),
        )


class AdkPlanRepair:
    """The third visual role: repairs a refused plan from the findings that refused it.

    It is given the full specifications of exactly the capabilities the refusal implicates —
    ADR-0019's `planRepair` projection — and never the whole catalog. Its authority is narrower
    than the Scene Author's in one further way: it may not re-select. A repair that could change a
    scene's `component` would be structuring, which is a decision the Structurer already made and
    which no finding gives it grounds to revisit.
    """

    def __init__(self, *, model: str = CREW_MODEL, session_service: Any | None = None) -> None:
        self.role = AdkJsonRole(
            "PlanRepairAgent",
            "Repairs the refused portion of a VideoPlan from published findings.",
            model=model,
            session_service=session_service,
        )

    async def repair(
        self,
        plan: Mapping[str, Any],
        refusal: Any,
        specifications: tuple[dict[str, Any], ...],
        tools: VisualCatalogTools,
    ) -> Mapping[str, Any]:
        def getSceneSpec(capability_id: str) -> dict[str, Any]:
            """Read the full specification of a capability this refusal implicates."""
            return tools.get_scene_spec(capability_id)

        def validateScene(instance: Mapping[str, Any]) -> Mapping[str, Any]:
            """Validate one repaired SceneInstance and return structured findings."""
            return tools.validate_scene(instance)

        def validateVideoPlan(candidate: Mapping[str, Any]) -> Mapping[str, Any]:
            """Validate the repaired VideoPlan and return structured findings."""
            return tools.validate_video_plan(candidate)

        return await self.role.ask(
            "Return only JSON with a scenes array holding every scene of the supplied plan, "
            "repaired where the findings name it and unchanged everywhere else. Each entry may "
            "contain only id, props, layout, motionProfile, events. Do not add, remove, reorder "
            "or re-select scenes, and never change a scene's component. Repair only what the "
            "findings name.",
            {
                "plan": dict(plan),
                "findings": [dict(finding) for finding in refusal.findings],
                "specifications": list(specifications),
            },
            tools=(getSceneSpec, validateScene, validateVideoPlan),
        )


def create_adk_director(
    crew: Any,
    *,
    sub_agents: Sequence[Any],
) -> Any:
    """Wrap the deterministic Director in ADK's custom workflow-agent lifecycle.

    The root never delegates command ordering to a model. Its declared children make the named
    role hierarchy visible to ADK, while `ProductionCrew.run` remains the single public state
    machine and yields the sanitized outputs stored as ADK events.
    """
    from google.adk.agents import BaseAgent  # noqa: PLC0415
    from google.adk.events import Event  # noqa: PLC0415
    from pydantic import PrivateAttr  # noqa: PLC0415

    class ProductionDirectorAgent(BaseAgent):
        _crew: Any = PrivateAttr()

        def __init__(self) -> None:
            super().__init__(
                name="Director",
                description="Deterministically orchestrates the Vox production crew.",
                rerun_on_resume=True,
                sub_agents=list(sub_agents),
            )
            self._crew = crew

        async def _run_async_impl(self, ctx: Any):
            parts = getattr(getattr(ctx, "user_content", None), "parts", ()) or ()
            message = "".join(part.text for part in parts if getattr(part, "text", None))
            try:
                payload = json.loads(message)
                brief = Brief.from_mapping(payload["brief"])
                policy = OperatorPolicy.from_mapping(payload["policy"])
            except (KeyError, TypeError, json.JSONDecodeError, ContractViolation) as error:
                raise ContractViolation("Director input must contain a valid Brief and policy.") from error
            async for update in self._crew.run(brief, policy):
                yield Event(author=self.name, output=update.to_mapping())

    return ProductionDirectorAgent()


__all__ = [
    "CREW_MODEL",
    "MAX_PLANNED_QUESTIONS",
    "AdkCreativeAdapter",
    "AdkJsonRole",
    "AdkPlanRepair",
    "AdkResearchAgent",
    "AdkSceneAuthor",
    "AdkVisualStructurer",
    "create_adk_director",
]
