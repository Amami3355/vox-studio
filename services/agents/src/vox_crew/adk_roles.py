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
    ResearchTrace,
    VisualBible,
    VisualVocabulary,
    OperatorPolicy,
)
from .image_generation import AssetRequirement
from .visual_planner import JsonObject, PlanRefusal, VisualCatalogTools

#: The one model every crew role is pinned to.
#:
#: Named once because a bundle has to be able to say which model authored a Run, and a
#: pin repeated at each role is one an upgrade can move by fours and leave by ones. The
#: reasoning for pinning an exact name rather than an alias is on `AdkPlanAuthor` in
#: `planner.py`, which reads this constant.
CREW_MODEL = "gemini-3.6-flash"


class RoleUnavailable(RuntimeError):
    """A model-role turn failed before producing an answer its caller can parse."""


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
    """One ADK `LlmAgent`; provider output is normalized to a JSON object.

    A role remembers its turns by default: the Narrative and Art Director agents are asked one
    question each, and the Scene Author's turns are meant to build on one another.

    `remembers_turns=False` gives each `ask` its own session. A role whose whole contract is that
    it judges one bounded task and sees no other cannot share a session between judgements — the
    payload would be bounded while the context accumulated every previous task, which is the
    isolation claim broken in the only place it is load-bearing.
    """

    def __init__(
        self,
        name: str,
        description: str,
        *,
        model: str = CREW_MODEL,
        app_name: str = "vox-production-crew",
        session_service: Any | None = None,
        session_id: str | None = None,
        remembers_turns: bool = True,
    ) -> None:
        from google.adk.agents import LlmAgent  # noqa: PLC0415
        from google.adk.sessions import InMemorySessionService  # noqa: PLC0415

        self.name = name
        self.description = description
        self.model = model
        self.app_name = app_name
        self.session_service = session_service or InMemorySessionService()
        self.session_id = session_id
        self.remembers_turns = remembers_turns
        self.answer_schema: Mapping[str, Any] | None = None
        self._agent_type = LlmAgent

    def agent(self, instruction: str, tools: Sequence[Callable[..., Any]] = ()) -> Any:
        from .provider_usage import CURRENT, ProviderLimit, begin_call, finish_call

        runtime: dict[str, Any] = {}
        model: Any = self.model
        if CURRENT.get() is not None:
            import os
            from google.adk.models.google_llm import Gemini
            from google.genai import types

            pending: list[str | None] = []

            def before_model(callback_context, llm_request):
                # Bound the actual accumulated context, including tool replies and prior turns.
                size = len(llm_request.model_dump_json(exclude_none=True).encode("utf-8"))
                if size > 300_000:
                    raise ProviderLimit("The operator model-input ceiling has been reached.")
                pending.append(begin_call(self.name, self.model))

            def after_model(callback_context, llm_response):
                if pending:
                    content = getattr(llm_response, "content", None)
                    parts = getattr(content, "parts", None) or ()
                    public = [{"partIndex": i, "text": part.text} for i, part in enumerate(parts)
                        if getattr(part, "text", None) and not getattr(part, "thought", False)]
                    finish_call(pending.pop(0), llm_response.usage_metadata, answerParts=public)

            model = Gemini(
                model=self.model,
                retry_options=types.HttpRetryOptions(attempts=1),
                client_kwargs={"enterprise": True, "project": os.environ["GOOGLE_CLOUD_PROJECT"],
                               "location": os.environ.get("GOOGLE_CLOUD_LOCATION", "global")},
            )
            runtime = {
                "before_model_callback": before_model,
                "after_model_callback": after_model,
                "generate_content_config": types.GenerateContentConfig(max_output_tokens=8192,
                    **({"response_mime_type": "application/json", "response_json_schema": self.answer_schema}
                       if self.answer_schema is not None else {})),
            }
        return self._agent_type(
            name=self.name,
            model=model,
            description=self.description,
            instruction=instruction,
            tools=list(tools),
            **runtime,
        )

    async def ask(
        self,
        instruction: str,
        payload: Mapping[str, Any],
        *,
        tools: Sequence[Callable[..., Any]] = (),
    ) -> Mapping[str, Any]:
        from .provider_usage import CURRENT

        journal = CURRENT.get()
        if journal is not None:
            async with journal.model_turn_lock:
                return await self._ask(instruction, payload, tools=tools)
        return await self._ask(instruction, payload, tools=tools)

    async def _ask(
        self,
        instruction: str,
        payload: Mapping[str, Any],
        *,
        tools: Sequence[Callable[..., Any]] = (),
    ) -> Mapping[str, Any]:
        try:
            from google.adk.runners import Runner  # noqa: PLC0415
            from google.genai import types  # noqa: PLC0415
        except ImportError as error:
            raise RoleUnavailable(f"{self.name} has no model framework installed.") from error

        session_id = await self._session_for_turn()
        # Built outside the guard below: a framework object this crew constructs wrongly is a bug
        # in crew code, and degrading it to `RoleUnavailable` would hide it behind a role that
        # silently answers its safe default on every Run.
        runner = Runner(
            agent=self.agent(instruction, tools),
            app_name=self.app_name,
            session_service=self.session_service,
        )
        message = types.Content(
            role="user",
            parts=[types.Part(text=json.dumps(payload, ensure_ascii=False, separators=(",", ":")))],
        )
        answered: list[str] = []
        try:
            async for event in runner.run_async(
                user_id=self.name,
                session_id=session_id,
                new_message=message,
            ):
                if event.is_final_response() and event.content:
                    answered.extend(
                        part.text for part in (event.content.parts or ())
                        if part.text and not getattr(part, "thought", False)
                    )
        except Exception as error:
            raise RoleUnavailable(f"{self.name} did not complete its model turn.") from error
        return _json_answer("".join(answered).strip(), self.name)

    async def _session_for_turn(self) -> str:
        """The session this turn runs in, created fresh when the role must not remember."""
        try:
            if not self.remembers_turns:
                session = await self.session_service.create_session(
                    app_name=self.app_name, user_id=self.name
                )
                return str(session.id)
            if self.session_id is None:
                session = await self.session_service.create_session(
                    app_name=self.app_name, user_id=self.name
                )
                self.session_id = session.id
            return str(self.session_id)
        except Exception as error:
            raise RoleUnavailable(f"{self.name} could not open a model session.") from error


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
        self.inquiry = self._safe_inquiry(await self._plan_inquiry(brief))
        return await self._tool.research(brief, self.inquiry)

    @staticmethod
    def _safe_inquiry(inquiry: tuple[str, ...]) -> tuple[str, ...]:
        """The questions, refused here if they carry anything a provider must not be told.

        `ResearchTrace` is the gate that knows what a safe question is, and it is the same gate
        the evidence bundle passes the inquiry through later. Checking here means a question
        that would be refused as evidence is refused *before* it is asked, rather than after a
        provider has already seen it.
        """
        return ResearchTrace(inquiry, planned=True).inquiry

    def trace(self) -> ResearchTrace:
        return ResearchTrace(self.inquiry, planned=True)

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
                "wrong, and must serve the supplied Brief. Start from its central explanatory "
                "question: seek the causal mechanism, useful distinctions and qualifications in "
                "original primary sources. Ask for figures or dates only when necessary to explain "
                "that question; numerical trivia must not displace the mechanism. At most "
                f"{MAX_PLANNED_QUESTIONS}. Do not answer them.",
                {"brief": brief.to_mapping()},
            )
        except (ContractViolation, RoleUnavailable):
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
        try:
            return self._safe_inquiry(tuple(planned[:MAX_PLANNED_QUESTIONS]))
        except ContractViolation:
            return ()


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
            'Return one JSON object with exactly these keys: "schemaVersion": 1 (integer), '
            '"angle": string, "hook": string, "beats": an array of objects with exactly '
            '"id": string, "text": string, "claimIds": array of supplied claim ID strings, '
            '"factual": boolean. Every factual statement must cite supporting supplied claim IDs; '
            'do not label a factual claim false to evade citations. Beat text is spoken verbatim: '
            'no stage directions, image descriptions, citation markers or production instructions. '
            'hook describes editorial intent, not additional spoken text. Put ALL spoken text, '
            'including the opening hook, in beats. Nothing will be added at TTS. '
            'If evidence cannot support the explanation, return only {"insufficientEvidence": '
            '["specific missing fact"]} instead of inventing facts. '
            'Write for the Brief target duration in seconds, allowing natural delivery and pauses. '
            'Choose the number and length of Beats freely from the ideas and their visual potential; '
            'there is no quota of words, Beats, scenes or visual changes. A Beat is a coherent spoken '
            'unit, not necessarily a paragraph. End Beats at complete sentence boundaries so the '
            'Visual Structurer can cut between ideas; rich visual evolution can also happen inside '
            'one Beat on word anchors. Build curiosity, explain concrete relationships, and earn the '
            'ending with an insight. Prefer claims supported by original sources. '
            'Do not expose reasoning.',
            {"brief": brief.to_mapping(), "researchDossier": dossier.to_mapping(),
             **getattr(self, "editorial_context", {})},
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
            "the matching visualVocabulary list. schemaVersion must be the integer 1, never a "
            "string or decimal version. theme is a string. motionIntent, colorRoles, treatments, "
            "motifs and forbiddenTreatments are all arrays of strings, even for a single value. "
            "motionIntent, colorRoles and treatments must not be empty. Use exactly the listed "
            "keys. Do not add provider prompts or raw style values. Choose a coherent artistic "
            "direction that helps explain this subject: recurring motifs, compatible treatments "
            "and purposeful motion. Motifs should describe visible continuity that the visual "
            "roles can carry across wide views, details and diagrams. Stillness and contrast are "
            "creative choices, not failures; do not impose quotas of cuts or effects.",
            {
                "brief": brief.to_mapping(),
                "researchDossier": dossier.to_mapping(),
                "visualVocabulary": vocabulary.to_mapping(),
                **getattr(self, "editorial_context", {}),
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
        *,
        feedback: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        return await self.role.ask(
            "Return only visual-structure JSON. Preserve Narrative Beats verbatim. Select only "
            "published component IDs and write section/scene ids and spansBeats. Scene objects "
            "must contain exactly id, component, spansBeats; never write props. If no published "
            "component can honestly carry the story, do not substitute a loose fit and do not "
            "name an unpublished component: answer instead with a single unservable object "
            "holding summary, unmetNeed and catalogGap, and nothing else. The normal response "
            'has exactly two top-level keys: "beats" and "sections". beats must be an array '
            'of objects with only id and text copied from narrative.beats. Each section must '
            'have id, spansBeats (an array of beat ID strings), and scenes (an array). Every '
            'scene spansBeats is also an array of beat ID strings, never Beat objects. Do not '
            'add schemaVersion, theme, factual or claimIds. Partition the ordered beats among '
            'the sections and scenes without duplicates. The upstream creative envelope is the '
            'target duration and optional maximum generated-image count, never a required count. '
            'Choose the number of scenes freely. Image count and scene count are different: reuse '
            'an asset when useful, and allow several meaningful events inside a scene. Select '
            'capabilities whose published actions can show what the narration explains. Use titles '
            'as brief introductions to an idea; avoid holding a title while the voice explains '
            'unpictured mechanisms. A process need not be a dated timeline or an isolated number. '
            'Plan progression between establishing views, details, comparisons and resolutions as '
            'the subject warrants. Respect the VisualBible. Do not invent quantitative charts. '
            'When editorialFeedback is supplied, revise the structure to address its observations '
            'while preserving every Narrative Beat and the catalog boundary.',
            {
                "brief": brief.to_mapping(),
                "researchDossier": dossier.to_mapping(),
                "narrative": narrative.to_mapping(),
                "visualBible": visual_bible.to_mapping(),
                "selectionCatalog": list(selection_catalog),
                "editorialFeedback": feedback,
            },
        )


def _adk_visual_tools(
    tools: VisualCatalogTools, *, include_search: bool
) -> tuple[Callable[..., Any], ...]:
    """Bind the role-neutral ADK wrappers for one role's allowed catalog tools."""

    def searchScenes(intent: str = "") -> list[dict[str, Any]]:
        """Search compact published SceneCapabilities by editorial intent."""
        return list(tools.search_scenes(intent))

    def getSceneSpec(capability_id: str) -> dict[str, Any]:
        """Read one full SceneCapability specification available to this role."""
        return tools.get_scene_spec(capability_id)

    def validateScene(instance: Mapping[str, Any]) -> Mapping[str, Any]:
        """Validate one SceneInstance and return structured findings."""
        return tools.validate_scene(instance)

    def validateVideoPlan(plan: Mapping[str, Any]) -> Mapping[str, Any]:
        """Validate one VideoPlan and return structured findings."""
        return tools.validate_video_plan(plan)

    shared = (getSceneSpec, validateScene, validateVideoPlan)
    return (searchScenes, *shared) if include_search else shared


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
        *,
        context: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        return await self.role.ask(
            "Return only JSON with a scenes array. Fill each existing scene id exactly once. "
            "Each fill may contain only id, props, layout, motionProfile, events. Do not add, "
            "remove, or select scenes. Use the four offered catalog tools when needed. Make the "
            "explanation itself visible: use published actions to reveal a relationship, advance "
            "a process, focus a detail or change state on the word that motivates it. Read the "
            "capability's initial state and event semantics: omit an action that merely repeats "
            "the initial or current state. A default whole-image framing needs no focus event "
            "until a different region is requested. Schema validation alone does not prove an "
            "event changes anything. Read the "
            "Beats in structure; author symbolic anchors only, in spoken order, using unique words "
            "within each Beat. Leave time to read and understand; do not animate every word or "
            "satisfy a quota of effects. Follow editorialContext and the VisualBible across scenes. "
            "Describe coherent assets with deliberate orientation and framing. Reuse the same "
            "semantic requirement and identityKey for the same image; different views need distinct "
            "requirements. A flattened illustration cannot articulate its parts. Never invent "
            "actions or pretend that camera drift demonstrates a mechanism. Keep physical time, "
            "asset paths and provider prompts out of the plan.",
            {"structure": dict(structure), "specifications": list(specifications),
             "editorialContext": dict(context or {})},
            tools=_adk_visual_tools(tools, include_search=True),
        )


class AdkEditorialReviewer:
    """Reviews the authored plan against its narration, not a generic pacing recipe."""

    def __init__(self, *, model: str = CREW_MODEL, session_service: Any | None = None) -> None:
        self.role = AdkJsonRole(
            "EditorialReviewer", "Reviews visual storytelling before production spends on media.",
            model=model, session_service=session_service,
        )

    async def review(
        self, plan: Mapping[str, Any], context: Mapping[str, Any],
        specifications: tuple[dict[str, Any], ...],
    ) -> Mapping[str, Any]:
        return await self.role.ask(
            'Return only {"accepted": boolean, "observations": an array of '
            '{"sceneId": string or null, "problem": string, "suggestion": string}}. '
            'Accept with an empty array, or reject with concrete blocking editorial observations. '
            'Assess whether the planned visuals explain the spoken ideas, the story develops '
            'curiosity and resolves it, and the visual direction carries across scenes. Read '
            'the selected specifications to understand what each event actually changes. '
            'Notice title cards held across unrelated explanations, decorative motion mistaken '
            'for explanation, unsupported image precision, or anchors that miss useful changes '
            'of state. Preserve deliberate stillness and reading pauses. There is no required '
            'number of Beats, scenes, words, images, cuts or events, nor a universal time limit '
            'for a title or hold. The duration target is an estimate; the image maximum is a '
            'ceiling, not a target. Recommend only remedies possible with the published vocabulary '
            'or ask the Structurer to reconsider selection. Do not rewrite the plan or narration. '
            'You have a semantic plan, not rendered frames, generated images or audio: do not '
            'claim to have watched or heard the film or measured its duration. Return concise '
            'observable problems and remedies, not private reasoning.',
            {"plan": dict(plan), "editorialContext": dict(context),
             "specifications": list(specifications)},
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
        refusal: PlanRefusal,
        specifications: tuple[JsonObject, ...],
        tools: VisualCatalogTools,
    ) -> Mapping[str, Any]:
        return await self.role.ask(
            "Return only JSON with a scenes array holding every scene of the supplied plan, "
            "repaired where the findings name it and unchanged everywhere else. Each entry may "
            "contain only id, props, layout, motionProfile, events. Do not add, remove, reorder "
            "or re-select scenes, and never change a scene's component. Repair only what the "
            "findings name, and return every other scene exactly as it was supplied. "
            "checkMeanings explains the code each finding carries.",
            {
                "plan": dict(plan),
                "findings": [dict(finding) for finding in refusal.findings],
                "checkMeanings": dict(refusal.check_meanings),
                "specifications": list(specifications),
            },
            tools=_adk_visual_tools(tools, include_search=False),
        )


class AdkImageCreator:
    """Interprets one unresolved visual task and answers whether it wants a generated image.

    This is the whole of the role, and the narrowness is the design rather than a first cut — the
    reasoning is on the `ImageCreator` protocol in `image_generation.py`. What is left to a model here is
    one judgement: a placeholder can be a genuine editorial need for an image, or it can be
    something a scene will carry perfectly well without one, and generating for the second spends
    money to make a film slightly worse.

    It answers about one requirement, sees no other, derives no prompt and reaches no provider.
    An unreadable answer means yes: the safe direction is the behaviour the worklist had before
    this role existed, because a Run that silently skipped a needed image would produce a film
    with a hole in it that no finding names.

    "Sees no other" is the session, not only the payload. The role is built with
    `remembers_turns=False` so requirement *N* is judged in a session that holds requirements
    1..*N-1*'s questions and answers — an isolation that a shared session would leave true of the
    message and false of the context the model actually reads.
    """

    def __init__(self, *, model: str = CREW_MODEL, session_service: Any | None = None) -> None:
        self.role = AdkJsonRole(
            "ImageCreatorAgent",
            "Judges whether one unresolved visual requirement needs a generated image.",
            model=model,
            session_service=session_service,
            remembers_turns=False,
        )

    async def needs_image(self, requirement: AssetRequirement) -> bool:
        try:
            answer = await self.role.ask(
                "Return only JSON: {\"needsImage\": true|false}. The supplied "
                "requirement is one unresolved visual slot in a factual explainer. Answer false "
                "only when the scene reads at least as well without a generated image — a decorative "
                "backdrop, a subject a caption already carries, an abstraction a photograph would "
                "misrepresent. Answer true whenever the slot carries information. Do not write a "
                "prompt, describe an image, or judge any other requirement.",
                {"assetRequirement": requirement.to_mapping()},
            )
        except (ContractViolation, RoleUnavailable):
            return True
        # Anything but an explicit `false` is a yes; `ask` has already refused a non-object.
        return answer.get("needsImage") is not False


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
    "AdkEditorialReviewer",
    "AdkImageCreator",
    "AdkJsonRole",
    "AdkPlanRepair",
    "AdkResearchAgent",
    "AdkSceneAuthor",
    "AdkVisualStructurer",
    "create_adk_director",
]
