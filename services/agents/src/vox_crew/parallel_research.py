"""Parallel-backed Research adapter behind the provider-neutral dossier seam.

Authentication, endpoints, blocking result retrieval and provider response shapes stop here.  The
Director receives only a schema-validated ``ResearchDossier`` mapping.  No call is retried: a lost
create response may already represent metered work and must be reconciled by an operator.
"""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Callable, Mapping, Sequence
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from .crew_contract import (
    Brief,
    BriefKind,
    ContractViolation,
    ProviderMode,
    ResearchDossier,
    ResearchTrace,
)


class ParallelUnavailable(RuntimeError):
    """The live provider cannot be reached or has no credential."""


class ParallelMalformedResponse(RuntimeError):
    """Parallel answered, but not with the documented Task Run result shape."""


class ParallelTransport(Protocol):
    def create(self, payload: dict[str, Any], api_key: str) -> str: ...

    def result(self, run_id: str, api_key: str) -> Mapping[str, Any]: ...


def _from_environment() -> str:
    return os.environ.get("PARALLEL_API_KEY", "")


def _array(items: dict[str, Any], *, required: list[str]) -> dict[str, Any]:
    return {
        "type": "array",
        "items": {
            "type": "object",
            "additionalProperties": False,
            "properties": items,
            "required": required,
        },
    }


STRING = {"type": "string", "minLength": 1}
STRING_ARRAY = {"type": "array", "items": STRING, "minItems": 1, "uniqueItems": True}
SUPPORT = {"type": "string", "enum": ["supported", "uncertain", "contradicted"]}

RESEARCH_DOSSIER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "schemaVersion": {"type": "integer", "const": 1},
        "mode": {"type": "string", "const": "researched"},
        "sources": _array(
            {"id": STRING, "title": STRING, "url": {"type": "string", "format": "uri"}},
            required=["id", "title", "url"],
        ),
        "claims": _array(
            {"id": STRING, "text": STRING, "sourceIds": STRING_ARRAY, "support": SUPPORT},
            required=["id", "text", "sourceIds", "support"],
        ),
        "statistics": _array(
            {
                "id": STRING,
                "text": STRING,
                "value": STRING,
                "unit": {"anyOf": [STRING, {"type": "null"}]},
                "sourceIds": STRING_ARRAY,
                "support": SUPPORT,
            },
            required=["id", "text", "value", "unit", "sourceIds", "support"],
        ),
        "quotations": _array(
            {
                "id": STRING,
                "text": STRING,
                "attribution": STRING,
                "sourceIds": STRING_ARRAY,
                "support": SUPPORT,
            },
            required=["id", "text", "attribution", "sourceIds", "support"],
        ),
        "contradictions": _array(
            {"id": STRING, "summary": STRING, "claimIds": STRING_ARRAY},
            required=["id", "summary", "claimIds"],
        ),
        "visualOpportunities": _array(
            {"id": STRING, "description": STRING, "claimIds": STRING_ARRAY},
            required=["id", "description", "claimIds"],
        ),
    },
    "required": [
        "schemaVersion",
        "mode",
        "sources",
        "claims",
        "statistics",
        "quotations",
        "contradictions",
        "visualOpportunities",
    ],
}


class UrllibParallelTransport:
    """The small HTTP implementation; standard-library only and intentionally without retry."""

    def __init__(
        self,
        base_url: str = "https://api.parallel.ai/v1/tasks/runs",
        *,
        timeout_seconds: float = 3600,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds

    def create(self, payload: dict[str, Any], api_key: str) -> str:
        body = self._request("POST", self._base_url, api_key, payload)
        run_id = body.get("run_id")
        if not isinstance(run_id, str) or not run_id:
            raise ParallelMalformedResponse("Parallel create returned no Task Run id.")
        return run_id

    def result(self, run_id: str, api_key: str) -> Mapping[str, Any]:
        return self._request(
            "GET", f"{self._base_url}/{quote(run_id, safe='')}/result", api_key, None
        )

    def _request(
        self, method: str, url: str, api_key: str, payload: Mapping[str, Any] | None
    ) -> Mapping[str, Any]:
        data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
        request = Request(
            url,
            data=data,
            method=method,
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
        )
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:  # noqa: S310
                value = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            raise ParallelUnavailable("The Parallel Task API request did not complete.") from error
        if not isinstance(value, Mapping):
            raise ParallelMalformedResponse("Parallel returned a non-object response.")
        return value


class ParallelResearchAdapter:
    mode = ProviderMode.LIVE

    def __init__(
        self,
        *,
        transport: ParallelTransport | None = None,
        key_source: Callable[[], str] = _from_environment,
        processor: str = "core",
    ) -> None:
        self._transport = transport if transport is not None else UrllibParallelTransport()
        self._key_source = key_source
        self._processor = processor
        self.inquiry: tuple[str, ...] = ()

    def trace(self) -> ResearchTrace:
        return ResearchTrace(self.inquiry)

    async def research(
        self, brief: Brief, inquiry: Sequence[str] = ()
    ) -> Mapping[str, Any]:
        """Execute an inquiry. `inquiry` is the Research Agent's plan; empty means the Brief alone.

        The questions are appended to the Brief rather than replacing it. A provider given only
        the questions loses the editorial framing that decided them, and the dossier comes back
        answering a decomposition of a Brief nobody sent.
        """
        if brief.kind is not BriefKind.FACTUAL:
            raise ContractViolation("Parallel research accepts factual Briefs only.")
        api_key = self._key_source()
        if not api_key:
            raise ParallelUnavailable("PARALLEL_API_KEY is required for live research.")
        questions = tuple(question for question in inquiry if question.strip())
        self.inquiry = questions
        payload = {
            "input": (
                brief.text
                if not questions
                else brief.text
                + "\n\nAnswer each of these questions with sourced evidence:\n"
                + "\n".join(f"- {question}" for question in questions)
            ),
            "processor": self._processor,
            "task_spec": {
                "output_schema": {"type": "json", "json_schema": RESEARCH_DOSSIER_SCHEMA}
            },
        }
        run_id = await asyncio.to_thread(self._transport.create, payload, api_key)
        body = await asyncio.to_thread(self._transport.result, run_id, api_key)
        output = body.get("output")
        if not isinstance(output, Mapping):
            raise ParallelMalformedResponse("Parallel result returned no output object.")
        content = output.get("content")
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except json.JSONDecodeError as error:
                raise ParallelMalformedResponse("Parallel output content is not JSON.") from error
        if not isinstance(content, Mapping):
            raise ParallelMalformedResponse("Parallel output content is not an object.")
        return ResearchDossier.from_mapping(content).to_mapping()


__all__ = [
    "ParallelMalformedResponse",
    "ParallelResearchAdapter",
    "ParallelTransport",
    "ParallelUnavailable",
    "RESEARCH_DOSSIER_SCHEMA",
    "UrllibParallelTransport",
]
