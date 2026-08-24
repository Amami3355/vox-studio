# The agent crew

The crew takes an editorial Brief and drives the Agent production interface to a narrated
preview: discover the contracts, author a VideoPlan, repair it against the compiler's refusals,
Preflight, record a Take, compile, render — or Decline, when the catalog cannot serve what the
Brief asks for.

The producer half of that loop exists: the crew reaches the production boundary, asks for the
teaching surface, authors a VideoPlan from it and carries it to a preview. The researcher, and
converging on a refusal, arrive with the tickets that follow.

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
applied to the model, for the same reason. It takes instructions and a Brief and answers with a
plan: no client, no path, and no opinion about the production sequence.

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
