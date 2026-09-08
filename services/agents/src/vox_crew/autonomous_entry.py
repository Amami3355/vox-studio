"""Operator configuration stays separate from the original simple prompt."""
from __future__ import annotations

import json
import os
from hashlib import sha256
from uuid import uuid4

from .autonomous_contract import digest
from .crew_contract import ProviderMode
from .crew_run import read_policy
from .hosted import write_json
from .provider_usage import ProviderJournal


def prompt_request(text, defaults, *, duration=None, submission_id=None):
    if not isinstance(text, str) or not text.strip():
        raise ValueError("A nonempty original prompt is required.")
    duration = duration if duration is not None else defaults.get("durationSeconds", 50)
    if type(duration) not in (int, float) or not 10 <= duration <= 180:
        raise ValueError("Target duration must be between 10 and 180 seconds.")
    if duration == int(duration):
        duration = int(duration)
    production = defaults["production"]
    if production.get("maxNewTakes") != 1:
        raise ValueError("The autonomous envelope allows exactly one new Take.")
    maximum = defaults.get("maxGeneratedImages", 5)
    if type(maximum) is not int or not 0 <= maximum <= 5:
        raise ValueError("The autonomous image ceiling must be between zero and five.")
    return {"protocolVersion": 1, "brief": {"id": submission_id or str(uuid4()), "text": text,
        "durationSeconds": duration, "maxGeneratedImages": maximum}, "production": production}


async def submit_prompt(client, state, config, text, *, duration=None, language=None,
                        submission_id=None, prepare_only=False, on_snapshot=None, image_review_hook=None):
    defaults = json.loads((config / "prompt-defaults.json").read_text(encoding="utf-8"))
    request = prompt_request(text, defaults, duration=duration, submission_id=submission_id)
    language = language or defaults.get("language")
    work = state / "briefs" / sha256(request["brief"]["id"].encode()).hexdigest()
    request_path = work / "original-request.json"
    if request_path.exists() and json.loads(request_path.read_text()) != request:
        raise ValueError("The submission ID already belongs to another original prompt.")
    write_json(request_path, request)
    request_sha = digest({"protocolVersion": 1, "purpose": "production-request", "value": request})
    print(json.dumps({"submissionId": request["brief"]["id"], "requestSha256": request_sha,
                      "work": str(work), "preparedOnly": prepare_only}), flush=True)
    if prepare_only:
        return 0
    policy = read_policy(config / "operator-policy.json")
    if any(getattr(policy, phase).mode is not ProviderMode.LIVE for phase in ("models", "research", "images", "recording")):
        raise ValueError("Autonomous V2 requires independently authorized live phases; use run for recorded/manual workflows.")
    limits = json.loads((config / "execution-limits.json").read_text())
    if set(limits) != {"maxModelCalls", "maxGroundedCalls"} or any(type(v) is not int for v in limits.values()) or not (
        1 <= limits["maxModelCalls"] <= 40 and 1 <= limits["maxGroundedCalls"] <= 4):
        raise ValueError("Autonomous limits must stay within 40 total calls and four grounded searches.")
    from .adk_roles import AdkCreativeAdapter, AdkVisualStructurer, AdkSceneAuthor, AdkPlanRepair, CREW_MODEL
    from .autonomous import AutonomousRun
    from .autonomous_roles import AutonomousDirector, MediaReviewer
    from .grounded_research import GroundedParallelResearchAdapter
    from .teaching_surface import read_teaching_surface
    from .visual_planner import (PublishedCatalog, PublishedShapeValidators, SplitVisualPlanner,
                                 trusted_palettes, visual_vocabulary)
    surface = read_teaching_surface(client)
    catalog = PublishedCatalog.from_mapping(surface.contract("catalog"))
    shapes = PublishedShapeValidators(catalog, surface.contract("plan"), surface.contract("checks"))
    model = os.environ.get("VOX_CREW_MODEL", CREW_MODEL)
    planner = SplitVisualPlanner(catalog, AdkVisualStructurer(model=model), AdkSceneAuthor(model=model),
        validate_scene=shapes.validate_scene, validate_plan=shapes.validate_video_plan,
        repair=AdkPlanRepair(model=model), check_meanings=shapes.meanings_for, mode=ProviderMode.LIVE,
        allow_structural_echo=True)
    with ProviderJournal(work / "provider-calls.jsonl", max_calls=limits["maxModelCalls"],
                         max_grounded_calls=limits["maxGroundedCalls"]):
        run = AutonomousRun(client, surface, work, request, director=AutonomousDirector(model, work / "role-outputs"),
            research=GroundedParallelResearchAdapter(), creative=AdkCreativeAdapter(model=model),
            planner=planner, reviewer=MediaReviewer(model),
            vocabulary=visual_vocabulary(surface.contract("catalog")),
            palettes=trusted_palettes(surface.contract("design")), language=language,
            max_searches=limits["maxGroundedCalls"], on_snapshot=on_snapshot, image_review_hook=image_review_hook)
        result = await run.run()
    write_json(work / "result.json", result)
    print(json.dumps(result), flush=True)
    return 0 if result["status"] == "reviewed" else 1
