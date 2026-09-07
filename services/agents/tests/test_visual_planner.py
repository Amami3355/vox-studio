"""The role-split planner consumes generated catalog projections, never a crew-owned list."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest

from vox_crew.crew_contract import (
    Brief,
    ContractViolation,
    Narrative,
    ResearchDossier,
    UnservableBrief,
    VisualBible,
    VisualVocabulary,
)
from vox_crew.visual_planner import (
    PublishedCatalog,
    SplitVisualPlanner,
    VisualCatalogTools,
    trusted_palettes,
    visual_vocabulary,
)


FIXTURES = Path(__file__).parent / "fixtures"


def catalog_contract() -> dict[str, Any]:
    envelope = json.loads((FIXTURES / "contract-show-catalog.stdout").read_text("utf-8"))
    return envelope["data"]["contract"]


def inputs() -> tuple[Brief, ResearchDossier, Narrative, VisualBible]:
    brief = Brief.from_mapping({"id": "brief-1", "text": "Explain a divergence.", "kind": "factual"})
    dossier = ResearchDossier.from_mapping(
        {
            "schemaVersion": 1,
            "mode": "researched",
            "sources": [{"id": "s1", "title": "Source", "url": "https://example.test"}],
            "claims": [
                {
                    "id": "c1",
                    "text": "The baselines diverged.",
                    "sourceIds": ["s1"],
                    "support": "supported",
                }
            ],
            "statistics": [],
            "quotations": [],
            "contradictions": [],
            "visualOpportunities": [],
        }
    )
    narrative = Narrative.from_mapping(
        {
            "schemaVersion": 1,
            "angle": "Start with the assumptions.",
            "hook": "Two baselines, two outcomes.",
            "beats": [
                {
                    "id": "b1",
                    "text": "The baselines diverged.",
                    "claimIds": ["c1"],
                    "factual": True,
                }
            ],
        },
        dossier,
    )
    vocabulary = VisualVocabulary(
        themes=frozenset({"editorial-cold"}),
        motion_intents=frozenset({"measured"}),
        color_roles=frozenset({"accent"}),
        treatments=frozenset({"documentary"}),
    )
    bible = VisualBible.from_mapping(
        {
            "schemaVersion": 1,
            "theme": "editorial-cold",
            "motionIntent": ["measured"],
            "colorRoles": ["accent"],
            "treatments": ["documentary"],
            "motifs": [],
            "forbiddenTreatments": [],
        },
        vocabulary,
    )
    return brief, dossier, narrative, bible


def structure() -> dict[str, Any]:
    return {
        "beats": [{"id": "b1", "text": "The baselines diverged."}],
        "sections": [
            {
                "id": "opening",
                "spansBeats": ["b1"],
                "scenes": [
                    {"id": "claim", "component": "typographic_statement", "spansBeats": ["b1"]}
                ],
            }
        ],
    }


class Structurer:
    def __init__(self, answer: dict[str, Any] | None = None) -> None:
        self.answer = answer or structure()
        self.selection: tuple[dict[str, Any], ...] = ()

    async def structure(self, *args: Any) -> dict[str, Any]:
        self.selection = args[-1]
        return self.answer


class SceneAuthor:
    def __init__(self, answer: dict[str, Any] | None = None) -> None:
        self.answer = answer or {
            "scenes": [
                {
                    "id": "claim",
                    "props": {"statement": "The baselines diverged."},
                    "layout": "cut",
                    "motionProfile": "editorialStatic",
                    "events": [{"at": "b1.start", "action": "revealStatement"}],
                }
            ]
        }
        self.specifications: tuple[dict[str, Any], ...] = ()
        self.tool_names: tuple[str, ...] = ()

    async def author(self, _structure: dict[str, Any], specifications: tuple[dict[str, Any], ...], tools: VisualCatalogTools) -> dict[str, Any]:
        self.specifications = specifications
        self.tool_names = tools.names
        return self.answer


def green(_value: dict[str, Any]) -> dict[str, Any]:
    return {"ok": True, "errors": [], "warnings": []}


def test_the_contract_tiers_reconstruct_every_capability_by_byte_identical_selection() -> None:
    contract = catalog_contract()
    catalog = PublishedCatalog.from_mapping(contract)

    compact = catalog.for_role("visualStructurer")
    assert len(compact) == len(contract["capabilities"])
    assert set(compact[0]) == set(contract["capabilityTiers"]["selection"]["fields"])
    assert "propsSchema" not in compact[0]

    full = catalog.for_role("sceneAuthor", ["typographic_statement"])
    canonical = next(item for item in contract["capabilities"] if item["id"] == "typographic_statement")
    assert full == (canonical,)


def test_the_split_planner_holds_each_role_to_its_side_of_the_seam() -> None:
    structurer = Structurer()
    author = SceneAuthor()
    planner = SplitVisualPlanner(
        PublishedCatalog.from_mapping(catalog_contract()),
        structurer,
        author,
        validate_scene=green,
        validate_plan=green,
    )

    plan = asyncio.run(planner.plan(*inputs()))

    assert all("propsSchema" not in item for item in structurer.selection)
    assert [item["id"] for item in author.specifications] == ["typographic_statement"]
    assert author.tool_names == (
        "searchScenes",
        "getSceneSpec",
        "validateScene",
        "validateVideoPlan",
    )
    assert plan["beats"] == structure()["beats"]
    assert plan["sections"][0]["scenes"] == [
        {
            "id": "claim",
            "component": "typographic_statement",
            "spansBeats": ["b1"],
            "props": {"statement": "The baselines diverged."},
            "layout": "cut",
            "motionProfile": "editorialStatic",
            "events": [{"at": "b1.start", "action": "revealStatement"}],
        }
    ]


@pytest.mark.parametrize(
    "answer, message",
    [
        ({**structure(), "sections": [{**structure()["sections"][0], "props": {}}]}, "unknown fields"),
        (
            {"beats": structure()["beats"], "sections": [{**structure()["sections"][0], "scenes": [{**structure()["sections"][0]["scenes"][0], "component": "not_published"}]}]},
            "not published",
        ),
    ],
)
def test_a_structurer_cannot_fill_props_or_name_an_unpublished_capability(answer: dict[str, Any], message: str) -> None:
    planner = SplitVisualPlanner(
        PublishedCatalog.from_mapping(catalog_contract()),
        Structurer(answer),
        SceneAuthor(),
        validate_scene=green,
        validate_plan=green,
    )

    with pytest.raises(ContractViolation, match=message):
        asyncio.run(planner.plan(*inputs()))


def test_a_scene_author_cannot_add_or_change_a_scene() -> None:
    answer = {
        "scenes": [
            {"id": "claim", "props": {"statement": "ok"}},
            {"id": "extra", "props": {"statement": "not allowed"}},
        ]
    }
    planner = SplitVisualPlanner(
        PublishedCatalog.from_mapping(catalog_contract()),
        Structurer(),
        SceneAuthor(answer),
        validate_scene=green,
        validate_plan=green,
    )

    with pytest.raises(ContractViolation, match="exactly the structured scene ids"):
        asyncio.run(planner.plan(*inputs()))


def test_full_spec_lookup_is_fail_closed_to_the_selected_capabilities() -> None:
    catalog = PublishedCatalog.from_mapping(catalog_contract())
    tools = VisualCatalogTools(catalog, frozenset({"quote"}), green, green)

    assert tools.get_scene_spec("quote")["id"] == "quote"
    with pytest.raises(ContractViolation, match="was not selected"):
        tools.get_scene_spec("bar_chart")



def test_the_art_directors_vocabulary_is_the_one_the_catalog_publishes() -> None:
    """Read from the contract, so a treatment the compiler refuses cannot be offered."""
    vocabulary = visual_vocabulary(catalog_contract())

    published = catalog_contract()["visualVocabulary"]
    assert vocabulary.themes == frozenset(published["themes"])
    assert vocabulary.motion_intents == frozenset(published["motionIntents"])
    assert vocabulary.color_roles == frozenset(published["colorRoles"])
    assert vocabulary.treatments == frozenset(published["treatments"])


@pytest.mark.parametrize(
    "damage, expected",
    [
        ({}, "catalog.visualVocabulary"),
        ({"visualVocabulary": {"themes": [], "motionIntents": ["a"], "colorRoles": ["b"], "treatments": ["c"]}}, "must not be empty"),
        ({"visualVocabulary": {"themes": ["a", "a"], "motionIntents": ["a"], "colorRoles": ["b"], "treatments": ["c"]}}, "unique values"),
        ({"visualVocabulary": {"themes": ["a"], "motionIntents": ["a"], "colorRoles": ["b"], "treatments": ["c"], "extra": []}}, "catalog.visualVocabulary"),
    ],
)
def test_an_unusable_vocabulary_is_refused_rather_than_half_read(
    damage: dict[str, Any], expected: str
) -> None:
    contract = catalog_contract()
    contract.pop("visualVocabulary")
    contract.update(damage)

    with pytest.raises(ContractViolation, match=expected):
        visual_vocabulary(contract)


def test_the_palettes_the_prompt_composes_against_are_the_ones_design_publishes() -> None:
    """Raw colour reaches the deterministic tool, and it comes from the contract."""
    design = json.loads((FIXTURES / "contract-show-design.stdout").read_text("utf-8"))
    published = design["data"]["contract"]["palettes"]

    palettes = trusted_palettes(design["data"]["contract"])

    assert palettes == published
    assert all(
        color.startswith("#") and len(color) == 7
        for roles in palettes.values()
        for color in roles.values()
    )


@pytest.mark.parametrize(
    "damage, expected",
    [
        ({"palettes": {}}, "publishes no theme"),
        ({"palettes": {"editorial-cold": {}}}, "resolves no colour role"),
        ({"palettes": {"editorial-cold": {"neutral": "orange"}}}, "#rrggbb"),
    ],
)
def test_a_palette_that_is_not_one_is_refused(damage: dict[str, Any], expected: str) -> None:
    """A composed prompt is only deterministic if what it composes against is exact."""
    with pytest.raises(ContractViolation, match=expected):
        trusted_palettes(damage)


def test_a_structurer_with_no_honest_capability_raises_a_refusal_not_a_contract_violation() -> None:
    """US51: a missing suitable SceneCapability becomes a finding, so US19's Decline is reachable.

    The distinction is the whole point. `ContractViolation` ends the Run `failed`; `UnservableBrief`
    is what `ProductionCrew.run` catches to publish a structured Decline. Before the finding
    existed, a role that could not serve the Brief had no way to say so that was not a malformed
    answer, and an honest refusal arrived as a defect.
    """
    structurer = Structurer(
        {
            "unservable": {
                "summary": "The catalog cannot show the required geographic route.",
                "unmetNeed": "A geographic route across three cities",
                "catalogGap": "No published SceneCapability represents a map.",
            }
        }
    )
    author = SceneAuthor()
    planner = SplitVisualPlanner(
        PublishedCatalog.from_mapping(catalog_contract()),
        structurer,
        author,
        validate_scene=green,
        validate_plan=green,
    )

    with pytest.raises(UnservableBrief) as refusal:
        asyncio.run(planner.plan(*inputs()))

    assert refusal.value.unmet_need == "A geographic route across three cities"
    assert refusal.value.catalog_gap == "No published SceneCapability represents a map."
    # The refusal stops the crew before it pays the Scene Author for a plan it just refused.
    assert author.specifications == ()


def test_a_refusal_is_read_as_strictly_as_a_structure() -> None:
    """A finding is a published shape, not free text: an under-filled one is still a violation."""
    planner = SplitVisualPlanner(
        PublishedCatalog.from_mapping(catalog_contract()),
        Structurer({"unservable": {"summary": "No map.", "unmetNeed": "A route"}}),
        SceneAuthor(),
        validate_scene=green,
        validate_plan=green,
    )

    with pytest.raises(ContractViolation, match="catalogGap"):
        asyncio.run(planner.plan(*inputs()))


def test_naming_an_unpublished_capability_stays_a_violation_and_never_widens_the_projection() -> None:
    """ADR-0019: an unavailable selection is a finding, not permission to widen the role's view.

    So the refusal above is the way to say it, and inventing an id remains what it always was.
    """
    planner = SplitVisualPlanner(
        PublishedCatalog.from_mapping(catalog_contract()),
        Structurer(
            {
                "beats": [{"id": "b1", "text": "The baselines diverged."}],
                "sections": [
                    {
                        "id": "opening",
                        "spansBeats": ["b1"],
                        "scenes": [{"id": "claim", "component": "map_route", "spansBeats": ["b1"]}],
                    }
                ],
            }
        ),
        SceneAuthor(),
        validate_scene=green,
        validate_plan=green,
    )

    with pytest.raises(ContractViolation, match="map_route"):
        asyncio.run(planner.plan(*inputs()))
