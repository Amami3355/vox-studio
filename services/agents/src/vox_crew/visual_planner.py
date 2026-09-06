"""Role-scoped visual planning over the catalog Production actually published.

The catalog contract owns tier membership.  This module only selects the declared fields and
capabilities, so adding a field or capability cannot be hidden behind a crew-maintained summary.
The structurer writes immutable plan structure; the scene author fills only those scene slots.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Protocol

from .crew_contract import (
    Brief,
    ContractViolation,
    Narrative,
    ProviderMode,
    ResearchDossier,
    VisualBible,
    VisualVocabulary,
)


JsonObject = dict[str, Any]
_HEX = re.compile(r"#[0-9a-fA-F]{6}")
Validator = Callable[[Mapping[str, Any]], Mapping[str, Any]]


def _object(value: Any, what: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ContractViolation(f"{what} must be an object.")
    return value


def _strict(value: Mapping[str, Any], allowed: set[str], what: str) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ContractViolation(f"{what} has unknown fields: {', '.join(unknown)}.")


def _array(value: Any, what: str) -> Sequence[Any]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise ContractViolation(f"{what} must be an array.")
    return value


def _name(value: Any, what: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractViolation(f"{what} must be a non-empty string.")
    return value


@dataclass(frozen=True, slots=True)
class PublishedCatalog:
    """A validated catalog and its contract-owned role projection rules."""

    capabilities: tuple[JsonObject, ...]
    tier_fields: Mapping[str, tuple[str, ...]]
    role_projections: Mapping[str, tuple[tuple[str, ...], str]]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> PublishedCatalog:
        value = _object(value, "catalog contract")
        capabilities_value = _array(value.get("capabilities"), "catalog.capabilities")
        if not capabilities_value:
            raise ContractViolation("catalog.capabilities must not be empty.")

        capabilities: list[JsonObject] = []
        ids: list[str] = []
        for index, item in enumerate(capabilities_value):
            capability = dict(_object(item, f"catalog.capabilities[{index}]"))
            capability_id = _name(capability.get("id"), f"catalog.capabilities[{index}].id")
            capabilities.append(deepcopy(capability))
            ids.append(capability_id)
        if len(ids) != len(set(ids)):
            raise ContractViolation("catalog capabilities must use unique ids.")

        tiers_value = _object(value.get("capabilityTiers"), "catalog.capabilityTiers")
        tier_fields: dict[str, tuple[str, ...]] = {}
        seen_fields: set[str] = set()
        for tier_name, tier_value in tiers_value.items():
            tier = _object(tier_value, f"catalog.capabilityTiers.{tier_name}")
            _strict(tier, {"fields"}, f"catalog.capabilityTiers.{tier_name}")
            fields = tuple(
                _name(field, f"catalog.capabilityTiers.{tier_name}.fields")
                for field in _array(
                    tier.get("fields"), f"catalog.capabilityTiers.{tier_name}.fields"
                )
            )
            if not fields or len(fields) != len(set(fields)):
                raise ContractViolation(f"catalog tier {tier_name} must name unique fields.")
            overlap = seen_fields.intersection(fields)
            if overlap:
                raise ContractViolation(
                    f"catalog tiers must be disjoint; repeated fields: {', '.join(sorted(overlap))}."
                )
            seen_fields.update(fields)
            tier_fields[_name(tier_name, "catalog tier name")] = fields

        canonical_fields = {field for capability in capabilities for field in capability}
        if seen_fields != canonical_fields:
            raise ContractViolation("catalog tiers must reconstruct every canonical capability field.")

        roles_value = _object(value.get("roleProjections"), "catalog.roleProjections")
        roles: dict[str, tuple[tuple[str, ...], str]] = {}
        for role_name, role_value in roles_value.items():
            role = _object(role_value, f"catalog.roleProjections.{role_name}")
            _strict(
                role,
                {"tiers", "capabilitySelection"},
                f"catalog.roleProjections.{role_name}",
            )
            role_tiers = tuple(
                _name(tier, f"catalog.roleProjections.{role_name}.tiers")
                for tier in _array(
                    role.get("tiers"), f"catalog.roleProjections.{role_name}.tiers"
                )
            )
            if not role_tiers or any(tier not in tier_fields for tier in role_tiers):
                raise ContractViolation(f"catalog role {role_name} names an unknown tier.")
            selection = _name(
                role.get("capabilitySelection"),
                f"catalog.roleProjections.{role_name}.capabilitySelection",
            )
            if selection not in {"all", "selected", "implicated"}:
                raise ContractViolation(f"catalog role {role_name} has an unknown selection rule.")
            roles[_name(role_name, "catalog role name")] = (role_tiers, selection)

        return cls(tuple(capabilities), tier_fields, roles)

    def for_role(
        self, role: str, capability_ids: Sequence[str] = ()
    ) -> tuple[JsonObject, ...]:
        projection = self.role_projections.get(role)
        if projection is None:
            raise ContractViolation(f'The catalog publishes no projection for role "{role}".')
        tiers, selection = projection
        requested = tuple(capability_ids)
        if selection == "all":
            if requested:
                raise ContractViolation(f"The {role} projection always contains all capabilities.")
            selected = self.capabilities
        else:
            if not requested:
                raise ContractViolation(f"The {role} projection requires capability ids.")
            if len(requested) != len(set(requested)):
                raise ContractViolation(f"The {role} projection requires unique capability ids.")
            by_id = {capability["id"]: capability for capability in self.capabilities}
            missing = [capability_id for capability_id in requested if capability_id not in by_id]
            if missing:
                raise ContractViolation(
                    f"Capability {missing[0]} is not published; the role projection cannot widen."
                )
            selected = tuple(by_id[capability_id] for capability_id in requested)

        fields = tuple(field for tier in tiers for field in self.tier_fields[tier])
        return tuple(
            {
                field: deepcopy(capability[field])
                for field in fields
                if field in capability
            }
            for capability in selected
        )

    def capability(self, capability_id: str) -> JsonObject:
        for capability in self.capabilities:
            if capability["id"] == capability_id:
                return deepcopy(capability)
        raise ContractViolation(f'Capability "{capability_id}" is not published.')


def visual_vocabulary(catalog: Mapping[str, Any]) -> VisualVocabulary:
    """The closed vocabulary an Art Director may select from, as the catalog publishes it.

    Read rather than restated for the same reason the capability tiers are: a vocabulary the
    crew kept its own copy of would be a second design system, and the first thing it would do
    is disagree with the compiler about which treatments exist.
    """
    published = _object(
        _object(catalog, "catalog contract").get("visualVocabulary"), "catalog.visualVocabulary"
    )
    _strict(
        published,
        {"themes", "motionIntents", "colorRoles", "treatments"},
        "catalog.visualVocabulary",
    )

    def names(key: str) -> frozenset[str]:
        values = tuple(
            _name(value, f"catalog.visualVocabulary.{key}")
            for value in _array(published.get(key), f"catalog.visualVocabulary.{key}")
        )
        if not values:
            raise ContractViolation(f"catalog.visualVocabulary.{key} must not be empty.")
        if len(values) != len(set(values)):
            raise ContractViolation(f"catalog.visualVocabulary.{key} must name unique values.")
        return frozenset(values)

    return VisualVocabulary(
        themes=names("themes"),
        motion_intents=names("motionIntents"),
        color_roles=names("colorRoles"),
        treatments=names("treatments"),
    )


def trusted_palettes(design: Mapping[str, Any]) -> dict[str, dict[str, str]]:
    """What each published theme resolves its colour roles to, as the contract publishes it.

    The design category is addressed to clients and never assembled into a prompt, which is what
    makes it the right place to read a hex value from: the deterministic tool that composes an
    image request needs one, and no author may ever see one.
    """
    published = _object(
        _object(design, "design contract").get("palettes"), "design.palettes"
    )
    if not published:
        raise ContractViolation("design.palettes publishes no theme.")
    palettes: dict[str, dict[str, str]] = {}
    for theme, roles in published.items():
        resolved = _object(roles, f"design.palettes.{theme}")
        if not resolved:
            raise ContractViolation(f"design.palettes.{theme} resolves no colour role.")
        palette: dict[str, str] = {}
        for role, color in resolved.items():
            if not isinstance(color, str) or not _HEX.fullmatch(color):
                raise ContractViolation(
                    f"design.palettes.{theme}.{role} must be a #rrggbb colour."
                )
            palette[_name(role, f"design.palettes.{theme} role name")] = color
        palettes[_name(theme, "design.palettes theme name")] = palette
    return palettes


class VisualCatalogTools:
    """Exactly four catalog capabilities; none can reach Production or a location."""

    names = ("searchScenes", "getSceneSpec", "validateScene", "validateVideoPlan")
    descriptions = {
        "searchScenes": "Return every compact capability entry, ordered by relevance to an intent.",
        "getSceneSpec": "Return the full published specification of an allowed capability.",
        "validateScene": "Validate one SceneInstance and return structured findings.",
        "validateVideoPlan": "Validate one VideoPlan and return structured findings.",
    }

    def __init__(
        self,
        catalog: PublishedCatalog,
        allowed_spec_ids: frozenset[str],
        validate_scene: Validator,
        validate_plan: Validator,
    ) -> None:
        self._catalog = catalog
        self._allowed_spec_ids = allowed_spec_ids
        self._validate_scene = validate_scene
        self._validate_plan = validate_plan

    def search_scenes(self, intent: str = "") -> tuple[JsonObject, ...]:
        compact = self._catalog.for_role("visualStructurer")
        terms = _tokens(intent)
        ranked = sorted(
            enumerate(compact),
            key=lambda pair: (-_score(pair[1], terms), pair[0]),
        )
        return tuple(deepcopy(entry) for _, entry in ranked)

    def get_scene_spec(self, capability_id: str) -> JsonObject:
        if capability_id not in self._allowed_spec_ids:
            raise ContractViolation(
                f'Capability "{capability_id}" was not selected for this Scene Author.'
            )
        return self._catalog.capability(capability_id)

    def validate_scene(self, instance: Mapping[str, Any]) -> Mapping[str, Any]:
        return self._validate_scene(deepcopy(dict(instance)))

    def validate_video_plan(self, plan: Mapping[str, Any]) -> Mapping[str, Any]:
        return self._validate_plan(deepcopy(dict(plan)))


class VisualStructurer(Protocol):
    async def structure(
        self,
        brief: Brief,
        dossier: ResearchDossier,
        narrative: Narrative,
        visual_bible: VisualBible,
        selection_catalog: tuple[JsonObject, ...],
    ) -> Mapping[str, Any]: ...


class SceneAuthor(Protocol):
    async def author(
        self,
        structure: Mapping[str, Any],
        specifications: tuple[JsonObject, ...],
        tools: VisualCatalogTools,
    ) -> Mapping[str, Any]: ...


class SplitVisualPlanner:
    """Structure first, then fill only the scenes and capabilities already selected."""

    def __init__(
        self,
        catalog: PublishedCatalog,
        structurer: VisualStructurer,
        scene_author: SceneAuthor,
        *,
        validate_scene: Validator,
        validate_plan: Validator,
        mode: ProviderMode = ProviderMode.RECORDED,
    ) -> None:
        self._catalog = catalog
        self._structurer = structurer
        self._scene_author = scene_author
        self._validate_scene = validate_scene
        self._validate_plan = validate_plan
        self.mode = mode

    async def plan(
        self,
        brief: Brief,
        dossier: ResearchDossier,
        narrative: Narrative,
        visual_bible: VisualBible,
    ) -> Mapping[str, Any]:
        selection = self._catalog.for_role("visualStructurer")
        structure = self._structure(
            await self._structurer.structure(
                brief, dossier, narrative, visual_bible, selection
            ),
            narrative,
        )
        selected_ids = _selected_capabilities(structure)
        specifications = self._catalog.for_role("sceneAuthor", selected_ids)
        tools = VisualCatalogTools(
            self._catalog,
            frozenset(selected_ids),
            self._validate_scene,
            self._validate_plan,
        )
        fills = await self._scene_author.author(deepcopy(structure), specifications, tools)
        plan = self._assemble(structure, fills)

        for section in plan["sections"]:
            for scene in section["scenes"]:
                _require_green(tools.validate_scene(scene), f'SceneInstance {scene["id"]}')
        _require_green(tools.validate_video_plan(plan), "VideoPlan")
        return plan

    def _structure(self, value: Mapping[str, Any], narrative: Narrative) -> JsonObject:
        value = _object(value, "visual structure")
        _strict(value, {"beats", "sections"}, "visual structure")
        expected_beats = [{"id": beat.id, "text": beat.text} for beat in narrative.beats]
        if value.get("beats") != expected_beats:
            raise ContractViolation("Visual structure must preserve Narrative Beats verbatim.")

        sections: list[JsonObject] = []
        scene_ids: list[str] = []
        for section_index, section_value in enumerate(
            _array(value.get("sections"), "visual structure.sections")
        ):
            section = _object(section_value, f"visual structure.sections[{section_index}]")
            _strict(
                section,
                {"id", "spansBeats", "persistent", "scenes"},
                f"visual structure.sections[{section_index}]",
            )
            result: JsonObject = {
                "id": _name(section.get("id"), f"visual structure.sections[{section_index}].id"),
                "spansBeats": list(
                    _array(
                        section.get("spansBeats"),
                        f"visual structure.sections[{section_index}].spansBeats",
                    )
                ),
                "scenes": [],
            }
            if "persistent" in section:
                result["persistent"] = deepcopy(
                    list(
                        _array(
                            section.get("persistent"),
                            f"visual structure.sections[{section_index}].persistent",
                        )
                    )
                )
            for scene_index, scene_value in enumerate(
                _array(section.get("scenes"), f"visual structure.sections[{section_index}].scenes")
            ):
                scene = _object(
                    scene_value,
                    f"visual structure.sections[{section_index}].scenes[{scene_index}]",
                )
                _strict(
                    scene,
                    {"id", "component", "spansBeats"},
                    f"visual structure.sections[{section_index}].scenes[{scene_index}]",
                )
                scene_id = _name(scene.get("id"), "structured scene.id")
                component = _name(scene.get("component"), "structured scene.component")
                self._catalog.capability(component)
                scene_ids.append(scene_id)
                result["scenes"].append(
                    {
                        "id": scene_id,
                        "component": component,
                        "spansBeats": list(
                            _array(scene.get("spansBeats"), "structured scene.spansBeats")
                        ),
                    }
                )
            sections.append(result)
        if len(scene_ids) != len(set(scene_ids)):
            raise ContractViolation("Visual structure must use unique scene ids.")
        return {"beats": deepcopy(expected_beats), "sections": sections}

    @staticmethod
    def _assemble(structure: JsonObject, value: Mapping[str, Any]) -> JsonObject:
        value = _object(value, "scene author output")
        _strict(value, {"scenes"}, "scene author output")
        fills: dict[str, JsonObject] = {}
        allowed = {"id", "props", "layout", "motionProfile", "events", "pace"}
        for index, fill_value in enumerate(_array(value.get("scenes"), "scene author output.scenes")):
            fill = _object(fill_value, f"scene author output.scenes[{index}]")
            _strict(fill, allowed, f"scene author output.scenes[{index}]")
            fill_id = _name(fill.get("id"), f"scene author output.scenes[{index}].id")
            if "props" not in fill or not isinstance(fill["props"], Mapping):
                raise ContractViolation(f"scene author output.scenes[{index}].props must be an object.")
            if fill_id in fills:
                raise ContractViolation("Scene Author must fill every structured scene exactly once.")
            fills[fill_id] = deepcopy(dict(fill))

        expected = {
            scene["id"]
            for section in structure["sections"]
            for scene in section["scenes"]
        }
        if set(fills) != expected:
            raise ContractViolation("Scene Author must return exactly the structured scene ids.")

        plan = deepcopy(structure)
        for section in plan["sections"]:
            section["scenes"] = [
                {**scene, **{key: value for key, value in fills[scene["id"]].items() if key != "id"}}
                for scene in section["scenes"]
            ]
        return plan


def _selected_capabilities(structure: Mapping[str, Any]) -> tuple[str, ...]:
    result: list[str] = []
    for section in structure["sections"]:
        for scene in section["scenes"]:
            if scene["component"] not in result:
                result.append(scene["component"])
    return tuple(result)


def _require_green(report: Mapping[str, Any], what: str) -> None:
    if not isinstance(report, Mapping) or report.get("ok") is not True:
        raise ContractViolation(f"{what} was rejected by the published validator.")


_STOP_WORDS = frozenset({"a", "an", "the", "of", "to", "in", "on", "for", "and", "or", "with", "show", "display"})


def _tokens(text: str) -> tuple[str, ...]:
    normalized = "".join(character if character.isalnum() else " " for character in text.lower())
    return tuple(term for term in normalized.split() if len(term) > 2 and term not in _STOP_WORDS)


def _score(entry: Mapping[str, Any], terms: Sequence[str]) -> int:
    haystack = " ".join(
        str(value)
        for value in (
            entry.get("id", ""),
            entry.get("name", ""),
            entry.get("family", ""),
            entry.get("summary", ""),
            *entry.get("useWhen", ()),
        )
    ).lower()
    avoid = " ".join(str(value) for value in entry.get("avoidWhen", ())).lower()
    return sum(2 if term in haystack else -1 if term in avoid else 0 for term in terms)


__all__ = [
    "PublishedCatalog",
    "SceneAuthor",
    "SplitVisualPlanner",
    "VisualCatalogTools",
    "VisualStructurer",
]
