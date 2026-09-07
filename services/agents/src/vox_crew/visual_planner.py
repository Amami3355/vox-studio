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
from enum import Enum
from typing import Any, Protocol

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError

from .crew_contract import (
    Brief,
    ContractViolation,
    Narrative,
    ProviderMode,
    ResearchDossier,
    UnservableBrief,
    VisualBible,
    VisualVocabulary,
)


JsonObject = dict[str, Any]
_HEX = re.compile(r"#[0-9a-fA-F]{6}")
Validator = Callable[[Mapping[str, Any]], Mapping[str, Any]]


class CatalogProjectionRole(str, Enum):
    """The role keys the published catalog projection contract defines."""

    VISUAL_STRUCTURER = "visualStructurer"
    SCENE_AUTHOR = "sceneAuthor"
    PLAN_REPAIR = "planRepair"


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
        self, role: CatalogProjectionRole, capability_ids: Sequence[str] = ()
    ) -> tuple[JsonObject, ...]:
        projection = self.role_projections.get(role.value)
        if projection is None:
            raise ContractViolation(f'The catalog publishes no projection for role "{role.value}".')
        tiers, selection = projection
        requested = tuple(capability_ids)
        if selection == "all":
            if requested:
                raise ContractViolation(
                    f"The {role.value} projection always contains all capabilities."
                )
            selected = self.capabilities
        else:
            if not requested:
                raise ContractViolation(f"The {role.value} projection requires capability ids.")
            if len(requested) != len(set(requested)):
                raise ContractViolation(
                    f"The {role.value} projection requires unique capability ids."
                )
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


class PublishedShapeValidators:
    """Local shape checks over schemas Production published, never compiler semantics.

    ADR-0021 gives these exact-schema checks authority to return a draft to bounded repair or stop
    it before a Run. A green report still defers to `run.validate`: only Production can accept a
    VideoPlan or decide anchors, duration, capacity, assets, and other compiler semantics.
    """

    draft = str(Draft202012Validator.META_SCHEMA["$id"])

    def __init__(
        self,
        catalog: PublishedCatalog,
        plan_contract: Mapping[str, Any],
        checks_contract: Mapping[str, Any],
    ) -> None:
        self._catalog = catalog
        contract = _object(plan_contract, "plan contract")
        plan_schema = _object(contract.get("schema"), "plan.schema")
        if plan_schema.get("$schema") != self.draft:
            raise ContractViolation(
                f"The published VideoPlan schema must declare {self.draft}."
            )
        self._plan_validator = self._validator(plan_schema, "plan.schema")
        self._scene_validator = self._validator(
            _published_scene_tool_schema(plan_schema), "plan.schema SceneInstance tool projection"
        )
        published_errors = _object(
            _object(checks_contract, "checks contract").get("errors"), "checks.errors"
        )
        self._invalid_props_code = _published_check_code(published_errors, "INVALID_PROPS")
        self._malformed_plan_code = _published_check_code(published_errors, "MALFORMED_PLAN")
        self._unknown_capability_code = _published_check_code(
            published_errors, "UNKNOWN_CAPABILITY"
        )

    def validate_scene(self, instance: Mapping[str, Any]) -> Mapping[str, Any]:
        shape = self._report(
            "sceneInstance",
            self._scene_validator.iter_errors(instance),
            code=self._malformed_plan_code,
        )
        if not shape["ok"]:
            return shape
        component = _name(instance.get("component"), "SceneInstance.component")
        scene_id = _name(instance.get("id"), "SceneInstance.id")
        if not any(capability["id"] == component for capability in self._catalog.capabilities):
            return self._finding_report(
                "sceneInstance",
                [
                    {
                        "code": self._unknown_capability_code,
                        "sceneId": scene_id,
                        "path": "/component",
                        "keyword": "publishedCapability",
                        "message": f"'{component}' is not a published SceneCapability.",
                    }
                ],
            )
        specification = self._catalog.for_role(CatalogProjectionRole.SCENE_AUTHOR, (component,))[0]
        schema = _object(specification.get("propsSchema"), f"{component}.propsSchema")
        validator = self._validator(schema, f"{component}.propsSchema")
        errors = validator.iter_errors(instance.get("props"))
        return self._report(
            "sceneInstance",
            errors,
            code=self._invalid_props_code,
            path_prefix=("props",),
            scene_id=scene_id,
        )

    def validate_video_plan(self, plan: Mapping[str, Any]) -> Mapping[str, Any]:
        return self._report(
            "videoPlan",
            self._plan_validator.iter_errors(plan),
            code=self._malformed_plan_code,
        )

    @staticmethod
    def _validator(schema: Mapping[str, Any], what: str) -> Draft202012Validator:
        try:
            Draft202012Validator.check_schema(schema)
        except SchemaError as invalid:
            raise ContractViolation(f"The published {what} is not a valid schema.") from invalid
        return Draft202012Validator(schema)

    @staticmethod
    def _report(
        subject: str,
        errors: Any,
        *,
        code: str,
        path_prefix: tuple[str, ...] = (),
        scene_id: str | None = None,
    ) -> Mapping[str, Any]:
        ordered = sorted(
            errors,
            key=lambda error: (
                tuple(str(part) for part in error.absolute_path),
                tuple(str(part) for part in error.absolute_schema_path),
            ),
        )
        findings = [
            _shape_finding(
                error,
                code=code,
                path_prefix=path_prefix,
                scene_id=scene_id,
            )
            for error in ordered
        ]
        return PublishedShapeValidators._finding_report(subject, findings)

    @staticmethod
    def _finding_report(subject: str, findings: Sequence[Mapping[str, Any]]) -> Mapping[str, Any]:
        return {
            "ok": not findings,
            "checked": "shape",
            "findings": [deepcopy(dict(finding)) for finding in findings],
            "deferredTo": "run.validate",
            "subject": subject,
        }


def _shape_finding(
    error: ValidationError,
    *,
    code: str,
    path_prefix: tuple[str, ...],
    scene_id: str | None,
) -> JsonObject:
    path = (*path_prefix, *error.absolute_path, *_missing_required_path(error))
    finding: JsonObject = {
        "code": code,
        "path": "".join(f"/{_json_pointer_token(part)}" for part in path),
        "keyword": str(error.validator),
        "message": error.message,
    }
    if scene_id is not None:
        finding["sceneId"] = scene_id
    return finding


def _published_check_code(errors: Mapping[str, Any], name: str) -> str:
    """Resolve one compiler finding name through the published check registry."""
    check = _object(errors.get(name), f"checks.errors.{name}")
    return _name(check.get("code"), f"checks.errors.{name}.code")


def _published_scene_tool_schema(plan_schema: Mapping[str, Any]) -> Mapping[str, Any]:
    """Project the fields `validateScene` receives from the published SceneInstance schema."""
    plan_properties = _object(plan_schema.get("properties"), "plan.schema.properties")
    sections = _object(plan_properties.get("sections"), "plan.schema.properties.sections")
    section = _object(sections.get("items"), "plan.schema sections.items")
    section_properties = _object(section.get("properties"), "plan.schema section.properties")
    scenes = _object(section_properties.get("scenes"), "plan.schema section.properties.scenes")
    scene = _object(scenes.get("items"), "plan.schema scenes.items")
    properties = _object(scene.get("properties"), "plan.schema SceneInstance.properties")
    fields = ("id", "component", "props")
    selected = {
        field: deepcopy(_object(properties.get(field), f"plan.schema SceneInstance.{field}"))
        for field in fields
    }
    return {
        "$schema": plan_schema.get("$schema"),
        "type": "object",
        "properties": selected,
        "required": list(fields),
        # The Scene Author may pass an assembled instance. Other fields belong to the full plan
        # validator; rejecting them here would make this focused projection a second schema copy.
        "additionalProperties": True,
    }


def _json_pointer_token(value: Any) -> str:
    return str(value).replace("~", "~0").replace("/", "~1")


def _missing_required_path(error: ValidationError) -> tuple[str, ...]:
    if error.validator != "required" or not isinstance(error.instance, Mapping):
        return ()
    required = error.validator_value
    if isinstance(required, Sequence) and not isinstance(required, (str, bytes)):
        missing = [name for name in required if name not in error.instance]
        if len(missing) == 1 and isinstance(missing[0], str):
            return (missing[0],)
    return ()


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
        compact = self._catalog.for_role(CatalogProjectionRole.VISUAL_STRUCTURER)
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


PLAN_REPAIR_BUDGET = 1
"""How many repair turns one Run may spend on a refused plan.

One, and named rather than inlined so the number is arguable. The spec requires repair to be
"conditional and bounded" and to never trigger an unbounded loop (spec.md:245-248); a budget of
one buys the case that motivates repair at all — an author that mis-shaped a fill and can now see
the finding — without acquiring a loop that bargains with a validator. Raising it is a spend
decision, not a tuning knob: every turn is a model call no operator separately authorised.
"""


@dataclass(frozen=True, slots=True)
class PlanRefusal:
    """What a validator refused, and which published capabilities it implicates."""

    findings: tuple[JsonObject, ...]
    capability_ids: tuple[str, ...]
    summary: str


class PlanRepairAgent(Protocol):
    async def repair(
        self,
        plan: Mapping[str, Any],
        refusal: PlanRefusal,
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
        repair: PlanRepairAgent | None = None,
        repair_budget: int = PLAN_REPAIR_BUDGET,
    ) -> None:
        if repair_budget < 0:
            raise ContractViolation("A plan repair budget cannot be negative.")
        self._catalog = catalog
        self._structurer = structurer
        self._scene_author = scene_author
        self._validate_scene = validate_scene
        self._validate_plan = validate_plan
        self.mode = mode
        self._repair = repair
        self._repair_budget = repair_budget
        #: Readable after a Run, so evidence can say what repair cost and not merely that it ran.
        self.repairs_spent = 0

    async def plan(
        self,
        brief: Brief,
        dossier: ResearchDossier,
        narrative: Narrative,
        visual_bible: VisualBible,
    ) -> Mapping[str, Any]:
        selection = self._catalog.for_role(CatalogProjectionRole.VISUAL_STRUCTURER)
        structure = self._structure(
            await self._structurer.structure(
                brief, dossier, narrative, visual_bible, selection
            ),
            narrative,
        )
        selected_ids = _selected_capabilities(structure)
        specifications = self._catalog.for_role(CatalogProjectionRole.SCENE_AUTHOR, selected_ids)
        tools = VisualCatalogTools(
            self._catalog,
            frozenset(selected_ids),
            self._validate_scene,
            self._validate_plan,
        )
        fills = await self._scene_author.author(deepcopy(structure), specifications, tools)
        plan = self._assemble(structure, fills)
        return await self._repaired(plan, structure, tools)

    async def _repaired(
        self, plan: JsonObject, structure: JsonObject, tools: VisualCatalogTools
    ) -> JsonObject:
        """Validate, and give a refused plan a bounded number of chances to come back green.

        Reached only from a structured refusal, per spec.md:53 — a green plan never sees the
        repair role, and neither does an `UnservableBrief`, which is a Brief the catalog cannot
        serve rather than a plan that is wrong.

        Exhaustion **stops**; it does not Decline. The spec allows either (spec.md:248) and
        stopping is the honest one: a plan that stayed refused says the crew could not author this
        Brief, while a Decline says the catalog cannot express it — a claim only the Structurer is
        placed to make, and one it makes through `unservable`.
        """
        self.repairs_spent = 0
        while True:
            refusal = self._refusal(plan, tools)
            if refusal is None:
                return plan
            if self._repair is None or self.repairs_spent >= self._repair_budget:
                raise ContractViolation(refusal.summary)
            self.repairs_spent += 1
            # `implicated`, never the whole catalog: ADR-0019 gives a repair the full
            # specifications of exactly the capabilities the refusal names.
            specifications = (
                self._catalog.for_role(CatalogProjectionRole.PLAN_REPAIR, refusal.capability_ids)
                if refusal.capability_ids
                else ()
            )
            fills = await self._repair.repair(deepcopy(plan), refusal, specifications, tools)
            plan = self._assemble(structure, fills)

    def _refusal(self, plan: JsonObject, tools: VisualCatalogTools) -> PlanRefusal | None:
        """Every refusal in one pass, so one repair turn sees the whole problem.

        Stopping at the first would spend a turn per bad scene, which is how a bounded budget
        becomes an unbounded one in practice.
        """
        findings: list[JsonObject] = []
        implicated: list[str] = []
        for section in plan["sections"]:
            for scene in section["scenes"]:
                report = tools.validate_scene(scene)
                if _green(report):
                    continue
                findings.append(
                    {
                        "where": "sceneInstance",
                        "sceneId": scene["id"],
                        "component": scene["component"],
                        "report": deepcopy(dict(report)) if isinstance(report, Mapping) else {},
                    }
                )
                if scene["component"] not in implicated:
                    implicated.append(scene["component"])

        plan_report = tools.validate_video_plan(plan)
        if not _green(plan_report):
            findings.append(
                {
                    "where": "videoPlan",
                    "report": (
                        deepcopy(dict(plan_report)) if isinstance(plan_report, Mapping) else {}
                    ),
                }
            )
            # No SceneCapability is implicated by a plan-level finding. Simultaneous scene
            # findings above still contribute exactly the capabilities they name.

        if not findings:
            return None
        refused = ", ".join(str(finding.get("sceneId", "the VideoPlan")) for finding in findings)
        return PlanRefusal(
            findings=tuple(findings),
            capability_ids=tuple(implicated),
            summary=f"The published validator refused {refused}.",
        )

    @staticmethod
    def _refuse_if_unservable(value: Any) -> None:
        """The Structurer's third answer: no published capability serves the need.

        ADR-0019 requires an unavailable selection to become a finding rather than
        permission to widen the role's view, and the spec asks for "a missing suitable
        SceneCapability to become a finding" (US51) so the Run can Decline (US19). Without
        this the only way to say it was an invented capability id, which the projection
        rejects as a ContractViolation — turning an honest refusal into a failed Run.

        Read strictly, and before the Beats are checked: a role refusing the whole Brief
        has no sections to preserve them in, and demanding a well-formed structure
        alongside the refusal would ask it to author the thing it just said it cannot.
        """
        if value is None:
            return
        finding = _object(value, "visual structure.unservable")
        _strict(
            finding,
            {"summary", "unmetNeed", "catalogGap"},
            "visual structure.unservable",
        )
        raise UnservableBrief(
            _name(finding.get("summary"), "visual structure.unservable.summary"),
            _name(finding.get("unmetNeed"), "visual structure.unservable.unmetNeed"),
            _name(finding.get("catalogGap"), "visual structure.unservable.catalogGap"),
        )

    def _structure(self, value: Mapping[str, Any], narrative: Narrative) -> JsonObject:
        value = _object(value, "visual structure")
        _strict(value, {"beats", "sections", "unservable"}, "visual structure")
        self._refuse_if_unservable(value.get("unservable"))
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


def _green(report: Mapping[str, Any]) -> bool:
    return isinstance(report, Mapping) and report.get("ok") is True


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
