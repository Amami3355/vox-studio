"""Versioned editorial decisions. These values confer no Production authority."""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from typing import Any, Mapping
from jsonschema import Draft202012Validator
from .crew_contract import ContractViolation
from .wire import canonical_json


def digest(value: Any) -> str:
    return sha256(canonical_json(value).encode()).hexdigest()


def obj(**fields):
    return {"type": "object", "properties": fields, "required": list(fields), "additionalProperties": False}


TEXT = {"type": "string", "minLength": 1}
TEXTS = {"type": "array", "items": TEXT}
OBSERVATION = obj(problem=TEXT, affectedIds=TEXTS, expected=TEXT)
OBSERVATIONS = {"type": "array", "items": OBSERVATION}
EDITORIAL_BRIEF = obj(schemaVersion={"const": 2}, centralQuestion=TEXT, audience=TEXT,
    language=TEXT, angle=TEXT, understandingGoals={**TEXTS, "minItems": 1},
    durationSeconds={"type": "number", "minimum": 10, "maximum": 180})
DIRECTOR_DECISION = obj(action={"enum": ["accept", "research", "narrative", "composition", "stop"]},
    observations=OBSERVATIONS)
COVERAGE_REVIEW = obj(adequate={"type": "boolean"}, centralQuestionAnswered={"type": "boolean"},
    mechanismExplained={"type": "boolean"}, nuancesCovered={"type": "boolean"},
    observations=OBSERVATIONS, targetedQuestions=TEXTS)
PROGRESS_REVIEW = obj(action={"enum": ["continue", "ask_user"]}, reason=TEXT,
    correction={"type": "string"})
IMAGE_INTENT = obj(meaning=TEXT, arrangement=TEXT, visibleDetails={**TEXTS, "minItems": 1},
    plannedCrops={**TEXTS, "minItems": 1}, rendererElements=TEXTS)
IMAGE_INTENT_V3 = {**IMAGE_INTENT, "properties": {**IMAGE_INTENT["properties"],
    "rendererElements": {"type": "array", "items": obj(sceneId=TEXT, scenePath=TEXT)}}}
MEDIA_REVIEW = obj(accepted={"type": "boolean"}, inspectionPossible={"type": "boolean"},
    assessment=TEXT, requiresNarrationChange={"type": "boolean"},
    observations={"type": "array", "items": obj(problem=TEXT, affectedIds=TEXTS, expected=TEXT,
        startSeconds={"type": "number", "minimum": 0}, endSeconds={"type": "number", "minimum": 0})})


def checked(schema: Mapping[str, Any], value: Any) -> dict[str, Any]:
    errors = list(Draft202012Validator(schema).iter_errors(value))
    if errors:
        raise ContractViolation(f"Autonomous contract invalid at {list(errors[0].path)}: {errors[0].message}")
    value = deepcopy(value)
    if schema is DIRECTOR_DECISION:
        if (value["action"] == "accept") != (not value["observations"]):
            raise ContractViolation("Accept without blocking observations; other decisions require observations.")
    if schema is COVERAGE_REVIEW:
        complete = all(value[k] for k in ("centralQuestionAnswered", "mechanismExplained", "nuancesCovered"))
        if value["adequate"] != complete or value["adequate"] != (not value["observations"]):
            raise ContractViolation("Coverage verdict conflicts with its findings.")
        if not value["adequate"] and not value["targetedQuestions"]:
            raise ContractViolation("Incomplete coverage requires targeted research questions.")
    if schema is MEDIA_REVIEW:
        if value["accepted"] != (not value["observations"]) or (value["accepted"] and value["requiresNarrationChange"]):
            raise ContractViolation("Media verdict conflicts with its findings.")
        if value["accepted"] and not value["inspectionPossible"]:
            raise ContractViolation("Uninspectable media cannot be accepted.")
        if any(o["endSeconds"] < o["startSeconds"] for o in value["observations"]):
            raise ContractViolation("Media observation has reversed timestamps.")
    return value


def merge_dossiers(previous, incoming, revision: int):
    """Merge only validated citation-backed claims, retaining stable identifiers/provenance."""
    from .crew_contract import ResearchDossier
    incoming = ResearchDossier.from_mapping(incoming).to_mapping()
    merged = deepcopy(previous) if previous else {**incoming, "sources": [], "claims": []}
    source_ids = {}
    for source in incoming["sources"]:
        old = next((s for s in merged["sources"] if s["url"] == source["url"]), None)
        stable = old["id"] if old else "source-" + digest(source["url"])[:16]
        source_ids[source["id"]] = stable
        if old is None:
            merged["sources"].append({**source, "id": stable})
    provenance = []
    for claim in incoming["claims"]:
        sources = [source_ids[s] for s in claim["sourceIds"]]
        stable = "claim-" + digest({"text": claim["text"], "sources": sorted(sources)})[:16]
        if not any(c["id"] == stable for c in merged["claims"]):
            merged["claims"].append({**claim, "id": stable, "sourceIds": sources})
        provenance.append({"claimId": stable, "searchRevision": revision, "originalClaimId": claim["id"],
                           "sourceIds": sources})
    return ResearchDossier.from_mapping(merged).to_mapping(), provenance
