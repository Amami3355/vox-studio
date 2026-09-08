"""Exercise role feedback and refusal before media, without pretending to measure model quality."""
import asyncio
from copy import deepcopy

import pytest

from vox_crew.crew_contract import Brief, ContractViolation
from vox_crew.crew_run import brief_from
from vox_crew.editorial import EditorialRejected, EditorialReview
from vox_crew.visual_planner import PublishedCatalog, SplitVisualPlanner
from test_visual_planner import SceneAuthor, Structurer, catalog_contract, green, inputs, structure


def rejected():
    return {"accepted": False, "observations": [{"sceneId": "claim",
        "problem": "The title remains while the narration explains a relationship.",
        "suggestion": "Select a capability that can show the relationship."}]}


class Reviewer:
    def __init__(self, answers):
        self.answers = iter(answers)
        self.seen = []

    async def review(self, plan, context, specifications):
        self.seen.append(deepcopy((plan, context, specifications)))
        return next(self.answers)


def planner_with(reviewer, structurer=None, author=None, **kwargs):
    return SplitVisualPlanner(PublishedCatalog.from_mapping(catalog_contract()),
        structurer or Structurer(), author or SceneAuthor(),
        validate_scene=green, validate_plan=green, reviewer=reviewer, **kwargs)


def test_editorial_feedback_returns_to_the_structurer_with_role_scoped_specs():
    class RevisedStructurer(Structurer):
        calls = 0

        async def structure(self, *args, feedback=None):
            self.calls += 1
            answer = structure()
            if feedback:
                assert feedback["observations"] == rejected()["observations"]
                answer["sections"][0]["scenes"][0]["component"] = "stat_counter"
            return answer

    class RevisedAuthor(SceneAuthor):
        async def author(self, structure, specifications, tools, *, context=None):
            assert context["brief"] == inputs()[0].to_mapping()
            assert context["visualBible"] == inputs()[3].to_mapping()
            answer = deepcopy(self.answer)
            if specifications[0]["id"] == "stat_counter":
                answer["scenes"][0] = {"id": "claim", "props": {"value": 3, "label": "Categories"}}
                assert context["editorialFeedback"]["observations"]
            return answer

    structurer = RevisedStructurer()
    reviewer = Reviewer([rejected(), {"accepted": True, "observations": []}])
    planner = planner_with(reviewer, structurer, RevisedAuthor())
    plan = asyncio.run(planner.plan(*inputs()))
    assert structurer.calls == 2
    assert plan["beats"] == structure()["beats"]
    assert plan["sections"][0]["scenes"][0]["component"] == "stat_counter"
    assert [[s["id"] for s in seen[2]] for seen in reviewer.seen] == [["typographic_statement"], ["stat_counter"]]
    assert planner.editorial_reviews == [rejected(), {"accepted": True, "observations": []}]


def test_editorial_exhaustion_stops_instead_of_accepting_or_claiming_a_catalog_gap():
    class Again(Structurer):
        async def structure(self, *args, feedback=None):
            return structure()
    reviewer = Reviewer([rejected(), rejected()])
    planner = planner_with(reviewer, Again())
    with pytest.raises(EditorialRejected):
        asyncio.run(planner.plan(*inputs()))
    assert len(reviewer.seen) == 2


def test_a_revision_cannot_rewrite_recording_identity():
    class RewritesBeats(Structurer):
        async def structure(self, *args, feedback=None):
            answer = structure()
            if feedback:
                answer["beats"][0]["text"] = "A different narration."
            return answer
    reviewer = Reviewer([rejected()])
    with pytest.raises(ContractViolation, match="preserve Narrative Beats"):
        asyncio.run(planner_with(reviewer, RewritesBeats()).plan(*inputs()))


@pytest.mark.parametrize("text", ["Explain a mechanism.", "Compare two measurements.", "Tell a historical story."])
def test_editorial_acceptance_has_no_scene_count_or_motion_quota(text):
    args = list(inputs())
    args[0] = Brief(args[0].id, text, args[0].kind, duration_seconds=50, max_generated_images=5)
    reviewer = Reviewer([{"accepted": True, "observations": []}])
    plan = asyncio.run(planner_with(reviewer).plan(*args))
    assert len(plan["beats"]) == 1
    assert reviewer.seen[0][1]["brief"]["maxGeneratedImages"] == 5


@pytest.mark.parametrize("value", [
    {"accepted": True, "observations": rejected()["observations"]},
    {"accepted": False, "observations": []},
    {"accepted": False, "observations": [{"sceneId": [], "problem": "x", "suggestion": "y"}]},
])
def test_malformed_review_never_reaches_a_reselection(value):
    with pytest.raises(ContractViolation):
        EditorialReview.from_mapping(value, structure())


@pytest.mark.parametrize("field,value", [("durationSeconds", 0), ("durationSeconds", float('nan')),
    ("durationSeconds", True), ("maxGeneratedImages", -1), ("maxGeneratedImages", 1.5),
    ("maxGeneratedImages", True), ("maxGeneratedImages", None)])
def test_only_well_formed_creative_limits_cross_the_brief_contract(field, value):
    with pytest.raises(ContractViolation):
        Brief.from_mapping({"id": "x", "text": "Explain.", "kind": "test_data", field: value})


def test_structured_limits_survive_request_admission_and_old_briefs_stay_unchanged():
    original = inputs()[0]
    assert set(original.to_mapping()) == {"id", "text", "kind"}
    request = {"brief": {"id": "preview", "text": "Explain.", "durationSeconds": 50, "maxGeneratedImages": 5}}
    brief = brief_from(request, original.kind)
    assert brief.duration_seconds == 50
    assert brief.max_generated_images == 5


def test_word_anchor_grammar_is_the_published_vocabulary_not_a_prompt_invention():
    reviewer = Reviewer([{"accepted": True, "observations": []}])
    author = SceneAuthor()
    asyncio.run(planner_with(reviewer, author=author).plan(*inputs()))
    assert author.context["authoringVocabulary"]["time"] == catalog_contract()["time"]
    assert author.context["authoringVocabulary"]["visualVocabulary"] == catalog_contract()["visualVocabulary"]


def test_unresolved_editorial_review_pauses_before_production_and_resume_buys_no_more_calls():
    from vox_crew.crew import ProductionCrew
    from vox_crew.crew_contract import Paused, ProviderMode, VisualVocabulary
    from vox_crew.crew_state import InMemoryCrewStateStore
    from vox_crew.recorded import RecordedCreativeAdapter, RecordedResearchAdapter
    from test_crew_tracer import DOSSIER, NARRATIVE, BIBLE, PLAN, collect

    class RejectedPlanner:
        mode = ProviderMode.RECORDED
        calls = 0
        editorial_reviews = [rejected(), rejected()]

        async def plan(self, *args):
            self.calls += 1
            raise EditorialRejected()

    planner = RejectedPlanner()
    store = InMemoryCrewStateStore()
    subject = ProductionCrew(
        RecordedResearchAdapter(DOSSIER), RecordedCreativeAdapter(NARRATIVE, BIBLE, PLAN),
        object(),  # Reaching any Production operation would fail this test.
        visual_planner=planner, state_store=store,
        visual_vocabulary=VisualVocabulary(themes=frozenset({'editorial-cold'}),
            motion_intents=frozenset({'measured'}), color_roles=frozenset({'ground', 'accent'}),
            treatments=frozenset({'documentary', 'glossy'})),
    )
    first = collect(subject)
    assert isinstance(first[-1].result, Paused)
    assert first[-1].result.run_id is None
    assert collect(subject) == [first[-1]]
    assert planner.calls == 1
    assert asyncio.run(store.load('tracer-brief'))['editorialReviews'] == planner.editorial_reviews
