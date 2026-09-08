"""Apply an unambiguous published repair without inventing a word or a physical time."""
from copy import deepcopy
import re

from .planner import _tokens


def unique_anchor_repair(plan, report):
    errors = report.get("errors", [])
    if len(errors) != 1 or errors[0].get("code") != "DEICTIC_ANCHOR_REQUIRED":
        return None
    error = errors[0]
    field = re.fullmatch(r"events\[(\d+)\]\.at", error.get("field", ""))
    if not field:
        return None
    scenes = [scene for section in plan["sections"] if section["id"] == error.get("sectionId")
              for scene in section["scenes"] if scene["id"] == error.get("sceneId")]
    if len(scenes) != 1:
        return None
    scene = scenes[0]
    events = scene.get("events", [])
    index = int(field[1])
    if index >= len(events):
        return None
    beats = {beat["id"]: (i, _tokens(beat["text"])) for i, beat in enumerate(plan["beats"])}

    def position(anchor):
        # Offsets require recorded timing. Refuse them rather than estimate their ordering.
        if not isinstance(anchor, str) or "." not in anchor:
            return None
        beat, point = anchor.split(".", 1)
        if beat == "scene" and point in ("start", "end"):
            beat = scene["spansBeats"][0 if point == "start" else -1]
        if beat not in beats or beat not in scene["spansBeats"]:
            return None
        ordinal, words = beats[beat]
        if point == "start":
            return ordinal, -1
        if point == "end":
            return ordinal, len(words)
        if point.startswith("word:") and words.count(point[5:]) == 1:
            return ordinal, words.index(point[5:])
        return None

    candidates = []
    offered = error.get("expected", [])
    if not isinstance(offered, list) or any(not isinstance(value, str) for value in offered):
        return None
    for anchor in dict.fromkeys(offered):
        if ".word:" not in anchor or anchor == events[index].get("at"):
            continue
        positions = [position(anchor if i == index else event.get("at")) for i, event in enumerate(events)]
        if all(p is not None for p in positions) and all(a <= b for a, b in zip(positions, positions[1:])):
            candidates.append(anchor)
    if len(candidates) != 1:
        return None
    revised = deepcopy(plan)
    for section in revised["sections"]:
        if section["id"] == error["sectionId"]:
            for value in section["scenes"]:
                if value["id"] == scene["id"]:
                    value["events"][index]["at"] = candidates[0]
    return revised
