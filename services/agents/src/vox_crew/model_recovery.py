"""Recovery context for completed model answers; never a transport retry policy."""
from contextvars import ContextVar

from .crew_contract import ContractViolation


RECOVERY: ContextVar[dict | None] = ContextVar("model_response_recovery", default=None)

# Advance only when the response repair strategy changes, never per deployment.
RESPONSE_RECOVERY_VERSION = "explicit-scene-scope-and-compiled-image-intent-v1"


class ModelResponseInvalid(ContractViolation):
    """A received answer cannot be used as a complete structured response."""


class ModelRecoveryExhausted(ContractViolation):
    """The shared, durable technical repair allowance has been consumed."""


class ModelRecoveryStalled(ModelRecoveryExhausted):
    """The same validated feedback has already failed with the current strategy."""

    def __init__(self, public_reason=None):
        super().__init__("The same response repair failed without a new recovery strategy.")
        self.public_reason = public_reason


def completed_model_calls(journal, since):
    """Return evidence only when this attempt contains exclusively answered model calls."""
    if journal is None or journal.summary()["uncertain"]:
        return []
    rows = journal.records[since:]
    calls = [row for row in rows if row["status"] == "dispatched"]
    answers = {row["id"]: row for row in rows if row["status"] == "responded"}
    if not calls or any(row["id"] not in answers or row.get("grounded")
                        or row.get("provider") != "google-cloud"
                        or row["role"] not in {"Director", "NarrativeAgent", "ArtDirectorAgent",
                            "VisualStructurer", "SceneAuthor", "PlanRepairAgent", "ImageCreator", "MediaReviewer"}
                        for row in calls):
        return []
    if any(answers[row["id"]].get("providerOutcome") == "failed"
           or answers[row["id"]].get("finishReason") not in (None, "STOP", "MAX_TOKENS")
           for row in calls):
        return []
    return [{"id": row["id"], "role": row["role"], "model": row["model"],
             "finishReason": answers[row["id"]].get("finishReason"),
             "maxOutputTokens": row.get("maxOutputTokens", 8192)} for row in calls]
