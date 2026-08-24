# The agent crew

The crew takes an editorial Brief and drives the Agent production interface to a narrated
preview: discover the contracts, author a VideoPlan, repair it against the compiler's refusals,
Preflight, record a Take, compile, render — or Decline, when the catalog cannot serve what the
Brief asks for.

The producer half of that loop exists: the crew reaches the production boundary, asks for the
teaching surface, authors a VideoPlan from it, repairs it against whatever production refuses,
and carries it to a preview. The researcher, and the Decline, arrive with the tickets that
follow.

## Running it

The crew works from inside a work root, which is built for it:

```
pnpm --filter @vox/production bootstrap:workroot
```

That leaves `C:\vox-proof-workroots\crew` holding the launcher and the Brief's request, and
nothing else. Start the production service in another shell (`pnpm --filter @vox/production
service`, with the trusted configuration in its environment), then:

```
python -m vox_crew --work-root C:\vox-proof-workroots\crew
```

Stdout carries production's envelopes and nothing else, in the order they arrived, byte for
byte, so a run redirected to a file is a record of what the interface said. Everything the crew
has to say about them goes to stderr.

## How it is put together

**`client.py` is the deployment seam** (ADR-0015), not the transport. One interface, two
implementations — the local one here, an HTTP one when production moves to Cloud Run — and no
tool, agent instruction or test may branch on which is active. Its methods are payload-shaped
in both directions: a Run is named by its id, inputs the command surface takes as files arrive
as objects, and artifacts come back through `fetch_artifact`, which takes a Run id and the
descriptor an envelope published. A method that took or returned a path would work locally and
strand the crew at deployment, which is why `tests/test_local_client.py` asserts against one
structurally rather than leaving it to review.

**`local_client.py` is the only module that knows a path exists.** It runs `vox.exe` with its
working directory set to the work root, one subprocess per command, over the authenticated
named pipe ADR-0007 requires. Payloads are staged where the work root keeps its invariant of
growing nothing but its Run directories.

**`envelopes.py` keeps what the service said.** The parsed fields are a convenience for the
code around the model; `raw` is what the model is shown. The crew learns from the interface's
own refusals — `means`, `repair`, and the `next` suggestions — so its prompts never restate
them, and nothing here paraphrases them either.

**`teaching_surface.py` earns the contract by asking for it.** The categories come from the
index rather than a list in the crew, so a category the contract adds is a category the crew
reads. The projections are held in context and never written into the work root: that is what
keeps the work root evidence rather than just a directory.

**`producer.py` drives one Run from a Brief to a preview.** Initialise, validate, Preflight,
record, compile, render, then read the two reports and the preview back through the client. It
is handed a plan and does not care who wrote it — a fixture plan drives the whole client
surface for zero tokens, and the planner calls the same sequence with an authored one, because
the sequence belongs to the interface rather than the model. A refusal stops the Run and comes
back intact — `needs_repair` and `failed` carry the report, the `means`, the `repair` and the
`next` suggestions that the repair loop is built from, and raising on them would replace all of
it with a stack trace.

**`planner.py` is where a model enters the loop.** It assembles the instructions from the
categories the index published and the bodies they carry, so a category the contract adds is a
category the planner teaches and a capability the catalog gains is one the model can reach for.
The crew's own prose is one short preamble.

Three things about it are worth knowing before changing it.

*A prompt is scanned before it is sent.* `scan_for_leaks` is the leak-scan discipline the
proofs apply to a work root, applied to the text of a prompt, and `author_plan` runs it as a
gate: instructions carrying repository vocabulary raise rather than reach a model. The crew is
code-blind by convention in this phase, and a prompt is the easiest place to lose that quietly.
What the interface publishes about itself is deliberately not scanned for — a contract it hands
out is not a leak.

*What comes back is read in the compiler's own words.* `review` reports findings whose codes,
`means` and `repair` come from the published checks contract, so the crew names a defect the
way the interface names it. It covers what the instructions are responsible for teaching —
physical time, capability, action and anchor names, semantic asset requirements — and is not a
second compiler. Findings do not stop a plan being submitted: the compiler is the only
authority on a plan, and a crew that refused on its own reading would put its opinion above the
interface's. They travel with the Run for the repair loop and the evidence bundle to read.

*`PlanAuthor` is the model seam.* One interface, a live implementation (`AdkPlanAuthor`) and a
scripted one in the tests, and nothing above it knows which it holds — `client.py`'s rule
applied to the model, for the same reason. It has two methods, because authoring is a function
of an instruction set and a Brief while a repair is also a function of the plan that was
refused and what was said about it; an author asked to repair without those would be authoring
from scratch. Both are payload-shaped: no client, no path, and no opinion about the production
sequence.

**`refusals.py` gathers what production said, and never restates it.** A refusal already
carries a report, published codes and a suggested next command, and the checks contract carries
a `means` and a `repair` for every code in it. So this module composes nothing: it fetches the
report by the descriptor the envelope published, looks up the published meanings of exactly the
codes that report named, adds what the protocol category publishes about repair, and labels
them with four headings. A summary in the crew's own words would be a paraphrase standing where
the interface's words were available, and would go stale the first time a `repair` was reworded.

Preflight is carried through the same shape even though it does not refuse. A scene it assesses
below its minimum is the compiler's `BELOW_MIN_DURATION` seen while it is still free, in the
same vocabulary, so it travels as a refusal with `advisory` set rather than as a second shape.

**`converge.py` drives one Run until it renders or the budget is gone.** It is the producer's
sequence with the judgement put back, and it is a second module rather than a loop around
`produce` for two reasons. A Run is opened once, because the Take is the expensive thing inside
it and `produce` opens a fresh Run per call. And Preflight has to be *consulted* — it publishes
`risksBlockRecord: false` and succeeds while reporting duration risk, so reading its report
happens between two of `produce`'s own steps.

Three things about it are asserted rather than hoped for.

*Take-preserving repair is enforced.* The protocol publishes exactly what a Take survives —
ordered Beat texts, segmentation and voice settings unchanged — and exactly what to do instead:
reassign or merge existing Beats before changing narration text. Once a Take exists, a repair
that rewrites Beat text is not submitted at all. The plan's Beat text *is* the recording input,
so sending one would stale the Take and turn the next `record` into a second dispatch against a
`maxNewTakes` of one; the interface would refuse that correctly and the Take would still be
gone.

*The budget comes from the Brief.* `repair_budget` is the proof harness's own rule — two cycles
plus one per minute the Brief asks for — read out of the Brief's own opening words, because a
Brief carries an id and its text and its length lives nowhere else. Keyed on scenes or beats, an
agent could buy itself attempts by splitting its plan.

*The recording quota is read, never kept.* `protocol.recording` publishes the whole rule set:
`run.record` is the only network command, a verified matching Take is `reuse without quota`, an
identical input redispatched needs a `replacement grant required`, and an exhausted budget is
`paused before network`. Every record envelope publishes `newTakesUsed` and `maxNewTakes` beside
the disposition, so how much of the quota is gone is production's answer read off what it wrote —
`run.dispatches`, `run.quota`, `run.takes` — rather than a count the crew kept beside it. The
crew's own side of the rule is that `client.record` is called with one argument, always: a
replacement grant is an operator's signature and the crew holds none.

*An exhausted budget is an outcome.* A Run ends `rendered`, `budget_exhausted` with the limit it
hit named, `paused`, or `stopped` — the last covering a `failed` envelope, which carries no
report to repair from. Nothing raises: an operator needs what production said, not an exception
where the envelopes were.

*A pause is a decision waiting on a human, and says so under its own name.* Production pauses
before the network for two reasons — the budget is gone, or an identical input needs a grant —
and the reason string is the only thing separating them. So the Run ends `paused` and
`run.decision` hands over the `next` command and reason the envelope named, verbatim. Composing
a sentence about a pause would be the paraphrase `refusals.py` exists to avoid.

*Placeholder degradation is accepted visibly.* `ASSET_PLACEHOLDER` is in the checks contract's
`warnings` block, so it rides a green compile and never reaches the loop as a refusal — fighting
it would spend the repair budget on the thing the budget exists to protect. `run.degradations`
reports every warning the finished compile published, in the compiler's own codes, which is the
difference between accepting it and ignoring it.

## Working on it

The project is self-contained on purpose. It is not a pnpm workspace member — `pnpm typecheck`,
`biome check` and the vitest suites do not see it, and it does not see them. The only thing the
two halves share is the `vox.exe` boundary.

```
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m pytest
```

The tests are held to the same bar as the proofs: no production service, no Gemini key, no
ElevenLabs quota, no network. Tool tests replay recorded envelopes — see
`tests/fixtures/README.md` for where those come from and how to re-record them — and a network
sentinel in `conftest.py` fails any test that reaches for egress.

The ADK framework is declared as an optional dependency rather than a required one. Only
`AdkPlanAuthor` needs it, and it imports the framework when one is built rather than when
`planner.py` is loaded, so a bare `pytest` still needs no network install and every test but
one runs without it. Install it with `.venv/Scripts/python -m pip install -e ".[agents,dev]"`;
`google-adk` 2.7.1 is what has been exercised here, on Python 3.14.4.

Driving the live author additionally needs a model credential in the runtime's environment. The
crew never holds one, so nothing in the test suite can reach a model: the furthest a keyless
machine follows that path is `AdkPlanAuthor.agent(...)`, which builds the agent that would have
been asked. That is why building it is a public seam rather than something `author` does inline.

## What this crew is not allowed to do

- **See repository source.** Everything it knows about the catalog, the plan schema, the
  compiler's checks and the command surface it asked for at run time.
- **Write outside its work root**, or write anything into the work root but its Run directories.
- **Spend a synthesis dispatch it was not authorised to spend.** `maxNewTakes` is absolute, and
  a paused Run is a stop-and-ask, not a retry.
- **Claim the code-blind boundary.** Crew runs report `sandboxEvidence: null` and the isolation
  assertions are not evidence for this phase — code-blindness is convention here, enforcement
  belongs to the Codex proofs and, later, to service separation in the cloud.
