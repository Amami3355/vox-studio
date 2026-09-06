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

It converges on the Brief that work root carries and leaves an evidence bundle in
`crew\evidence` beside the Run, whether or not the Run reached a preview: a Run that ended
`paused`, `stopped` or `budget_exhausted` is bundled exactly as a rendered one is. A
convergence that *raises* leaves none — discovery refused, a prompt that leaked, a first ask
too large for the Run's context budget, an answer that was not a plan, a handed plan nobody can
repair, an unreachable service — because there is no `ConvergedRun` to assemble one from, and
what production said is already on stdout, which is the record that matters. The exit code is the Run's: zero when it rendered, one when it ended
any other way, two when the invocation named something that is not there.

Stdout carries production's envelopes and nothing else, in the order they arrived, byte for
byte, so a run redirected to a file is a record of what the interface said. Everything the crew
has to say about them goes to stderr. The command configures stdout as UTF-8 itself, including on
Windows consoles whose inherited text stream is `cp1252`; an operator does not need to set
`PYTHONIOENCODING` for the teaching surface's Unicode to survive.

Two flags change what the command is. `--plan plan.json` hands the crew a plan instead of
asking a model for one: everything else is the same code — discovery, the review, the
convergence, the producer, the read-back and the bundle — because `converge` takes a
`PlanAuthor` and cannot tell which one it has. That is what makes a Run reproducible on a
machine holding no model credential, and it is not the crew authoring: a bundle from such a run
reports the authorship it was given rather than inferring one. `--discovery-only` reads the
teaching surface and stops, which is the diagnostic for whether the boundary is alive and what
it teaches.

The Brief's file name is not a flag. A bootstrapped work root is the launcher and
`request.json` and nothing else, and that invariant is what the proofs' initial-inventory
assertion reads.

### Running the whole crew

`--crew` runs the production crew instead of the single plan author: research, narrative and
art direction, visual planning, asset resolution, production. The phases are the Director's and
their order is not a model's to change; what each of them *costs* is decided by one document.

```
python -m vox_crew --work-root C:\vox-proof-workroots\crew --crew --recordings recordings.json
python -m vox_crew --work-root C:\vox-proof-workroots\crew --crew --recordings recordings.json
```

**Nothing is live until a policy says so.** With no `--policy`, every phase is recorded and no
grant is held, so a crew invocation spends nothing — a default that reached a provider would
make spending the accident and saving the deliberate act. `--policy policy.json` names the
document that changes that, one entry per phase:

```json
{
  "schemaVersion": 1,
  "research": { "mode": "live", "grantId": "…" },
  "models": { "mode": "live", "grantId": "…" },
  "images": { "mode": "recorded", "grantId": null },
  "recording": { "mode": "recorded", "grantId": null }
}
```

A live phase without its grant pauses the Run before the provider is reached rather than
warning after it. `--recordings` supplies the dossier, narrative, visual bible and plan that any
phase the policy left recorded replays instead of paying for; it is required whenever one is.

`--brief-kind` states what kind of Brief this is, and it is the invocation's to state rather
than the work root's: a factual Brief is researched, a fictional one and declared test data make
no research call at all, and a work root that could assert its own kind could spend a research
call by being copied.

`--images` decides what happens to a generated candidate. The default, `pause`, stops the Run
and publishes the candidate's digest for a human to look at — which is the decision the product
exists to keep human. `accept` and `reject` are that decision taken in advance, for a rehearsal
or an unattended run.

A crew Run checkpoints itself into `evidence\crew-state`, so the next invocation resumes rather
than repeating research, model calls, image generation or a recording it already paid for. Its
own bundle — phase events, validated role outputs, production envelopes, artifact digests —
lands in `evidence\crew` beside the Run's.

## How it is put together

**`client.py` is the deployment seam** (ADR-0015), not the transport. One interface, two
implementations — `local_client.py` here and `http_client.py` beside it — and no tool, agent
instruction or test may branch on which is active. Its methods are payload-shaped in both
directions: a Run is named by its id, inputs the command surface takes as files arrive as
objects, and artifacts come back through `fetch_artifact`, which takes a Run id and the
descriptor an envelope published. A method that took or returned a path would work locally and
strand the crew at deployment, which is why `tests/test_client_contract.py` asserts against one
structurally rather than leaving it to review — in the suite that runs over every
implementation, so the assertion cannot be true of one client and unexamined on another.

**`local_client.py` is the only module that knows where production put a Run.** It runs
`vox.exe` with its working directory set to the work root, one subprocess per command, over the
authenticated named pipe ADR-0007 requires of the local topology — which ADR-0018 keeps as the
local transport permanently, alongside a network sibling for remote deployments. Payloads are
staged where the work root keeps its invariant of growing nothing but its Run directories.

**`http_client.py` is that sibling, and it knows no disk at all.** It holds an address rather
than a work root, opens no file and spawns nothing: one signed request per command over the
second transport, reached through an SSH tunnel to a service with no public ingress. The signing
key is read from `VOX_NETWORK_TOKEN` per request rather than held in a field, and a response
whose MAC does not verify is refused rather than parsed — the tunnel says who may connect, the
MAC says who produced the bytes, and ADR-0018 forbids letting one answer stand for both. An
artifact's bytes are the one thing it does not check a MAC on: they are authenticated by the
descriptor's digest, recomputed on arrival.

**`wire.py` is the signing rule, written a second time.** The service defines it in TypeScript
and there is no way for the crew to share that code, so neither copy is checked against the
other: both assert against `tests/fixtures/ipc-signing-vectors.json`, which is recorded from the
TypeScript definition. Two implementations written by one hand agree about a mistake perfectly,
and this repository has already had a measurement agree with itself and be wrong.

`vox-crew --service-address HOST:PORT` is how an invocation asks for the network client. It
takes no key: a key in argv is a key in the process table, so it is read from the environment.
A launcher named alongside an address is refused rather than resolved by precedence.

`evidence.py` is the one other module that opens a file, and the distinction is the one
ADR-0015 turns on rather than an exception to it. It never learns a Run's disk — every artifact
it carries arrived through `fetch_artifact`, by the descriptor an envelope published — and what
it writes is the crew's *own* evidence, into a root it was handed. The work root is the crew's
disk under both topologies while the Run's disk is only the crew's today, which is why the seam
sits between the value and the directory: `assemble` is pure and joins no path, and only
`write_bundle` and `read_bundle` below it know a directory exists.

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

The live author has an asynchronous hosted seam backed by ADK's `Runner.run_async`; its session
implementation and resume id are injectable. The existing synchronous `PlanAuthor` methods remain
only as the CLI compatibility adapter and refuse to nest themselves inside an already-running event
loop.

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

**`census.py` measures the prefix rather than arguing about it.** Ticket 17 rested an argument,
a severity decision and an ADR reading on four hand-counted numbers about the instructions the
crew authors from, and nothing in the repository could re-take them. This is the instrument: how
large the assembled prefix is, how it divides across the categories the index published, how many
anchors it demonstrates and of which published forms, how many *distinct statements* those
anchors are spread over, and what content it carries more than once. It runs on every `pytest`,
over the recorded fixtures, and writes `prefix-census.md` — the record a later session diffs
against after a contract has moved.

The measuring lives in `census.py` and the record it writes in `census_record.py`, because the
two change for different reasons: what is counted moves when the contract does, and how it is
laid out moves when a session finds the record hard to read. Nothing in `census_record.py` can
change a number, which is what makes it safe to reword.

Four things about it are worth knowing before changing it.

*It is a record, not a gate.* No threshold fails a build and no count is pinned as an expected
value. What a balanced prefix looks like has never been argued, and a suite that went red because
another team added a capability would be this crew holding their contract hostage to a ratio
nobody granted authority to. The fixtures already have a staleness guard and it is not this.

*The distinct-statement count is the one that matters.* Nine word anchors that are one idiom
repeated seven times teach what two teach, and a census reporting nine would have hidden the
defect it was built to expose. So an anchor's statement — the JSON object or the sentence it sits
in, with the anchor elided — is counted beside the raw occurrences, and the record publishes both.

*Everything it reads, it reads from the contract, except one thing.* The anchor forms come
through `planner.anchor_forms`, so a form the contract adds is a form the census counts with no
edit here — and each form arrives carrying its own published examples, so the census never goes
back to the contract for the shape of a form entry and there is only ever one reader of it. What
no contract publishes is the shape of a beat id, and without one an anchor cannot
be told from `contract.show`; `BEAT_ID` is the crew's own reading of that convention, deliberately
wider than the published forms so an anchor no form can read is reported as unparsed rather than
missed. A convention that moved would leave it blind, so `readable` is false for any form whose
own published examples the scanner cannot find, and a test asserts every one of them is read.

*Repeats are found in the bodies and confirmed in the prefix.* What repeats is a JSON object or
an array, and the assembled prefix is flat text with no structure to search; so the walk is over
the published bodies, and every blob it finds is then checked against the assembled text before
it is reported — `category_part` embeds each body with the same compact serialisation the walk
uses, so a repeat that is not carried as many times as claimed refuses the census rather than
being reported. The denominator stays the whole prefix. Its one blind spot, named rather than
implied: duplication between a body and the crew's preamble or the per-category framing is prose
that no JSON walk reaches, and nothing has been measured about it either way.

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
`run.dispatches`, `run.quota`, `run.quota_readings` — rather than a count the crew kept beside
it. The crew's own side of the rule is that `client.record` is called with one argument, always:
a replacement grant is an operator's signature and the crew holds none.

*An exhausted budget is an outcome.* A Run ends `rendered`, `budget_exhausted` with the limit it
hit named, `paused`, or `stopped` — the last covering a `failed` envelope, which carries no
report to repair from. Nothing about a Run raises: an operator needs what production said, not
an exception where the envelopes were. The one exception is not about a Run — a first ask too
large for the context budget is refused before `run.init`, because it is true of every turn and
no Run can be spent discovering it.

**`context.py` is what a Run puts in front of a model, and the budget it works within.** An
`Ask` is four numbers — the resident instructions prefix, what that turn added on top of it, how
many model calls it took, and what its tools handed back — and a `ContextSpend` is derived from
the versions a Run authored, the way `quota_readings` is derived from its envelopes rather than
counted beside them. `authoring_ask` and `repair_ask` price a turn *before* it is asked for,
which is what lets a budget refuse one instead of reporting it afterwards.

*Four lines, read in one order.* `overrun` reads the resident line, then the rate line, then the
returned line, then the turn line, and the order is the argument. A prefix that does not fit is
true of every turn before any Run exists, so it is read first and refused before `run.init`
rather than ended as a Run. A Run that spent its budget looping against a tool *is* the finding,
and the characters that loop moved are a symptom of it — so the rate line is read ahead of the
character lines it would also blow. The returned line sits with the rate line because it is the
other half of the same term the crew does not choose: the rate line bounds how many answers an
author fetches and the returned line bounds how large they are. What a turn added on top of a
prefix that fits, without looping and without fetching, is the one term of the four the crew
does choose, so it is read last.

*The returned line is derived, not chosen.* `LARGEST_PUBLISHED_SPEC_CHARS` is a ceiling over one
capability's published specification — the catalog's eight run 4,192 to 9,909 characters, mean
6,813, measured over the recorded contract by a test that fails if the largest passes it.
`TOOL_CALLS_PER_ASK` is six: the draft-review loop's three, plus the three the search-and-two-
specifications sequence needs. `MODEL_CALLS_PER_ASK` is one more than that, so the count of calls
and the count of answers cannot be moved apart. `RETURNED_CHARS_PER_ASK` is three answers at the
ceiling, and three rather than eight is the whole of the line: eight specifications is the
catalog, every author already holds the catalog resident, and a turn that pulls all of it back
has re-fetched what it was given for free.

One asymmetry, and it cannot be closed. Every term of a repair is known before it is asked for,
so the turn line refuses the turn that would cross it. What a tool will hand back is not knowable
until the author has called it, so the returned line is read against a turn that has already
happened and the turn it refuses is the next one. The rate line has had this shape since it
landed.

It measures characters, not tokens. Characters are what a Python process can count exactly and
offline, so the guard runs on every `pytest`; a token budget would need a Gemma tokenizer that
is either a network call or a `sentencepiece` model this machine does not have, and would be a
number no test could check. `tokens` converts at three characters per token, chosen low so the
figure is an upper bound.

*The word "cached" is used carefully here.* `cache_prefix` caches inside this process: one
assembly, held and re-read by every turn. That makes every turn's prefix identical, and the
property it buys is **comparability** — a measurement taken either side of a change is a
measurement of the change. It is not a saving. The prefix is transmitted in full every turn, and
the bundle reports `repeatedPrefixChars` as exactly that: what the turns after the first spent
re-sending it.

A *provider* cache is not merely unobserved here, it is out of reach. ADK's `ContextCacheConfig`
cannot engage as the crew is built, because caching begins on a session's second turn at the
earliest and `AdkPlanAuthor` opens a fresh session per ask — so every session this crew opens is
single-turn, the case ADK names as never cached, and `min_tokens` only raises that floor. The
bundle says so under `prefixCache`, with the reason and with the deliberate rejection of session
reuse beside it (ADR-0017), so that a reader does not take the number for a saving waiting to be
confirmed. The module docstring says why that session model is deliberate and what changing it
would cost.

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

**`evidence.py` is what a Run leaves behind, so it can be read once the crew has gone.** A crew
Run and a scripted proof run are the same claim made two ways, so the bundle uses the proof
bundles' own names — `commands.jsonl`, `agent-transcript.jsonl`, the Run's artifacts,
`assertions.json` and a hash index over the lot — and `verify` is the way back in: digests
recomputed, the verdict re-derived from the assertions meant to support it, every named piece of
evidence looked for among the files present, under the proofs' own failure codes.

Three things about it are worth knowing before changing it.

*It evaluates the assertions the crew observed, and no others.* The limits, the single dispatch,
the take, the compile, Preflight and the stage reached, in the sheet's ids, its `ProofAssertion`
shape and its aggregate rule. The scenario families are the harness's — a scenario is chosen
there and the crew holds only a Brief — and the media and isolation families need instruments
the crew does not hold. What a Run had no material for is `not-evidenced` rather than answered
from a fallback, because a fallback is the exact defect the third outcome was added to stop and
it would be worse coming from the party being judged. The restatement cannot be pinned against
TypeScript from a Python process, so a test pins the sheet's literal numbers instead — and the
proof harness's crew run holds the two restatements to each other over one Run, which is the
only place they meet.

*What the crew authored is scanned before it is written.* The bundle lands in the work root,
where the proofs' leak scan reads every file it finds, so a marker in a transcript would fail
`leaks.agent-readable-files` at the end of a paid Run. The full `scan_for_leaks` applies, and a
bundle that would leak is refused rather than sanitised. The artifacts are not scanned: they are
production's bytes, and scanning the copy would be the crew auditing production rather than
itself.

*A bundle root is written once and never followed.* An occupied root is refused rather than
merged into, for the reason the proofs copy with `errorOnExist` — a directory written twice is
two Runs under one hash index. A root that is itself a link is refused before it is resolved,
and `read_bundle` refuses a link rather than following one, because a link hashes as whatever it
points at and would let a bundle verify over bytes it does not contain.

## Working on it

The project is self-contained on purpose. It is not a pnpm workspace member — `pnpm typecheck`,
`biome check` and the vitest suites do not see it, and it does not see them. The only thing the
two halves share is the `vox.exe` boundary.

```
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m pytest
```

One file in the project is generated rather than written: `prefix-census.md` is rewritten on
every `pytest` run from the recorded fixtures. It is committed on purpose — the point of it is
that two censuses taken either side of a contract change can be read against each other — so a
diff in it after re-recording the fixtures is the answer to what that contract change did to the
prefix, and a diff in it at any other time means the instrument moved.

The tests are held to the same bar as the proofs: no production service, no Gemini key, no
ElevenLabs quota, no network. Tool tests replay recorded envelopes — see
`tests/fixtures/README.md` for where those come from and how to re-record them — and a network
sentinel in `conftest.py` fails any test that reaches for egress.

The ADK framework is declared as an optional dependency rather than a required one. Only
`AdkPlanAuthor` needs it, and it imports the framework when one is built rather than when
`planner.py` is loaded, so a bare `pytest` still needs no network install and every test that
does not exercise the live author runs without it. Install it with
`.venv/Scripts/python -m pip install -e ".[agents,dev]"`. The version exercised here is the floor
of the `agents` constraint in `pyproject.toml`, which is where that number lives rather than
being restated in prose that can drift away from it; the ceiling stops short of the next major.
The Python exercised here is 3.14.4.

Driving the live author additionally needs a model credential in the runtime's environment. The
crew never holds one, so nothing in the test suite can reach a model: the furthest a keyless
machine follows that path is `AdkPlanAuthor.agent(...)`, which builds the agent that would have
been asked. That is why building it is a public seam rather than something `author` does inline.

## What this crew is not allowed to do

- **See repository source.** Everything it knows about the catalog, the plan schema, the
  compiler's checks and the command surface it asked for at run time.
- **Write outside its work root**, or write anything into the work root but its Run directories
  and the evidence bundles it is told to leave beside them. `write_bundle` is handed its root
  rather than computing one: it refuses a root that is already occupied or is itself a link, and
  resolves every name to check it lands inside before it writes anything. That the root is the
  work root's is the caller's to get right, and it is the one part of this rule that lives in the
  caller rather than in code.
- **Spend a synthesis dispatch it was not authorised to spend.** `maxNewTakes` is absolute, and
  a paused Run is a stop-and-ask, not a retry.
- **Claim the code-blind boundary.** Crew runs report `sandboxEvidence: null` and the isolation
  assertions are not evidence for this phase — code-blindness is convention here, enforcement
  belongs to the Codex proofs and, later, to service separation in the cloud.
