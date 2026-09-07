"""Auditable evidence for the asynchronous specialist crew interface.

The legacy evidence assembler proves the scripted author/Production convergence loop.  This
assembler records the newer public crew stream and its portable checkpoint without pretending
that either format is the other.  Both use the same hash-index and assertion verifier.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any

from .crew_contract import (
    DISCLOSURE,
    Brief,
    CrewEvent,
    CrewRole,
    CrewTerminal,
    OperatorPolicy,
    Rendered,
    read_image_decisions,
)
from .evidence import (
    ASSERTIONS,
    ENVIRONMENT,
    HASH_INDEX,
    NOT_EVIDENCED,
    PASS,
    SUMMARY,
    EvidenceBundle,
    EvidenceLeaked,
    machine_verdict,
)

CREW_EVENTS = "crew-events.jsonl"
CREW_STATE = "crew-state.json"
PRODUCTION_COMMANDS = "production-commands.jsonl"
TOOL_CALLS = "tool-calls.jsonl"
AUTHORIZATIONS = "authorizations.json"

_SECRET = re.compile(
    rb"(?i)(?:api[_-]?key|password|authorization\s*[:=]\s*bearer|"
    rb"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|sk-[a-z0-9_-]{12,})"
)


def assemble_crew_evidence(
    brief: Brief,
    policy: OperatorPolicy,
    updates: Sequence[CrewEvent | CrewTerminal],
    checkpoint: Mapping[str, Any],
    *,
    executed_at: str | None = None,
) -> EvidenceBundle:
    """Build a self-verifying, secret-free bundle from one observed crew execution."""
    if not updates or not isinstance(updates[-1], CrewTerminal):
        raise ValueError("Crew evidence requires an explicit terminal update.")
    mappings = [item.to_mapping() for item in updates]
    terminal = mappings[-1]
    if any(item.brief_id != brief.id for item in updates):
        raise ValueError("Crew evidence updates must belong to one Brief.")

    production_state = checkpoint.get("productionState")
    production = dict(production_state) if isinstance(production_state, Mapping) else {}
    command_records = production.pop("commandRecords", [])
    if not isinstance(command_records, list) or any(
        not isinstance(item, Mapping) for item in command_records
    ):
        raise ValueError("Crew Production command evidence is malformed.")

    research_inquiry, research_planned = _research_trace(checkpoint)
    state = {
        "schemaVersion": 1,
        "brief": brief.to_mapping(),
        "research": deepcopy(checkpoint.get("research")),
        "researchInquiry": research_inquiry,
        "researchPlanningAttempted": research_planned,
        "narrative": deepcopy(checkpoint.get("narrative")),
        "visualBible": deepcopy(checkpoint.get("visualBible")),
        "videoPlan": deepcopy(checkpoint.get("videoPlan")),
        "production": deepcopy(production) if production else None,
        "terminal": deepcopy(checkpoint.get("terminal")),
    }
    authorizations = {
        "schemaVersion": 1,
        **{
            name: {
                "providerMode": access.mode.value,
                "authorized": access.mode.value != "live" or access.grant_id is not None,
            }
            for name, access in (
                ("research", policy.research),
                ("models", policy.models),
                ("images", policy.images),
                ("recording", policy.recording),
            )
        },
    }
    tools = _tool_calls(
        mappings,
        command_records,
        brief.id,
        state,
        model_mode=policy.models.mode.value,
    )
    assertions = _assertions(mappings, state, command_records)
    verdict = machine_verdict(assertions)
    timestamp = executed_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    authored = {
        ENVIRONMENT: _json(
            {
                "schemaVersion": 1,
                "executedAt": timestamp,
                "interface": "vox.production-crew.v1",
                "providerModes": {
                    name: item["providerMode"]
                    for name, item in authorizations.items()
                    if isinstance(item, Mapping)
                },
            }
        ),
        CREW_EVENTS: _json_lines(mappings),
        CREW_STATE: _json(state),
        PRODUCTION_COMMANDS: _json_lines(command_records),
        TOOL_CALLS: _json_lines(tools),
        AUTHORIZATIONS: _json(authorizations),
        ASSERTIONS: _json({"machineVerdict": verdict, "assertions": assertions}),
        SUMMARY: _summary(brief, terminal, mappings, command_records, verdict),
    }
    _refuse_secrets(authored, policy)
    return EvidenceBundle(
        files={**authored, HASH_INDEX: _json(_index(authored))},
        verdict=verdict,
    )


def _tool_calls(
    events: Sequence[Mapping[str, Any]],
    commands: Sequence[Mapping[str, Any]],
    brief_id: str,
    state: Mapping[str, Any],
    *,
    model_mode: str,
) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    for item in events:
        if item.get("status") != "completed":
            continue
        phase = item.get("phase")
        if phase not in {"research", "narrative", "art_direction", "visual_planning"}:
            continue
        role = item.get("role")
        if phase == "research":
            inquiry = state.get("researchInquiry")
            questions = list(inquiry) if isinstance(inquiry, list) else []
            if state.get("researchPlanningAttempted") is True:
                calls.append(
                    {
                        "role": role,
                        "tool": "planInquiry",
                        "providerMode": model_mode,
                        "safeArguments": {"briefId": brief_id},
                        "result": {"questionCount": len(questions)},
                    }
                )
            calls.append(
                {
                    "role": role,
                    "tool": "research",
                    "providerMode": item.get("providerMode"),
                    "safeArguments": {"briefId": brief_id, "questions": questions},
                }
            )
            continue
        tool = (
            "repair"
            if role == CrewRole.PLAN_REPAIR_AGENT.value
            else {
                "narrative": "narrate",
                "art_direction": "art_direct",
                "visual_planning": "plan",
            }[str(phase)]
        )
        calls.append(
            {
                "role": role,
                "tool": tool,
                "providerMode": item.get("providerMode"),
                "safeArguments": {
                    "briefId": brief_id,
                    **(
                        {"repairs": item.get("counts", {}).get("repairs")}
                        if tool == "repair" and isinstance(item.get("counts"), Mapping)
                        else {}
                    ),
                },
            }
        )

    production = state.get("production")
    for requirement_id, decision in _image_decisions(production):
        calls.append(
            {
                "role": decision["role"],
                "tool": "needsImage",
                "providerMode": model_mode,
                "safeArguments": {"requirementId": requirement_id},
                "result": {"needsImage": decision["needsImage"]},
            }
        )
    calls.extend(
        {
            "role": "director",
            "tool": item.get("command"),
            "providerMode": "production",
            "safeArguments": {
                "runId": (item.get("run") or {}).get("id")
                if isinstance(item.get("run"), Mapping)
                else None
            },
        }
        for item in commands
    )
    return calls


def _research_trace(checkpoint: Mapping[str, Any]) -> tuple[list[str] | None, bool]:
    inquiry = checkpoint.get("researchInquiry")
    planned = checkpoint.get("researchPlanningAttempted", False)
    if not isinstance(planned, bool):
        raise ValueError("Crew research planning evidence is malformed.")
    if inquiry is None:
        return None, planned
    if not isinstance(inquiry, list) or any(
        not isinstance(question, str) or not question.strip() for question in inquiry
    ):
        raise ValueError("Crew research inquiry evidence is malformed.")
    if len(inquiry) != len(set(inquiry)):
        raise ValueError("Crew research inquiry evidence repeats a question.")
    if any(DISCLOSURE.search(question) for question in inquiry):
        raise EvidenceLeaked("Crew research inquiry evidence contains a path or secret.")
    return list(inquiry), planned


def _image_decisions(
    production: Any,
) -> list[tuple[str, Mapping[str, Any]]]:
    if not isinstance(production, Mapping):
        return []
    return list(
        read_image_decisions(
            production.get("imageDecisions", {}),
            ValueError,
            "Crew Image Creator decision evidence is malformed.",
        )
    )


def _assertions(
    events: Sequence[Mapping[str, Any]],
    state: Mapping[str, Any],
    commands: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    sequences = [item.get("sequence") for item in events]
    outcome = events[-1].get("outcome")
    command_names = [item.get("command") for item in commands]
    assertions = [
        _assertion(
            "crew.sequence.ordered",
            sequences == list(range(sequences[0], sequences[0] + len(sequences))),
            [CREW_EVENTS],
        ),
        _assertion(
            "crew.terminal.explicit",
            outcome in {"rendered", "declined", "paused", "failed"},
            [CREW_EVENTS],
        ),
        _checkpoint_bound(state, events[-1], outcome),
        _assertion(
            "production.transcript.present",
            bool(commands),
            [PRODUCTION_COMMANDS],
        ),
    ]
    research = state.get("research")
    narrative = state.get("narrative")
    if isinstance(research, Mapping) and isinstance(narrative, Mapping):
        known = {
            item.get("id")
            for item in research.get("claims", [])
            if isinstance(item, Mapping)
        }
        grounded = all(
            not item.get("factual")
            or bool(item.get("claimIds"))
            and set(item.get("claimIds", [])) <= known
            for item in narrative.get("beats", [])
            if isinstance(item, Mapping)
        )
        assertions.append(
            _assertion("narrative.claims.grounded", grounded, [CREW_STATE])
        )
    if outcome == "rendered":
        preview = events[-1].get("preview")
        assertions.append(
            _assertion(
                "preview.digest.verified",
                isinstance(preview, Mapping)
                and isinstance(preview.get("sha256"), str)
                and len(preview["sha256"]) == 64,
                [CREW_EVENTS],
            )
        )
    if outcome == "declined":
        assertions.extend(
            (
                _assertion("decline.no-recording-spend", "run.record" not in command_names, [PRODUCTION_COMMANDS]),
                _assertion("decline.no-image-spend", "run.image.start" not in command_names, [PRODUCTION_COMMANDS]),
            )
        )
    return assertions


def _checkpoint_bound(
    state: Mapping[str, Any], terminal: Mapping[str, Any], outcome: Any
) -> dict[str, Any]:
    """Whether the checkpoint holds the terminal this bundle reports — and when it must not.

    A paused Run deliberately stores no terminal: a stored one is what a resumed invocation
    replays instead of continuing, so binding a pause would make the operator's decision
    unanswerable. That is not this assertion passing and it is not it failing; it is the Run
    having nothing to measure, which is what the sheet's third outcome is for. A pause whose
    checkpoint *did* carry a terminal is a real defect and still fails.
    """
    stored = state.get("terminal")
    if outcome == "paused" and stored is None:
        return {
            "id": "crew.checkpoint.bound",
            "expected": True,
            "observed": None,
            "pass": False,
            "outcome": NOT_EVIDENCED,
            "evidence": [CREW_STATE, CREW_EVENTS],
        }
    return _assertion("crew.checkpoint.bound", stored == terminal, [CREW_STATE, CREW_EVENTS])


def _assertion(identifier: str, passed: bool, evidence: list[str]) -> dict[str, Any]:
    return {
        "id": identifier,
        "expected": True,
        "observed": passed,
        "pass": passed,
        "outcome": PASS if passed else "fail",
        "evidence": evidence,
    }


def _summary(
    brief: Brief,
    terminal: Mapping[str, Any],
    events: Sequence[Mapping[str, Any]],
    commands: Sequence[Mapping[str, Any]],
    verdict: str,
) -> bytes:
    text = (
        f"# Crew run {brief.id} evidence\n\n"
        f"Machine verdict: **{verdict}**.\n\n"
        f"Terminal outcome: **{terminal.get('outcome')}**. "
        f"Observed {len(events) - 1} phase events and {len(commands)} Production envelopes.\n\n"
        "Provider credentials and grant identifiers are intentionally excluded. Artifact bytes "
        "remain in Production; this bundle carries their verified public handles and digests.\n"
    )
    return text.encode("utf-8")


def _json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode(
        "utf-8"
    )


def _json_lines(values: Sequence[Mapping[str, Any]]) -> bytes:
    return b"".join(_json(value) for value in values)


def _index(files: Mapping[str, bytes]) -> dict[str, str]:
    return {name: sha256(data).hexdigest() for name, data in sorted(files.items())}


def _refuse_secrets(files: Mapping[str, bytes], policy: OperatorPolicy) -> None:
    body = b"\n".join(files.values())
    if _SECRET.search(body):
        raise EvidenceLeaked("Crew evidence contains a credential-shaped value.")
    for access in (policy.research, policy.models, policy.images, policy.recording):
        if access.grant_id and access.grant_id.encode("utf-8") in body:
            raise EvidenceLeaked("Crew evidence contains an operator grant identifier.")


__all__ = [
    "AUTHORIZATIONS",
    "CREW_EVENTS",
    "CREW_STATE",
    "PRODUCTION_COMMANDS",
    "TOOL_CALLS",
    "assemble_crew_evidence",
]
