"""Editorial judgement is separate from contract validity and has a bounded revision loop."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from .crew_contract import ContractViolation


class EditorialRejected(Exception):
    """A valid plan remained artistically insufficient after bounded revision."""


@dataclass(frozen=True, slots=True)
class EditorialReview:
    accepted: bool
    observations: tuple[dict[str, Any], ...]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any], plan: Mapping[str, Any]) -> EditorialReview:
        if not isinstance(value, Mapping) or set(value) != {"accepted", "observations"}:
            raise ContractViolation("Editorial review must contain accepted and observations.")
        if not isinstance(value["accepted"], bool) or not isinstance(value["observations"], list):
            raise ContractViolation("Editorial review has invalid field types.")
        scene_ids = {scene["id"] for section in plan["sections"] for scene in section["scenes"]}
        observations = []
        for item in value["observations"]:
            if not isinstance(item, Mapping) or set(item) != {"sceneId", "problem", "suggestion"}:
                raise ContractViolation("Editorial observations must identify a problem and remedy.")
            if item["sceneId"] is not None and (
                not isinstance(item["sceneId"], str) or item["sceneId"] not in scene_ids
            ):
                raise ContractViolation("Editorial review names an unknown scene.")
            if any(not isinstance(item[k], str) or not item[k].strip() for k in ("problem", "suggestion")):
                raise ContractViolation("Editorial observations must be actionable.")
            observations.append(dict(item))
        if value["accepted"] == bool(observations):
            raise ContractViolation("Accept with no blocking observations; reject with concrete observations.")
        return cls(value["accepted"], tuple(observations))

    def to_mapping(self) -> dict[str, Any]:
        return {"accepted": self.accepted, "observations": [dict(o) for o in self.observations]}


class EditorialReviewer(Protocol):
    async def review(
        self, plan: Mapping[str, Any], context: Mapping[str, Any],
        specifications: tuple[dict[str, Any], ...],
    ) -> Mapping[str, Any]: ...
