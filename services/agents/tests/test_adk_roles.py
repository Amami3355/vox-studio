"""ADK role construction and the Visual Planner's exact tool boundary, without credentials."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from vox_crew.adk_roles import (
    AdkCreativeAdapter,
    AdkImageCreator,
    AdkJsonRole,
    AdkPlanRepair,
    AdkSceneAuthor,
    RoleUnavailable,
    create_adk_director,
)
from vox_crew.crew_contract import Brief, ResearchDossier, VisualVocabulary
from vox_crew.image_generation import AssetRequirement
from vox_crew.visual_planner import PlanRefusal, VisualCatalogTools


def test_creative_roles_are_named_adk_agents_and_construct_without_a_key() -> None:
    roles = AdkCreativeAdapter(model="test-model")

    narrative = roles.narrative_agent.agent("Return JSON.")
    art = roles.art_director_agent.agent("Return JSON.")

    assert narrative.name == "NarrativeAgent"
    assert art.name == "ArtDirectorAgent"
    assert narrative.model == art.model == "test-model"


def test_scene_author_offers_exactly_the_four_catalog_tools() -> None:
    author = AdkSceneAuthor(model="test-model")
    seen: list[str] = []

    async def ask(instruction, payload, *, tools=()):
        seen.extend(tool.__name__ for tool in tools)
        return {"scenes": []}

    author.role.ask = ask
    tools = VisualCatalogTools.__new__(VisualCatalogTools)
    tools.search_scenes = lambda intent="": ()
    tools.get_scene_spec = lambda capability_id: {}
    tools.validate_scene = lambda instance: {"ok": True}
    tools.validate_video_plan = lambda plan: {"ok": True}

    asyncio.run(author.author({"beats": [], "sections": []}, (), tools))

    assert seen == ["searchScenes", "getSceneSpec", "validateScene", "validateVideoPlan"]


def test_plan_repair_reuses_the_visual_tools_without_acquiring_search() -> None:
    repair = AdkPlanRepair(model="test-model")
    seen: list[str] = []

    async def ask(instruction, payload, *, tools=()):
        seen.extend(tool.__name__ for tool in tools)
        return {"scenes": []}

    repair.role.ask = ask
    tools = VisualCatalogTools.__new__(VisualCatalogTools)
    tools.get_scene_spec = lambda capability_id: {}
    tools.validate_scene = lambda instance: {"ok": True}
    tools.validate_video_plan = lambda plan: {"ok": True}
    refusal = PlanRefusal(findings=(), capability_ids=(), summary="", check_meanings={})

    asyncio.run(repair.repair({}, refusal, (), tools))

    assert seen == ["getSceneSpec", "validateScene", "validateVideoPlan"]


def test_plan_repair_is_told_what_the_codes_that_refused_it_mean() -> None:
    """spec.md:246 gives repair the published check meanings, not the bare codes."""
    repair = AdkPlanRepair(model="test-model")
    sent: dict[str, Any] = {}

    async def ask(instruction, payload, *, tools=()):
        sent.update(payload)
        return {"scenes": []}

    repair.role.ask = ask
    tools = VisualCatalogTools.__new__(VisualCatalogTools)
    tools.get_scene_spec = lambda capability_id: {}
    tools.validate_scene = lambda instance: {"ok": True}
    tools.validate_video_plan = lambda plan: {"ok": True}
    meanings = {
        "INVALID_PROPS": {
            "code": "INVALID_PROPS",
            "regime": "error",
            "means": "A scene property does not satisfy the selected capability schema.",
            "repair": "Use the reported field and expected values to make props match that schema.",
        }
    }
    refusal = PlanRefusal(
        findings=({"where": "sceneInstance"},),
        capability_ids=("typographic_statement",),
        summary="refused",
        check_meanings=meanings,
    )

    asyncio.run(repair.repair({}, refusal, (), tools))

    assert sent["checkMeanings"] == meanings


def test_director_is_a_resumable_custom_adk_workflow_with_named_children() -> None:
    class EmptyCrew:
        async def run(self, brief, policy):
            if False:
                yield None

    children = [
        AdkJsonRole(name, f"{name} role", model="test-model").agent("Return JSON.")
        for name in (
            "ResearchAgent",
            "NarrativeAgent",
            "ArtDirectorAgent",
            "VisualStructurer",
            "SceneAuthor",
            "ImageCreatorAgent",
        )
    ]

    director = create_adk_director(EmptyCrew(), sub_agents=children)

    assert director.name == "Director"
    assert director.rerun_on_resume is True
    assert [agent.name for agent in director.sub_agents] == [
        "ResearchAgent",
        "NarrativeAgent",
        "ArtDirectorAgent",
        "VisualStructurer",
        "SceneAuthor",
        "ImageCreatorAgent",
    ]


def test_the_art_director_payload_carries_the_closed_vocabulary_its_instruction_names() -> None:
    """The instruction says "the closed vocabulary in visualVocabulary". It has to be there.

    This is the regression test for a role being told to obey a list it could not read: the
    payload held only the Brief and the dossier, so the model guessed a theme name and a wrong
    guess ended the Run at the contract gate.
    """
    roles = AdkCreativeAdapter(model="test-model")
    seen: dict[str, object] = {}

    async def ask(instruction, payload, *, tools=()):
        seen["instruction"] = instruction
        seen["payload"] = payload
        return {"schemaVersion": 1}

    roles.art_director_agent.ask = ask
    vocabulary = VisualVocabulary(
        themes=frozenset({"editorial-cold"}),
        motion_intents=frozenset({"pushIn", "editorialStatic"}),
        color_roles=frozenset({"neutral"}),
        treatments=frozenset({"photo"}),
    )
    brief = Brief.from_mapping({"id": "brief-1", "text": "Explain it.", "kind": "factual"})
    dossier = ResearchDossier.from_mapping(
        {
            "schemaVersion": 1,
            "mode": "not_required",
            "sources": [],
            "claims": [],
            "statistics": [],
            "quotations": [],
            "contradictions": [],
            "visualOpportunities": [],
        }
    )

    asyncio.run(roles.art_direct(brief, dossier, vocabulary))

    payload = seen["payload"]
    assert payload["visualVocabulary"] == vocabulary.to_mapping()
    assert payload["visualVocabulary"]["motionIntents"] == ["editorialStatic", "pushIn"]
    assert "visualVocabulary" in seen["instruction"]


def test_image_creator_degrades_role_failures_but_does_not_swallow_programming_errors() -> None:
    requirement = AssetRequirement.from_mapping(
        {
            "type": "image",
            "subject": "the last bus",
            "treatment": "photo",
            "orientation": "landscape",
        }
    )

    async def unavailable(*_args, **_kwargs):
        raise RoleUnavailable("provider failed")

    creator = AdkImageCreator.__new__(AdkImageCreator)
    creator.role = type("Role", (), {"ask": unavailable})()
    assert asyncio.run(creator.needs_image(requirement)) is True

    async def broken(*_args, **_kwargs):
        raise AssertionError("broken adapter")

    creator.role = type("Role", (), {"ask": broken})()
    with pytest.raises(AssertionError, match="broken adapter"):
        asyncio.run(creator.needs_image(requirement))


def test_a_role_turn_degrades_provider_failure_and_lets_crew_bugs_out() -> None:
    """The real `ask`, not a stubbed one — the test above proves this only of its own stub.

    A provider that fails mid-turn is `RoleUnavailable` and every caller degrades. A crew bug
    while building the framework objects must not wear the same coat: a role that answered its
    safe default on every Run because of a mistake in this file would be silent.
    """
    role = AdkJsonRole("ImageCreatorAgent", "role", model="test-model")

    class Session:
        id = "session-1"

    class FailingSessions:
        async def create_session(self, **_kwargs):
            return Session()

    role.session_service = FailingSessions()
    role.agent = lambda instruction, tools=(): (_ for _ in ()).throw(TypeError("crew bug"))

    with pytest.raises(TypeError, match="crew bug"):
        asyncio.run(role.ask("Return JSON.", {}))

    class UnavailableSessions:
        async def create_session(self, **_kwargs):
            raise ConnectionError("no session service")

    # A fresh role: the turn above already cached a session id on the first one.
    unreachable = AdkJsonRole("ImageCreatorAgent", "role", model="test-model")
    unreachable.session_service = UnavailableSessions()

    with pytest.raises(RoleUnavailable):
        asyncio.run(unreachable.ask("Return JSON.", {}))


def test_the_image_creator_judges_each_requirement_in_its_own_session() -> None:
    """Ticket 04: "one bounded task per invocation, never the worklist".

    A shared session bounds the payload and not the context: requirement N would be judged with
    every earlier requirement's question and answer still in the conversation.
    """
    creator = AdkImageCreator(model="test-model")
    other = AdkSceneAuthor(model="test-model")

    assert creator.role.remembers_turns is False
    assert other.role.remembers_turns is True

    opened: list[str] = []

    class Sessions:
        async def create_session(self, **_kwargs):
            opened.append(f"session-{len(opened)}")
            return type("Session", (), {"id": opened[-1]})()

    creator.role.session_service = Sessions()

    assert asyncio.run(creator.role._session_for_turn()) == "session-0"
    assert asyncio.run(creator.role._session_for_turn()) == "session-1"
    assert creator.role.session_id is None
