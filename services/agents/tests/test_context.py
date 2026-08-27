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

from conftest import recorded, recorded_bytes
from test_planner import CATEGORIES, SURFACE
from vox_crew.client import Artifact
from vox_crew.context import (
    CHARS_PER_TOKEN,
    FRESH_CHARS,
    FRESH_CHARS_PER_ASK,
    MODEL_CALLS,
    MODEL_CALLS_PER_ASK,
    RESIDENT_CHARS,
    RESIDENT_CHARS_ALLOWED,
    Ask,
    ContextBudget,
    ContextSpend,
    context_budget,
    tokens,
)
from vox_crew.converge import repair_budget, target_seconds
from vox_crew.envelopes import ArtifactDescriptor, parse_envelope
from vox_crew.planner import instructions, message_text
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
    """One line is the catalog, which is sent once; the other grows with the loop."""
    assert context_budget(6) == ContextBudget(
        resident_chars=RESIDENT_CHARS_ALLOWED,
        fresh_chars=FRESH_CHARS_PER_ASK * 6,
        model_calls=MODEL_CALLS_PER_ASK * 6,
    )


def test_an_overrun_names_the_line_it_passed_rather_than_answering_yes_or_no() -> None:
    budget = ContextBudget(resident_chars=100, fresh_chars=50, model_calls=4)

    assert ContextSpend((Ask(resident=100, fresh=50),)).overrun(budget) is None
    assert ContextSpend((Ask(resident=101, fresh=0),)).overrun(budget) == RESIDENT_CHARS
    assert ContextSpend((Ask(resident=100, fresh=51),)).overrun(budget) == FRESH_CHARS


def test_an_author_looping_against_its_tool_passes_the_rate_line() -> None:
    """The term the crew does not choose, held to a line rather than only reported.

    `repair_budget` decides how many plan versions a Run may ask for. How many times an author
    calls a tool inside one of them is the model's decision, and before this line existed it
    was the one term in a Run's spend that nothing bounded.
    """
    budget = ContextBudget(resident_chars=10**9, fresh_chars=10**9, model_calls=4)

    assert ContextSpend((Ask(resident=1, fresh=1, model_calls=4),)).overrun(budget) is None
    assert (
        ContextSpend((Ask(resident=1, fresh=1, model_calls=5),)).overrun(budget) == MODEL_CALLS
    )


def test_the_rate_line_is_read_before_the_character_line_it_would_also_blow() -> None:
    """A Run that looped against a tool spent its budget on calls, not on plan versions.

    Where the characters went is a symptom; the finding is the loop, so the loop is what the
    overrun names.
    """
    budget = ContextBudget(resident_chars=10**9, fresh_chars=10, model_calls=2)

    assert ContextSpend((Ask(resident=1, fresh=100, model_calls=9),)).overrun(budget) == (
        MODEL_CALLS
    )


def test_the_resident_line_is_read_before_the_turn_line() -> None:
    """A prefix that does not fit is the finding; what a turn added on top of it is noise."""
    budget = ContextBudget(resident_chars=100, fresh_chars=50, model_calls=4)

    assert ContextSpend((Ask(resident=200, fresh=200),)).overrun(budget) == RESIDENT_CHARS


def test_tokens_are_an_upper_bound_over_an_exact_character_count() -> None:
    assert tokens(0) == 0
    assert tokens(CHARS_PER_TOKEN) == 1
    assert tokens(CHARS_PER_TOKEN + 1) == 2


# --- the measurement the budget was set from -----------------------------------------------


def test_the_resident_teaching_surface_fits_the_allowance_it_was_measured_against() -> None:
    """The dominant term, over every projection the contract publishes today.

    This is the guard that keeps the number in `context.py` a measurement rather than a
    memory. A catalog that grows past the allowance fails here, with both figures beside each
    other, instead of on a billed Run.
    """
    resident = len(instructions(SURFACE))

    assert resident <= RESIDENT_CHARS_ALLOWED, (
        f"the teaching surface is now {resident} characters, past the "
        f"{RESIDENT_CHARS_ALLOWED} the budget allows"
    )
    assert set(SURFACE.categories) == set(CATEGORIES)


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
