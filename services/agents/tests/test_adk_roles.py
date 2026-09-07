"""ADK role construction and the Visual Planner's exact tool boundary, without credentials."""

from __future__ import annotations

import asyncio

from vox_crew.adk_roles import AdkCreativeAdapter, AdkJsonRole, AdkSceneAuthor, create_adk_director
from vox_crew.crew_contract import Brief, ResearchDossier, VisualVocabulary
from vox_crew.visual_planner import VisualCatalogTools


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
