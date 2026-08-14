# Specify the code-blind end-to-end proof

Type: grilling
Status: resolved
Blocked by: 05, 06, 07

## Question

What exact fresh 20–30 second scenario proves the Agent production interface complete? This
ticket **specifies** that proof; the subsequent implementation effort runs it.

The specification must contain:

- the complete engineered Brief, written out;
- its permanent measurement-gate ineligibility;
- the exact isolated inputs, readable files and permissions the agent receives;
- the command sequence and expected artifacts;
- repair limits and the numeric recording budget;
- the paused and failed outcomes;
- the machine assertions and transcript requirements;
- the human watch-and-listen verdict form;
- explicit statements of what the proof does **not** establish.

## What the proof Brief must force

- both `image_context` and `bar_chart`;
- at least one `bar_chart` action;
- at least one word anchor;
- a semantic asset requirement that resolves as a **placeholder**;
- validation, preflight, recording, compilation and rendering.

It must end in a linked take, green compilation, a structured report and a preview MP4.

## What it does not establish

It proves **production-interface usability**. It does not measure capability-selection quality
or action-vocabulary breadth: the catalogue holds two capabilities and `image_context`
publishes zero actions, so the choice is near-forced and half the catalogue cannot exercise an
event vocabulary at all. Those remain measurement-gate concerns, after group 4 and at four
capabilities.

## The Brief is spent

This Brief is **deliberately engineered from catalogue knowledge** and is therefore permanently
ineligible for the measurement gate — `docs/measurement-gate.md` voids any run whose briefs
were authored with the catalogue in view, and that bias control is the load-bearing constraint
of the whole exercise. Successful reuse of this Brief may serve **regression testing only**
and can never enter a scorecard as a blind Brief.

## Gap 8 is not automatically discharged

The human watch-and-listen verdict validates the same *class* of concern on another video. Gap
8 is sign-off on the **already shipped vertical slice** and its specific word landing, and it
closes only if the verdict explicitly also watches and listens to `section--vertical-slice`, or
through a separate sign-off. Do not record it as closed by side effect.

## Resolved when

A person with **no conversation history** could execute the proof from this ticket alone.

## Comments

### Grilling round 1 — proof Brief and isolated actor

Repository facts remove guesswork from the scenario. `image_context` requires a semantic asset
and has no actions; `bar_chart` is the only numeric comparison capability and exposes
`highlightBar`, whose `label` is deictic and therefore requires a Word anchor. The local asset
library contains only the shipped housing and narrator identities, so an unrelated keyed bus
image deterministically resolves as `placeholder`. The proof may use supplied fictional data
and therefore needs no external factual research.

The open frontier is:

1. freeze this complete Brief verbatim:

   > Create a 20–30-second English editorial explainer about the fictional city of
   > Northbridge's overnight-bus pilot, using only the supplied test facts. Open on a
   > documentary image of a rain-soaked Northbridge bus stop before dawn, then show weekday
   > boardings rising from 12,000 before the pilot to 15,000 in January and 18,000 in March.
   > The narration must say “March” exactly once and the 18,000 March result must be singled
   > out precisely when that word is spoken. End by explaining that the extra 6,000 trips
   > widened access for late-shift workers. Treat Northbridge and all figures as fictional test
   > data, not real-world claims.

   Its proof id is `northbridge-night-bus-interface-proof-v1`. It is permanently marked
   `measurementGateEligible: false` with reason `catalog_informed_interface_proof`; it may be
   reused only as a regression fixture and never in a measurement-gate scorecard. Acceptance
   requires both current capabilities, at least one `highlightBar`, a valid Word anchor landing
   on the unique spoken token `March`, and a semantic `image_context` requirement for the
   opening Northbridge bus-stop image resolving to `placeholder`;
2. run the authoring and command sequence through a fresh generalist agent with no conversation
   history, no seeded plan and no source-derived hints. Its initial readable filesystem has
   exactly the native `vox` launcher and canonical `request.json`; the Brief is inside that
   request. The task message says only: “Using `vox` and `request.json`, create a valid
   VideoPlan and produce the narrated preview MP4. Use the public contract discovery commands;
   do not seek external help.”

   The agent OS principal may execute the launcher and read/write only a new proof work root.
   Repository, Production-service files, runtimes, dependencies, credentials and prior Runs are
   unreadable; direct network is denied. It receives only the authenticated local IPC
   capability, through which non-`record` operations remain network-denied and only the
   service-side `record` handler may reach ElevenLabs. The native distribution and every file
   readable after the run must pass ADR-0007's leak gate. Screen/render feedback is withheld
   until the agent has reached a terminal proof outcome, so authoring is tested through public
   contracts and machine reports rather than visual coaching.

The recommendation is yes to both. Exact request budget, command transcript, negative outcomes
and assertions depend on the frozen scenario and isolation and follow in later rounds.

User confirmed both recommendations on 2026-08-13: `Q1 oui, Q2 oui`.

### Grilling round 2 — quota and repair cut line

The sole open frontier decision is:

3. use this canonical main-run request, with exactly one quota-bearing dispatch available:

   ```json
   {
     "protocolVersion": 1,
     "brief": {
       "id": "northbridge-night-bus-interface-proof-v1",
       "text": "Create a 20–30-second English editorial explainer about the fictional city of Northbridge's overnight-bus pilot, using only the supplied test facts. Open on a documentary image of a rain-soaked Northbridge bus stop before dawn, then show weekday boardings rising from 12,000 before the pilot to 15,000 in January and 18,000 in March. The narration must say “March” exactly once and the 18,000 March result must be singled out precisely when that word is spoken. End by explaining that the extra 6,000 trips widened access for late-shift workers. Treat Northbridge and all figures as fictional test data, not real-world claims."
     },
     "production": {
       "voice": {
         "provider": "elevenlabs",
         "voiceId": "JBFqnCBsd6RMkjVDRZzb",
         "modelId": "eleven_v3",
         "seed": 7
       },
       "maxNewTakes": 1
     }
   }
   ```

   Contract discovery and `status` are unlimited because they are read-only. Before recording,
   the harness permits at most five submitted plan versions, five `validate` calls and three
   Preflight calls, with no human hint. The agent must resolve all `point_below` and
   `margin_crosses` minimum-duration assessments before spending quota; recommended-duration
   risk may remain visible because it is advisory quality information. After recording, at
   most two additional plan versions may be submitted, and each must preserve the Recording
   input: only SceneInstance/Section/visual/asset/event changes or Beat-id renames are allowed.
   They may each run validation, Preflight and compilation; no post-record textual,
   segmentation, ordering or voice change is permitted in the successful proof path.

   The main Run must make exactly one service-side synthesis dispatch, accepts no replacement
   grant, and must render within these limits. A second `record` invocation with no grant is
   required after the first Take to prove verified reuse and must leave `newTakesUsed: 1`.
   Exceeding any limit, needing a second dispatch or receiving human authoring help fails the
   proof rather than silently widening the exercise.

The recommendation is yes. A one-dispatch cap makes Preflight and take-preserving repair
load-bearing rather than decorative; the paused outcome will be tested later in a separate
zero-budget Run and therefore spends no additional credit.

User confirmed the recommendation on 2026-08-13: `Q3 oui`.

### Grilling round 3 — nominal command transcript and deliverables

The sole open frontier decision is:

4. require this nominal lifecycle, with the isolated agent choosing its own contained Run path
   and the harness supplying no path or command-sequence hint:

   ```text
   vox production contract index
   vox production contract show <one or more categories needed by the agent>
   vox production run init --request request.json --out <agent-chosen-run>
   # agent authors plan.json
   vox production run validate --run <agent-chosen-run> --plan plan.json
   # agent may repair and revalidate within Q3 limits
   vox production run preflight --run <agent-chosen-run>
   # any pre-record repair returns through validate, then preflight
   vox production run record --run <agent-chosen-run>
   vox production run compile --run <agent-chosen-run>
   # any take-preserving repair returns through validate and preflight, then compile
   vox production run render --run <agent-chosen-run>
   ```

   After the agent reaches `rendered`, the harness identifies that Run from the audited
   successful `run.render` command and rejects a missing, ambiguous or out-of-root selection.
   Without changing the agent transcript, it queries any contract categories the agent did
   not need, calls `record` once to prove verified Take reuse, and calls `status` once to prove
   read-only inspection. The first agent `record` and harness reuse probe report `recorded`
   then `reused`, name the same `takeId`, resolve to the same full `takeSha256`, and leave both
   `newTakesUsed` and the private-ledger dispatch count at one. No command other than the first
   agent `record` may open outbound network. The successful final checkpoint remains
   `rendered`, every active binding is fresh, and `status` changes no byte.

   The Run must contain and bind all of these verified outputs: canonical request and final
   plan snapshot; current validation and advisory Preflight reports; one Take's manifest,
   MP3, alignment and current Beat-shape TimedBeat fold; green Compiled document and structured
   Compile report; the per-use asset-resolution view with the required bus image exactly
   `placeholder`, never `failed`; H.264/AAC preview MP4; attested chained receipts for every
   mutating command; and the final attested `run.json`. Every service-owned path matches the
   ticket-06 layout and every descriptor hash matches its exact bytes.

   The authoritative Take duration and MP4 duration must both be 20.000–30.000 seconds. The
   plan must contain `image_context` and `bar_chart`, a `highlightBar` whose label is `March`,
   and a Word anchor resolving to the unique spoken `March`. Compilation has zero errors;
   warnings remain allowed and preserved. Rendering may not substitute a synthetic Take,
   omit audio, resolve the missing image as `ready`, or conceal its placeholder warning.

The recommendation was confirmed on 2026-08-13. On 2026-08-14 the user selected option A to
remove the hidden `run-main` and second-`record` assumptions: the agent now owns the contained
Run name and production lifecycle, while the harness owns post-terminal completeness, reuse
and read-only probes. The auxiliary paused/failed probes, machine assertion manifest and human
verdict form depend on this successful evidence set and follow next.

User confirmed the recommendation on 2026-08-13: `Q4 oui`.

### Grilling round 4 — negative probes, evidence and verdict boundaries

The final open frontier is:

5. after the agent finishes the nominal Run, have the proof harness — not the authoring agent —
   execute two isolated, zero-network negative probes:
   - generate `request-paused.json` from the frozen request with only `maxNewTakes` changed to
     zero; initialise `run-paused`, validate and Preflight the final agent-authored plan, then
     call `record`. Require exit 0, outcome `paused`, stage `preflighted`,
     `newTakesUsed: 0`, no Take artifact, no outbound network and a next action explaining the
     exhausted budget;
   - after preserving the rendered main checkpoint, generate `invalid-grant.json` with the
     correct main `runId` and `recordingInputSha256`, a fresh `grantId` and syntactically valid
     timestamp, but an unauthenticated opaque `grant`; call main `record` with
     `--replacement-authorisation`. Require exit 1, outcome `failed`, error code
     `REPLACEMENT_AUTHORIZATION_INVALID`, no network, unchanged dispatch count and Take, and
     stage still `rendered`.

   These probes must not alter the agent transcript, spend quota, or count as authoring help;
6. make the harness write a tamper-evident evidence bundle outside the agent-writable root and
   export it under
   `.scratch/agent-production-interface/proofs/<UTC>-northbridge-night-bus/`. It contains:
   - `environment.json`: proof id, UTC time, model/version, exact task-message hash, launcher
     SHA-256/version, Production-service build id, contract hashes, OS/container identity and
     IPC identity;
   - initial and final recursive readable-file inventories, permissions/identity evidence and
     `leak-scan.json` covering forbidden extensions, maps, archives, source markers, repository
     paths and service/dependency reachability;
   - `agent-transcript.jsonl` with every model message and tool action, and `commands.jsonl`
     with ordinal, actor, UTC start/end, cwd, argv array, input hashes, exit code, exact stdout
     and stderr byte hashes plus preserved bytes, Run revision before/after, created/changed
     paths and hashes, and network-audit delta;
   - the immutable main and paused Runs or a read-only preservation of them, the invalid grant,
     `ffprobe.json`, `assertions.json`, `human-verdict.json` and a hash-indexed `SUMMARY.md`.

   `assertions.json` records `{ id, expected, observed, pass, evidence }` for every requirement,
   never just one aggregate boolean. It covers isolation and leak checks; all contract
   categories; envelope/stdout/stderr/exit semantics; write containment; network exclusivity
   and exactly one provider dispatch; repair limits; stage/freshness/receipt/attestation chains;
   Recording-input, Take, fold and artifact hashes; verified record reuse; both capabilities,
   action and unique Word anchor; Preflight's advisory wording and cleared minimum risk;
   placeholder-not-failed preservation; green compilation; H.264/AAC streams, non-silent audio
   and 20–30-second durations; and the exact paused and failed outcomes. Any false assertion
   fails the proof. The bundle records `machineVerdict: pass|fail`; absence is not pass;
7. require one named human, after the machine run is frozen, to watch and listen to the exact
   preview hash and complete `human-verdict.json` with evaluator, UTC time, display/audio setup,
   preview SHA-256, `takeId`, and pass/fail plus a note for each of:
   - narration is intelligible, complete, free of silence/clicks/gaps and matches the supplied
     fictional facts;
   - the March bar is perceptibly singled out when the unique spoken “March” begins;
   - opening context, chart labels, values, hierarchy, transitions and final beat are legible
     and not clipped or rushed;
   - the placeholder is visible as honest missing-media degradation, not a blank, broken or
     falsely ready image;
   - composition, typography, motion and pace are system-premium enough for a narrated preview;
   - the complete preview is watchable and listenable without explanation.

   Any failed row fails the human verdict. `pending` is allowed only while review has not
   happened and means the proof is incomplete, never passed. The form has
   `verticalSliceReviewed: false` by default and explicitly says this Northbridge verdict does
   not close gap 8; only a separate watch/listen of `section--vertical-slice` may change it;
8. print these non-claims in `SUMMARY.md` and the final handoff. The proof establishes one
   Windows/named-pipe production-interface path for one deliberately engineered fictional
   Brief. It does not establish measurement-gate validity, catalogue selection or action
   breadth, Decline quality, successful authorised replacement, crash/concurrency behaviour,
   cross-platform transport, service/key compromise resistance, provider reliability or
   performance statistics, factual-research quality, final-image/frame premium, or gap 8. The
   placeholder is acceptable for system-premium only. Ticket 03's prototype and automated tests
   are supporting evidence, never substitutes for this fresh execution. No document may call
   the interface code-blind end-to-end until both machine and human verdicts from an actually
   executed run are `pass`.

The recommendation is yes to all four. This is the final frontier for ticket 09; the proof is
a procedure and evidence contract, so it does not warrant another ADR.

User confirmed all four recommendations on 2026-08-13: `Q5 oui, Q6 oui, Q7 oui, Q8 oui`.

### Amendment 2026-08-14 — the repair budget is per unit of content

Round 2's budget (five plan versions, five `validate`, three Preflight) was calibrated against a
20–30-second Brief. The long-form variant — a separate proof id,
`northbridge-night-bus-interface-proof-long-v1`, asking for 170–190 seconds — met that budget as
a wall. A free code-blind fixture run on 2026-08-14
(`proofs/2026-08-14T000821-480Z-northbridge-night-bus`) converged cleanly and unaided in **four**
validate→Preflight cycles across an 8-scene plan and failed one assertion of 56:
`limits.preflight-calls | expected: <=3 | observed: 4`. Plan versions and `validate` each stood at
4 of 5, one call from the same wall.

That is not an agent failure and not a case for a bigger constant, which would only move the wall
for the next length. The budget is now expressed **per unit of the content the Brief asks for**:

```text
cycles = 2 + ceil(targetSeconds / 60)

limits.preflight-calls          <= cycles
limits.validate-calls           <= cycles + 2
limits.plan-versions            <= cycles + 2
limits.post-record-plan-versions <= 2      (unchanged, and not length-scaled)
limits.no-human-hints            = 0       (unchanged)
```

The input is `targetSeconds`, the duration **the Brief asks for** — never the scene count, beat
count or any other value the agent chooses, because a budget keyed on those would let an agent buy
itself repair attempts by splitting its plan. It is kept distinct from the duration *acceptance*
window, so widening that window for slack never silently widens the budget.

At the short proof's 25 seconds this yields exactly **3 / 5 / 5**. The frozen short Brief, its
proof id and its budget are therefore unchanged in both number and meaning, and the two paid
bundles of 2026-08-14 remain judged under the semantics they were run against. At the long
variant's 180 seconds it yields **5 / 7 / 7**, which the observed 4 / 4 / 4 passes with slack while
the assertion stays binding — six Preflight calls at three minutes still fails.

The user confirmed this form on 2026-08-14, choosing it over scaling Preflight alone and over a
flat long-variant constant.

The **hard ceiling** this budget cannot reach past: `packages/voice/src/synthesise.ts` caps a
script at 5,000 characters and cannot split one across two synthesis calls, because beat
boundaries are offsets into a single alignment array. At the calibrated 66.25 ms per UTF-16 unit
that is roughly **331 seconds ≈ 5 min 31 s**. Briefs beyond that need multi-call synthesis and a
reworked beat-to-alignment mapping — an architectural change, not a larger budget.

## Answer

The implementation effort must run the following proof exactly. This ticket specifies the
proof; resolving it does **not** claim the proof has run.

### Frozen Brief and permanent ineligibility

Proof id: `northbridge-night-bus-interface-proof-v1`.

> Create a 20–30-second English editorial explainer about the fictional city of Northbridge's
> overnight-bus pilot, using only the supplied test facts. Open on a documentary image of a
> rain-soaked Northbridge bus stop before dawn, then show weekday boardings rising from 12,000
> before the pilot to 15,000 in January and 18,000 in March. The narration must say “March”
> exactly once and the 18,000 March result must be singled out precisely when that word is
> spoken. End by explaining that the extra 6,000 trips widened access for late-shift workers.
> Treat Northbridge and all figures as fictional test data, not real-world claims.

Proof metadata permanently records `measurementGateEligible: false` and reason
`catalog_informed_interface_proof`. This catalogue-informed Brief may be reused only for
regression and can never enter the measurement gate or one of its scorecards.

### Isolated agent and request

A fresh generalist agent receives no conversation history, seeded plan or source-derived hint.
Its initial readable filesystem contains exactly the native `vox` launcher and canonical
`request.json`. Its task is:

> Using `vox` and `request.json`, create a valid VideoPlan and produce the narrated preview
> MP4. Use the public contract discovery commands; do not seek external help.

The agent principal may execute the launcher and read/write only a new proof work root. The
repository, Production-service files, runtimes, dependencies, credentials and previous Runs
are inaccessible. Direct network is denied. The only service access is authenticated local
IPC; only service-side `record` may reach ElevenLabs. No frame or render feedback is shown
until the authoring run ends. Initial and final readable-file inventories plus ADR-0007's full
leak gate are mandatory.

`request.json` uses the frozen Brief and:

```json
{
  "protocolVersion": 1,
  "brief": {
    "id": "northbridge-night-bus-interface-proof-v1",
    "text": "<the frozen Brief above, verbatim>"
  },
  "production": {
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "JBFqnCBsd6RMkjVDRZzb",
      "modelId": "eleven_v3",
      "seed": 7
    },
    "maxNewTakes": 1
  }
}
```

The on-disk value substitutes the full verbatim Brief for the explanatory placeholder shown
above.

### Authoring and repair limits

Contract discovery and `status` are unlimited. Before recording, the agent is allowed
`cycles = 2 + ceil(targetSeconds / 60)` Preflight calls and `cycles + 2` each of submitted plan
versions and `validate` calls, with no human hint — **3 Preflight and 5/5 for the frozen 25-second
short Brief**, 5 Preflight and 7/7 for the 180-second long variant. See the 2026-08-14 amendment
above for why the budget is expressed this way and what it may not be keyed on. The agent must
clear every minimum-duration `point_below` and `margin_crosses` before recording;
recommended-duration quality risk may remain visible.

After recording, at most two additional plan versions are allowed. Each must preserve the
Recording input: visual, asset, event, Section, SceneInstance or Beat-span changes and Beat-id
renames are allowed; text, segmentation, order and voice changes are forbidden. Needing another
dispatch or exceeding any limit fails the proof.

### Nominal command sequence

The isolated agent discovers the public contract and executes the lifecycle it needs. The Run
path is agent-chosen, contained below the proof root and represented here symbolically:

```text
vox production contract index
vox production contract show <one or more categories needed by the agent>
vox production run init --request request.json --out <agent-chosen-run>
# author plan.json
vox production run validate --run <agent-chosen-run> --plan plan.json
# bounded repairs return through validate
vox production run preflight --run <agent-chosen-run>
# pre-record repairs return through validate and Preflight
vox production run record --run <agent-chosen-run>
vox production run compile --run <agent-chosen-run>
# bounded take-preserving repairs return through validate, Preflight and compile
vox production run render --run <agent-chosen-run>
```

The harness selects the last successful rendered Run from the audited agent command records;
it never assumes a directory name and refuses a selection outside the proof root. After the
agent returns, the harness queries any unobserved contract categories, invokes `record` on the
selected Run to prove reuse, then invokes `status` to prove read-only inspection. The agent
`record` reports `recorded`; the harness probe reports `reused`, the same `takeId` and the same
full Take binding. Exactly one provider dispatch occurs and `newTakesUsed` remains one. No
other command opens outbound network. Every invocation follows the one-line stdout, stderr,
exit-code and receipt rules. Final stage remains `rendered`, every active binding is fresh,
and `status` changes no byte.

The final plan uses `image_context` and `bar_chart`; contains a `highlightBar` for label
`March` placed on a valid Word anchor resolving to the unique spoken `March`; and carries a
semantic image requirement for the opening Northbridge bus-stop image. That asset resolves
exactly as `placeholder`, never `failed` or `ready`. No unpublished identity key is required.

The Run binds canonical request and plan snapshot; validation and advisory Preflight reports;
one Take's manifest, MP3, alignment and current TimedBeat fold; green Compiled document and
Compile report; asset-resolution view; H.264/AAC MP4; chained receipts; and final attested
checkpoint. Every path matches ticket 06 and every descriptor hash matches exact bytes.
Compilation has zero errors, warnings remain visible, and neither synthetic timings nor silent
audio are accepted. The authoritative Take and MP4 durations are both 20.000–30.000 seconds.

### Required negative probes

After the agent run, the harness performs these without changing its transcript:

1. Copy the request with only `maxNewTakes: 0`, initialise `run-paused`, validate and Preflight
   the final plan, then call `record`. Require exit 0, `paused`, stage `preflighted`, zero used
   Takes, no Take files, no network and a next action naming budget exhaustion.
2. Preserve the rendered main checkpoint, then call main `record` with a structurally valid
   replacement grant carrying the correct Run and Recording-input hashes but an invalid opaque
   authenticator. Require exit 1, `failed`, `REPLACEMENT_AUTHORIZATION_INVALID`, no network,
   unchanged dispatch count and Take, and stage still `rendered`.

### Machine evidence

The harness writes a tamper-evident bundle outside the agent-writable root and exports it to
`.scratch/agent-production-interface/proofs/<UTC>-northbridge-night-bus/`. It contains:

- environment, launcher/service/contract identities and task-message hash;
- initial/final readable inventories, permissions and identity evidence;
- full leak scan and network audit;
- the complete agent transcript;
- one command record per invocation with actor, times, cwd, argv, input hashes, exact stdout
  and stderr bytes/hashes, exit code, Run revisions, file deltas/hashes and network delta;
- preserved main and paused Runs, invalid grant, `ffprobe.json`, `assertions.json`,
  `human-verdict.json` and hash-indexed `SUMMARY.md`.

Each machine assertion is `{ id, expected, observed, pass, evidence }`. Assertions separately
cover isolation, leaks, public contracts, envelopes, write containment, network exclusivity,
one dispatch, limits, stages/freshness, attestations and receipts, Recording input, Take and
fold integrity, reuse, scenario capabilities/action/anchor, advisory Preflight, placeholder-
not-failed status, compilation, media streams/audio/duration, and both negative outcomes. Any
false or missing assertion fails `machineVerdict`.

### Human verdict

After machine evidence is frozen, one named evaluator watches and listens to the exact preview
hash. The verdict records evaluator, time, display/audio setup, preview SHA-256 and `takeId`,
then pass/fail plus a note for each:

- intelligible and complete narration without silence, clicks or gaps, matching supplied facts;
- perceptible March highlight when the unique spoken word begins;
- legible opening, chart, hierarchy, transitions and ending, without clipping or rushed motion;
- placeholder shown as honest missing media rather than blank, broken or falsely ready;
- system-premium composition, typography, motion and pace for a narrated preview;
- complete preview watchable and listenable without explanation.

Any failed row fails. `pending` means incomplete, never passed. The form defaults
`verticalSliceReviewed: false`; this proof does not close gap 8. Only a separate watch/listen of
`section--vertical-slice` can do so.

### Explicit non-claims

This proves one Windows/named-pipe interface path for one deliberately engineered fictional
Brief. It does not establish measurement-gate validity; catalogue selection/action breadth;
Decline quality; a successful authorised replacement; crash or concurrent-command behaviour;
cross-platform transport; resistance to a compromised service/key; provider reliability or
performance statistics; factual-research quality; final-image/frame premium; or gap 8.

Ticket 03 and automated tests are supporting evidence only. No result may be called a
code-blind end-to-end pass until this fresh execution has both `machineVerdict: pass` and
`humanVerdict: pass`. No ADR is added because this is a procedural evidence contract.
