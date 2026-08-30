"""What one Run sends a model, measured against the material it would actually send.

The dominant term is not estimated. The resident prefix is assembled from the recorded
projections and the refusals are the recorded ones with the bodies their envelopes published,
so a contract that grows moves these numbers and the guards below fail — rather than the
budget quietly stopping being true on a billed Run.

Two terms are named constants with their provenance rather than measurements, because they
live on the TypeScript side of the boundary and this is a Python process: the length of the
catalogue showcase Brief, and the size of an eight-scene plan authored for it. Both are
rounded up from figures taken off a real showcase proof, which is the same trade
`repair_budget` takes with the harness's cycle rule.

The one number that is not a measurement at all is `CHARS_PER_TOKEN`. There is no offline
Gemma tokenizer on this machine and a crew test may not reach the network for one, so the
token figure is a deliberate upper bound over an exact character count rather than a count
pretending to be exact.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from conftest import a_budget, recorded, recorded_bytes
from test_planner import CATALOG, CATEGORIES, SURFACE
from vox_crew.client import Artifact
from vox_crew.context import (
    CHARS_PER_TOKEN,
    FRESH_CHARS,
    FRESH_CHARS_PER_ASK,
    LARGEST_PUBLISHED_SPEC_CHARS,
    MODEL_CALLS,
    MODEL_CALLS_PER_ASK,
    RESIDENT_CHARS,
    RESIDENT_CHARS_ALLOWED,
    RETURNED_CHARS,
    RETURNED_CHARS_PER_ASK,
    Ask,
    ContextBudget,
    ContextSpend,
    context_budget,
    tokens,
)
from vox_crew.converge import repair_budget, target_seconds
from vox_crew.envelopes import ArtifactDescriptor, parse_envelope
from vox_crew.planner import instructions, message_text, taught_categories
from vox_crew.refusals import read_refusal

# What a showcase Brief asks for, in the words a Brief asks in. Only the duration matters
# here — it is what `repair_budget` keys on — and it is the one part of
# `CATALOG_SHOWCASE_BRIEF` that can be restated without copying 1.8 KB of prose across the
# boundary. Its length is carried separately, below.
A_SHOWCASE_LENGTH_BRIEF = "A 110-130-second editorial explainer."

# `CATALOG_SHOWCASE_BRIEF` in `packages/production/src/proof/catalog-showcase.ts` is 1,806
# characters. Rounded up, because a budget term wants an upper bound and an exact figure
# copied across the boundary would be a second source of truth that drifts in silence.
SHOWCASE_BRIEF_CHARS = 2_000

# An eight-scene plan authored for that Brief compacts to 5,693 characters — measured off the
# plan the catalogue showcase proof of 2026-08-23 recorded. Rounded up for the same reason.
SHOWCASE_PLAN_CHARS = 8_000

# The three refusals the fixtures record, as the crew would assemble them for an author.
REFUSALS = (
    ("run-validate-needs-repair.stdout", "validation-report.json", False),
    ("run-compile-needs-repair.stdout", "compile-report-needs-repair.json", False),
    ("run-preflight-duration-risk.stdout", "preflight-report-duration-risk.json", True),
)


class ReportsFromFixtures:
    """Answers a descriptor with the recorded body, so a `Refusal` can be assembled offline.

    Narrower than `test_converge`'s scripted client on purpose: nothing here drives a Run, and
    the only thing a refusal needs a client for is the report its envelope published.
    """

    def __init__(self, body: bytes) -> None:
        self._body = body

    def fetch_artifact(self, run_id: str, artifact: ArtifactDescriptor) -> Artifact:
        return Artifact(kind=artifact.kind, sha256=artifact.sha256, data=self._body)


def largest_recorded_refusal() -> int:
    """The biggest thing production has ever published about a plan, as an author reads it."""
    return max(
        len(
            read_refusal(
                ReportsFromFixtures(recorded_bytes(body)),  # type: ignore[arg-type]
                "a-run",
                parse_envelope(recorded(envelope)),
                SURFACE,
                advisory=advisory,
            ).as_text()
        )
        for envelope, body, advisory in REFUSALS
    )


def message_chars(message: Mapping[str, Any] | str) -> int:
    """What the crew hands an author beside the instructions, sized the way it is *sent*.

    Through `planner.message_text` rather than a `json.dumps` of this test's own. A second
    serialisation here would drift from production's the first time either changed, and this
    guard would go on passing against text nobody sends.
    """
    return len(message_text(message))  # type: ignore[arg-type]


# --- the account --------------------------------------------------------------------------


def test_an_ask_is_the_resident_prefix_plus_what_that_turn_added() -> None:
    assert Ask(resident=100, fresh=7).chars == 107


def test_a_spend_charges_the_resident_prefix_once_however_many_turns_read_it() -> None:
    """One prefix charged once, in one assertion: six turns, one catalog counted."""
    spend = ContextSpend(tuple(Ask(resident=1000, fresh=10) for _ in range(6)))

    assert spend.asks_made == 6
    assert spend.resident_chars == 1000
    assert spend.fresh_chars == 60
    assert spend.sent_chars == 1060


def test_a_spend_says_what_reached_a_model_and_how_much_of_it_was_the_repeated_prefix() -> None:
    """Not a saving: every one of those characters was transmitted. Six turns re-sent five."""
    spend = ContextSpend(tuple(Ask(resident=1000, fresh=10) for _ in range(6)))

    assert spend.distinct_chars == 6060
    assert spend.repeated_prefix_chars == 5000


def test_an_empty_spend_is_zero_rather_than_an_error() -> None:
    """A Run that ended before it asked anything spent nothing, and says so."""
    spend = ContextSpend(())

    assert spend.asks_made == 0
    assert spend.resident_chars == 0
    assert spend.sent_chars == 0
    assert spend.distinct_chars == 0
    assert spend.repeated_prefix_chars == 0
    assert spend.one_prefix


def test_a_spend_whose_turns_read_different_prefixes_reports_more_than_one() -> None:
    """The invariant behind the first criterion: two prefixes are not one reusable prefix.

    Lengths rather than bytes, because this is an account and not a second copy of a 124 KB
    prompt. Byte identity is asserted where the prefix is built, by counting how many times a
    whole convergence assembles one.
    """
    spend = ContextSpend((Ask(resident=1000, fresh=10), Ask(resident=1200, fresh=10)))

    assert not spend.one_prefix
    assert spend.resident_chars == 1200


# --- the budget ---------------------------------------------------------------------------


def test_the_budget_scales_its_turn_allowance_with_the_asks_the_repair_budget_allows() -> None:
    """One line is the catalog, charged once however many asks; the other grows with the loop."""
    assert context_budget(6) == ContextBudget(
        resident_chars=RESIDENT_CHARS_ALLOWED,
        fresh_chars=FRESH_CHARS_PER_ASK * 6,
        model_calls=MODEL_CALLS_PER_ASK * 6,
        returned_chars=RETURNED_CHARS_PER_ASK * 6,
    )


def test_an_overrun_names_the_line_it_passed_rather_than_answering_yes_or_no() -> None:
    budget = a_budget(resident_chars=100, fresh_chars=50, model_calls=4)

    assert ContextSpend((Ask(resident=100, fresh=50),)).overrun(budget) is None
    assert ContextSpend((Ask(resident=101, fresh=0),)).overrun(budget) == RESIDENT_CHARS
    assert ContextSpend((Ask(resident=100, fresh=51),)).overrun(budget) == FRESH_CHARS


def test_an_author_looping_against_its_tool_passes_the_rate_line() -> None:
    """The term the crew does not choose, held to a line rather than only reported.

    `repair_budget` decides how many plan versions a Run may ask for. How many times an author
    calls a tool inside one of them is the model's decision, and before this line existed it
    was the one term in a Run's spend that nothing bounded.
    """
    budget = a_budget(model_calls=4)

    assert ContextSpend((Ask(resident=1, fresh=1, model_calls=4),)).overrun(budget) is None
    assert (
        ContextSpend((Ask(resident=1, fresh=1, model_calls=5),)).overrun(budget) == MODEL_CALLS
    )


def test_an_author_pulling_back_more_than_its_tools_may_hand_it_passes_the_returned_line() -> (
    None
):
    """The other half of the same unchosen term: how much a tool hands back, not how often.

    The rate line bounds the number of answers and nothing bounded their size. A search that
    matched everything and a specification the catalog publishes at ten thousand characters
    both arrive in one call, so a Run could stay inside the rate line and still pull back more
    than the catalog it was already holding.
    """
    budget = a_budget(returned_chars=100)

    assert ContextSpend((Ask(resident=1, fresh=1, returned=100),)).overrun(budget) is None
    assert (
        ContextSpend((Ask(resident=1, fresh=1, returned=101),)).overrun(budget)
        == RETURNED_CHARS
    )


def test_the_returned_line_is_read_against_the_run_total_rather_than_one_ask() -> None:
    """Per ask, checked against the whole Run — the shape `FRESH_CHARS_PER_ASK` already has.

    A turn that needed three specifications where the previous turn needed none is paid for
    out of the turn that fetched nothing, rather than ending a Run mid-repair.
    """
    budget = a_budget(returned_chars=100)

    within = ContextSpend((Ask(resident=1, fresh=1, returned=90), Ask(resident=1, fresh=1)))
    past = ContextSpend(
        (Ask(resident=1, fresh=1, returned=90), Ask(resident=1, fresh=1, returned=11))
    )

    assert within.overrun(budget) is None
    assert past.overrun(budget) == RETURNED_CHARS


def test_the_lines_are_read_resident_then_rate_then_returned_then_turn() -> None:
    """The whole order, over one spend that passes every one of them.

    Each line is dropped in turn from a spend that fails all four, so the answer walks down the
    order rather than being asserted a pair at a time. What the order encodes: a prefix that
    does not fit is true before a Run exists, a Run that looped against a tool spent its budget
    on calls rather than plan versions, and the characters either of those moved are a symptom
    of the finding rather than the finding.
    """
    budget = a_budget(resident_chars=100, fresh_chars=10, model_calls=2, returned_chars=10)

    assert ContextSpend(
        (Ask(resident=1000, fresh=100, model_calls=9, returned=100),)
    ).overrun(budget) == RESIDENT_CHARS
    assert ContextSpend(
        (Ask(resident=1, fresh=100, model_calls=9, returned=100),)
    ).overrun(budget) == MODEL_CALLS
    assert ContextSpend(
        (Ask(resident=1, fresh=100, model_calls=1, returned=100),)
    ).overrun(budget) == RETURNED_CHARS
    assert ContextSpend(
        (Ask(resident=1, fresh=100, model_calls=1, returned=1),)
    ).overrun(budget) == FRESH_CHARS


def test_the_resident_line_is_read_before_the_turn_line() -> None:
    """A prefix that does not fit is the finding; what a turn added on top of it is noise."""
    budget = a_budget(resident_chars=100, fresh_chars=50, model_calls=4)

    assert ContextSpend((Ask(resident=200, fresh=200),)).overrun(budget) == RESIDENT_CHARS


def test_tokens_are_an_upper_bound_over_an_exact_character_count() -> None:
    assert tokens(0) == 0
    assert tokens(CHARS_PER_TOKEN) == 1
    assert tokens(CHARS_PER_TOKEN + 1) == 2


# --- the measurement the budget was set from -----------------------------------------------


def test_the_resident_teaching_surface_fits_the_allowance_it_was_measured_against() -> None:
    """The dominant term, over the projections a model is actually sent.

    This is the guard that keeps the number in `context.py` a measurement rather than a
    memory. A catalog that grows past the allowance fails here, with both figures beside each
    other, instead of on a billed Run.

    Two sets, deliberately: the surface holds every category the contract publishes, and the
    prefix carries the ones addressed to an author. Both are named, because a filter that
    dropped everything would fit this allowance beautifully — and the guard against that is
    the catalog being *in* the prefix, not a ratio. What a prefix ought to weigh relative to
    its budget has never been argued, and ticket 23's refusal to encode an unargued number
    stands here as much as it does in the census.
    """
    resident = len(instructions(SURFACE))

    assert resident <= RESIDENT_CHARS_ALLOWED, (
        f"the teaching surface is now {resident} characters, past the "
        f"{RESIDENT_CHARS_ALLOWED} the budget allows"
    )
    assert set(SURFACE.categories) == set(CATEGORIES)
    assert "catalog" in taught_categories(SURFACE)


def test_the_largest_specification_the_catalog_publishes_fits_the_answer_ceiling() -> None:
    """The measured input the returned line is derived from, held to the line it was set at.

    `RETURNED_CHARS_PER_ASK` is three answers at the size the catalog publishes its largest
    specification at. That size is a fact about another team's contract, so it is measured here
    rather than remembered: a capability whose specification outgrows the ceiling moves the
    derivation, and the constant has to move with it or stop being derived from anything.

    Sized through `message_text` rather than a `json.dumps` of this test's own, for the reason
    `message_chars` is: a second serialisation would drift from the one a tool would answer
    through, and this guard would go on passing against text nobody hands back.
    """
    published = [len(message_text(capability)) for capability in CATALOG["capabilities"]]

    assert max(published) <= LARGEST_PUBLISHED_SPEC_CHARS, (
        f"the catalog's largest specification is now {max(published)} characters, past the "
        f"{LARGEST_PUBLISHED_SPEC_CHARS} the returned line was derived from"
    )


def test_one_turn_may_fetch_the_whole_catalog_and_a_run_that_keeps_doing_it_may_not() -> None:
    """What the returned line actually refuses, priced against a budget a Run is issued.

    The line is per ask and read against the Run's total — the shape the fresh line already has
    and the shape this ticket asked for. That shape has a consequence worth asserting rather
    than discovering: a single turn *may* pull back more than one ask's allowance, paid for out
    of the turns that fetched nothing. So an author that fetches all eight specifications once
    is inside its budget, and what the line refuses is an author that keeps doing it.

    Against `repair_budget`'s own smallest Run rather than against the bare constant. A guard
    that priced the catalog against `RETURNED_CHARS_PER_ASK` alone would report a refusal that
    no Run ever issues — the smallest returned budget any Brief is given is five asks' worth,
    which is three times the catalog. That reading made it into a first draft of this ticket and
    is the reason this test names a budget.

    It is also the evidence that the returned line is not a restatement of the rate line: every
    spend here stays well inside the calls it was budgeted, and the Run is still refused.
    """
    catalog = sum(len(message_text(item)) for item in CATALOG["capabilities"])
    asks = repair_budget(target_seconds({"text": A_SHOWCASE_LENGTH_BRIEF})).plan_versions
    budget = context_budget(asks)

    def fetching(turns: int) -> ContextSpend:
        """A Run whose every turn pulled the whole catalog back over two model calls."""
        return ContextSpend(
            tuple(Ask(resident=1, fresh=1, model_calls=2, returned=catalog) for _ in range(turns))
        )

    affordable = budget.returned_chars // catalog

    assert fetching(1).overrun(budget) is None
    assert fetching(affordable).overrun(budget) is None
    assert fetching(affordable + 1).overrun(budget) == RETURNED_CHARS
    # Inside its calls and refused anyway, which is the term the rate line does not bound.
    assert fetching(affordable + 1).model_calls <= budget.model_calls
    # And the reach is not the whole Run: a Brief cannot fetch the catalog on every turn.
    assert affordable < asks


def test_a_showcase_run_at_its_worst_stays_inside_the_budget() -> None:
    """Every turn a showcase Brief is budgeted, each carrying the largest refusal recorded.

    A showcase Brief asks for 110-130 seconds, which `repair_budget` reads as six plan
    versions — one authoring turn and five repairs. Each repair is handed back the plan it
    wrote and the biggest thing production has ever published about one.

    Constructed rather than run: a live showcase run measures the turns that happened, and a
    budget has to hold for the turns that could.
    """
    asks = repair_budget(target_seconds({"text": A_SHOWCASE_LENGTH_BRIEF})).plan_versions
    assert asks == 6

    resident = len(instructions(SURFACE))
    authoring = message_chars("b" * SHOWCASE_BRIEF_CHARS)
    repairing = largest_recorded_refusal() + message_chars(
        {"brief": "b" * SHOWCASE_BRIEF_CHARS, "plan": "p" * SHOWCASE_PLAN_CHARS}
    )
    spend = ContextSpend(
        (Ask(resident=resident, fresh=authoring),)
        + tuple(Ask(resident=resident, fresh=repairing) for _ in range(asks - 1))
    )

    assert spend.overrun(context_budget(asks)) is None
    assert spend.one_prefix
