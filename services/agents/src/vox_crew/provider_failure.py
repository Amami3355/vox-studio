"""Classify received provider errors without treating transport loss as a failure receipt."""
from .provider_usage import CURRENT, finish_call


class ProviderFailure(RuntimeError):
    def __init__(self, status):
        self.status = status
        self.retryable = status in (429, 500, 502, 503, 504)
        super().__init__(f"The provider returned HTTP {status}. " + (
            "Production will retry automatically; your work is saved." if self.retryable else
            "This error needs attention before production can continue. Your work is saved."))


def received_error(error, call_id=None):
    from google.genai.errors import APIError
    if not isinstance(error, APIError) or type(error.code) is not int or not 400 <= error.code <= 599:
        return None
    journal = CURRENT.get()
    if journal and call_id is None:
        completed = {row["id"] for row in journal.records if row["status"] == "responded"}
        pending = [row["id"] for row in journal.records if row["status"] == "dispatched" and row["id"] not in completed]
        if len(pending) == 1:
            call_id = pending[0]
    if journal and call_id and not any(row["id"] == call_id and row["status"] == "responded" for row in journal.records):
        finish_call(call_id, providerHttpStatus=error.code, providerOutcome="failed")
    return ProviderFailure(error.code)
