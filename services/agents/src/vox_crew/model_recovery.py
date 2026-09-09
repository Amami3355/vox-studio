"""Recovery context for completed model answers; never a transport retry policy."""
from contextvars import ContextVar

from .crew_contract import ContractViolation


RECOVERY: ContextVar[dict | None] = ContextVar("model_response_recovery", default=None)


class ModelResponseInvalid(ContractViolation):
    """A received answer cannot be used as a complete structured response."""


class ModelRecoveryExhausted(ContractViolation):
    """The shared, durable technical repair allowance has been consumed."""


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
