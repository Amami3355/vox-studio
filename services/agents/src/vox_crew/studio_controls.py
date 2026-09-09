"""User decisions, effective total limits and conservative continuation eligibility."""
from __future__ import annotations

from copy import deepcopy
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .autonomous_contract import digest
from .studio_store import StudioConflict
from .production_limits import ProductionLimits


class UserCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    target: Literal["image", "visuals", "research", "narrative", "composition", "continue"]
    instruction: str = Field(default="", max_length=1200)
    identity: str | None = Field(default=None, min_length=1, max_length=200)
    candidateSha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class ResumeInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    checkpointSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    limits: ProductionLimits = Field(default_factory=ProductionLimits)
    correction: UserCorrection


def effective_limits(state, request=None):
    # Historical limits remain in archived signed evidence; all Studio work is unlimited.
    return ProductionLimits().model_dump()


def usage(state):
    return {"maxCalls": state.get("providerUsage", {}).get("calls", 0),
            "maxSearches": max(len(state.get("searches", [])), state.get("providerUsage", {}).get("searches", 0)),
            "maxImages": max(sum(len(rows) for rows in state.get("images", {}).values()), state.get("providerUsage", {}).get("images", 0)),
            "maxTakes": max(int(bool(state.get("take"))), state.get("providerUsage", {}).get("takes", 0)),
            "maxImageCorrections": max((max(0, len(rows) - 1) for rows in state.get("images", {}).values()), default=0),
            "maxEditorialCorrections": state.get("editorialCorrections", 0),
            "maxFilmCorrections": state.get("filmCorrections", 0),
            "maxTechnicalRepairs": state.get("technicalRepairs", 0)}


def unreviewed_images(state):
    reviewed = {row["job"]["id"] for rows in state.get("images", {}).values() for row in rows}
    candidates = {}
    for step in state.get("steps", {}).values():
        if isinstance(step, dict) and step.get("name") == "production.image_start":
            job = (step["result"].get("data") or {}).get("job")
            if job and job.get("candidate") and job["id"] not in reviewed:
                candidates[job["id"]] = {"job": job, "request": step["dependencies"]["args"][1]}
    return list(candidates.values())


def continuation_options(state):
    if not state:
        return [], "No saved production checkpoint is available."
    failure = state.get("recoverableFailure")
    known_failure = bool(failure and failure.get("pending") == state.get("pending")
                         and failure.get("pendingComposition") == state.get("pendingComposition"))
    if (state.get("imageWorkflow") and not state.get("pending") and not state.get("pendingComposition")
            and any(p.get("pending") or p.get("status") != "accepted" for p in state.get("imagePipelines", {}).values()
                    if p.get("contextKey") == state["imageWorkflow"]["contextKey"])):
        return ["continue"], "Resume verifies saved image operations before starting new work. Unknown results remain paused."
    if ((state.get("pending") or state.get("pendingComposition")) and not known_failure) or state.get("providerUsage", {}).get("uncertain"):
        return [], "An unfinished action must be reconciled before continuing. Your existing work is preserved."
    terminal = state.get("terminal") or {}
    if terminal.get("status") == "declined":
        return [], "This production has finished."
    if terminal.get("code") == "provider_response":
        return [], "The generation service could not complete this step. Your work is saved."
    if state.get("imageReviewMode") not in ("studio", "studio_automatic"):
        return [], "This historical production does not support Studio correction."
    if not state.get("runId"):
        return [], "Production initialization must be reconciled before this saved work can continue."
    if unreviewed_images(state):
        return ["continue"], "A generated image is saved and still needs verification. Resume to finish that operation."
    if terminal.get("code") == "model_response" or state.get("pendingModelRecovery"):
        return ["continue"], "Automatic recovery needs your direction. Completed work is saved."
    options = ["continue"] if (not known_failure or terminal.get("code") in ("provider_temporary", "provider_requires_action")) and (not terminal or terminal.get("code") in ("limit", "stopped", "provider_temporary", "provider_requires_action")) else []
    if any(rows and not rows[-1].get("accepted") for rows in state.get("images", {}).values()):
        options.append("image")
    if state.get("take"):
        reviews = [r["review"] for r in state.get("filmReviews", {}).values()]
        if not reviews or not reviews[-1].get("requiresNarrationChange"):
            options.append("visuals")
    else:
        options.extend(["research", "narrative", "composition"] if state.get("narrative") else ["research"])
    return options, "" if options else "The saved failure requires reconciliation before a new attempt."


def resume_requirements(state, target, identity=None):
    """Compatibility projection for older Studio clients; no admission budget remains."""
    return effective_limits(state)


def validate_resume(state, body):
    if digest(state) != body["checkpointSha256"]:
        raise StudioConflict("The production changed. Refresh its reviews before continuing.")
    options, refusal = continuation_options(state)
    correction = body["correction"]
    target = correction["target"]
    if target not in options:
        raise StudioConflict(refusal or "This correction cannot be applied at the saved stage.")
    if target != "continue" and not correction["instruction"].strip():
        raise StudioConflict("Describe the correction to apply before continuing.")
    if target == "image":
        rows = state.get("images", {}).get(correction.get("identity"), [])
        if not rows or rows[-1].get("accepted") or rows[-1]["job"]["candidate"]["artifact"]["sha256"] != correction.get("candidateSha256"):
            raise StudioConflict("Select the latest rejected image to correct.")
    elif correction.get("identity") is not None or correction.get("candidateSha256") is not None:
        raise StudioConflict("Only an image correction can name a candidate.")



def apply_correction(state, decision, authorization):
    """Return a revised checkpoint; caller verifies Production and archives bytes before writing."""
    revised = deepcopy(state)
    correction = decision["request"]["correction"]
    target, instruction = correction["target"], correction["instruction"].strip()
    revised.setdefault("userCorrections", []).append({"id": decision["id"], **correction,
        "previousTerminal": deepcopy(state.get("terminal")), "checkpointSha256": digest(state)})
    revised["studioAuthorization"] = authorization
    revised["limits"] = {k: authorization["limits"][k] for k in ("maxCalls", "maxSearches", "maxImages")}
    revised["terminal"] = None
    if revised.get("recoverableFailure"):
        revised.setdefault("resolvedFailures", []).append(revised.pop("recoverableFailure"))
        revised["pending"] = None
        revised["pendingComposition"] = None
    feedback = {"action": target, "observations": [{"problem": instruction, "expected": instruction, "affectedIds": []}]}
    if target == "image":
        revised.setdefault("imageUserCorrections", {})[correction["identity"]] = {"id": decision["id"], **correction}
    elif target == "visuals":
        reviews = list(revised.get("filmReviews", {}).values())
        previous = reviews[-1]["review"] if reviews else {"observations": []}
        revised["pendingFilmCorrection"] = {**previous, "previousPlan": revised["videoPlan"],
            "userCorrection": instruction, "correctionId": decision["id"]}
    elif target in ("research", "narrative", "composition"):
        revised["phase"] = "preparation"
        revised["feedback"] = feedback
        revised["videoPlan"] = None
        if target != "research":
            revised["editorialCorrections"] += 1
        if target in ("research", "narrative"):
            revised["narrative"] = None
        if target == "research":
            revised.update(coverageAccepted=False, targetedQuestions=[instruction])
    return revised
