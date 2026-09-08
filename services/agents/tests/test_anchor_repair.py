from copy import deepcopy

import pytest

from vox_crew.anchor_repair import unique_anchor_repair


def fixture():
    plan = {"beats": [{"id": "b", "text": "We travel a longer path today."}], "sections": [{
        "id": "s", "scenes": [{"id": "v", "spansBeats": ["b"], "events": [
            {"at": "b.word:path"}, {"at": "b.word:travel"}, {"at": "b.word:today"}]}]}]}
    report = {"errors": [{"code": "DEICTIC_ANCHOR_REQUIRED", "sectionId": "s", "sceneId": "v",
        "field": "events[1].at", "expected": ["b.word:longer", "b.word:path"]}]}
    return plan, report


def test_only_one_existing_word_changes_and_inputs_are_preserved():
    plan, report = fixture()
    original = deepcopy(plan)
    revised = unique_anchor_repair(plan, report)
    original["sections"][0]["scenes"][0]["events"][1]["at"] = "b.word:path"
    assert revised == original
    assert plan == fixture()[0] and report == fixture()[1]
    assert unique_anchor_repair(revised, report) is None


@pytest.mark.parametrize("case", ["ambiguous", "offset", "nonexistent", "repeated", "wrong_scene", "wrong_field", "other_error", "multiple_errors", "next_event"])
def test_uncertain_or_out_of_scope_repairs_are_declined(case):
    plan, report = fixture()
    events = plan["sections"][0]["scenes"][0]["events"]
    error = report["errors"][0]
    if case == "ambiguous": events[0]["at"] = "b.start"
    if case == "offset": events[0]["at"] = "b.start+short"
    if case == "nonexistent": error["expected"] = ["b.word:missing"]
    if case == "repeated": plan["beats"][0]["text"] += " path"
    if case == "wrong_scene": error["sceneId"] = "unknown"
    if case == "wrong_field": error["field"] = "events[1].payload.text"
    if case == "other_error": error["code"] = "EVENTS_OUT_OF_ORDER"
    if case == "multiple_errors": report["errors"].append(deepcopy(error))
    if case == "next_event": events[2]["at"] = "b.word:longer"
    before = deepcopy(plan)
    assert unique_anchor_repair(plan, report) is None
    assert plan == before
