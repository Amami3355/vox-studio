# Recorded envelopes

What the production command surface writes to stdout: one JSON line and the newline that ends
it. The crew's tool tests replay these instead of running a service, so a Python test needs no
key, no quota, no ElevenLabs credit and no network.

Their bytes are the recording. Nothing here should be reformatted — verbatim pass-through is a
byte property, and prettifying these files would delete the thing they exist to prove. That is
why they carry a `.stdout` extension and sit outside `biome check`'s reach.

- `contract-index.stdout` and the five `contract-show-*.stdout` files are **recorded**:
  written by `pnpm --filter @vox/production record:crew-fixtures`, straight from the handlers
  the dispatcher calls. Re-recording is not something this README asks for, because prose is
  not a check: `packages/production/tests/crew-fixture-freshness.test.ts` compares these bytes
  against what the handlers emit now, and a recording made from an older catalog fails the
  build with the command that refreshes it. A category the index publishes with no file here
  fails it too, which is how a new category arrives.
- The `run-*.stdout` envelopes are **authored**, because producing them for real needs a Run,
  a ledger and a signing key. They are held to the contract by
  `packages/production/tests/crew-fixtures.test.ts`, which parses every file in this directory
  with `resultEnvelopeSchema` and then parses each one's `data` with the schema for its command:
  an envelope the service could not emit, or a report shape it would never publish, fails that
  test. Authoring one by hand and running that test is the whole workflow.

## The bodies under `artifacts/`

`fetch_artifact` checks an artifact's bytes against the digest its descriptor published, so an
envelope naming an artifact nothing can produce leaves the read-back direction of the client
untestable. The three artifacts a finished Run is read back for — the Preflight report, the
compile report and the preview — therefore have a body here, and the `sha256` in the envelope
that publishes them is the digest of these exact bytes. The reports are canonical JSON (RFC
8785), which is what the service's `reportBytes` emits; the preview is a stand-in for an MP4,
because the render adapter is stubbed everywhere the crew is tested.

Every other descriptor in these envelopes carries a well-formed placeholder digest, because
nothing opens those artifacts. If a later ticket reads one back, give it a body here and put
its real digest in the envelope.

## What the repair loop needed that authoring did not

Ticket 08 repairs from what production published, which means the *body* of a refusal and not
only the envelope around it. `validation-report.json` was already here; three more arrived with
the loop, and each exists because a criterion cannot be asserted without it.

- `preflight-report-duration-risk.json` and `run-preflight-duration-risk.stdout` — Preflight
  **succeeding** while reporting a scene whose whole estimate range sits below its capability
  minimum. This is the fixture that makes "Preflight is consulted before any recording is
  attempted" mean something: the envelope succeeds and `risksBlockRecord` is false, so a crew
  that read the outcome rather than the report would record a Take against it and find out at
  compile. The clear report beside it crosses only its *recommended* hold, which is a quality
  warning and deliberately buys no repair.
- `compile-report-needs-repair.json` and `run-compile-needs-repair.stdout` — the compiler
  refusing **after** a Take exists, which is the only place take-preserving repair can be
  asserted. Its one error is `BELOW_MIN_DURATION`, whose published repair is take-preserving by
  construction: give the scene more narration time by merging Beats into its span, rather than
  by rewriting what the Beats say.
- `run-record-reused.stdout` — the same Take bound a second time, `disposition: "reused"`. It
  is what proves a preserved Take actually cost nothing, where the assertion would otherwise
  only be that the crew withheld a plan.

The three new report bodies were written with the same canonical-JSON serialisation the
existing ones round-trip through, so the digests in the envelopes that publish them are the
digests of these exact bytes.

These files are deliberately not `.stdout`: they are artifact bodies, not recorded stdout, and
the contract test parses only the latter. Their bytes are the fixture in the same way the
envelopes' are, so `biome.json` ignores this directory — reformatting a report here would
change its digest and break the envelope that publishes it.

## What the quota rules needed that the repair loop did not

Ticket 09 binds the crew to `protocol.recording`, and two of its criteria are about outcomes no
envelope that was already here could produce.

- `run-record-paused-budget.stdout` and `run-record-paused-replacement.stdout` — the two
  pauses, which are the same envelope apart from one sentence. `pauseRecording` in the service
  is the only emitter and writes `outcome: 'paused'`, `data: null`, no artifacts, the stage
  left where it was, and one `next` naming
  `run.record --run . --replacement-authorisation <grant.json>` with the reason as its text.
  The reason is the *only* thing distinguishing an exhausted budget from a required
  replacement, so there are two files rather than one: a single fixture would let a crew that
  composed its own explanation pass, and the criterion is that production's words travel.
  Note that `commandDataSchemas['run.record']` is strict and a paused envelope carries no
  `data`, so the contract test skips the payload and the envelope schema is the whole gate.
- `compile-report-placeholder.json` and `run-compile-placeholder.stdout` — a **green** compile
  whose report warns `ASSET_PLACEHOLDER`. The existing green compile carries `SLOT_RELOCATED`,
  which proves a warning rides a successful compile but not that the specific degradation this
  spec accepts does. A separate body was needed rather than an edited one, because editing the
  existing report would change its digest and take the clean green compile away with it.

Its report body uses the same canonical serialisation as the rest, so the digest in the
envelope that publishes it is the digest of those exact bytes.

## Why every projection is recorded

`checks` was recorded alone at first. The client was the thing under test and was indifferent
to what a projection carried, so committing the whole generated contract — ~125 KB at the time,
a figure retired twice since and kept here only as the size the decision was taken against —
bought nothing when it drifts the moment the catalog is rebuilt.

The planner is not indifferent to any of them. Its instructions *are* these bodies — it
assembles the prompt from every category the index addresses to an author — and two of the
acceptance criteria are about that text: the leak scan over it, and the capability, action and
anchor names an authored plan is read back against. Both are assertions about the contract the
build publishes, and neither means anything against a stand-in. The protocol category is the
sharpest case: it tells an agent a plan is submitted as `plan.json`, which is why the crew's
leak-marker list may not contain that string, and only the recorded body proves it.

**Including the ones the prompt does not carry.** Since crew ticket 25 the index publishes an
audience per category, and `protocol` is addressed to the client rather than to an author — so
it is fetched, held and read by `refusals.py` and `converge.py`, and never assembled into a
prompt. It is recorded for the same reason the others are: the tests that read it read the body
the build publishes. A fixture set narrowed to what a model is sent would leave the half of the
crew that drives production testing against nothing.

Re-record when the contracts are rebuilt. The bare command writes the index and every
category the index publishes, which is the whole recorded set:

```
pnpm --filter @vox/production record:crew-fixtures
```

`--category <name>` narrows the write to one projection and the index beside it. It is for
iterating on a single contract; a partial re-record after a catalog rebuild is exactly what
leaves one projection behind, and the freshness test is what catches it.
