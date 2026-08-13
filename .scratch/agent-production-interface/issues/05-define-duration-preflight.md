# Define duration preflight

Type: grilling
Status: resolved
Blocked by: 02

## Question

How does the agent learn that a scene is at risk of failing its duration floor **before** quota
is spent? Decide the estimator basis, the configuration-scoped rate, the safety margin, the
uncertainty and advisory semantics, the report fields and their wording, and how the estimator
is falsified against recorded timings.

The defect this repairs: `BELOW_MIN_DURATION` is raised in
`packages/video/src/compile/index.ts` and is a **hard error** that cannot fire before a take
exists, because a scene has no duration until spoken milliseconds become frames. The manifest
publishes the requirement (`minDurationFrames`, `recommendedDurationFrames`) and nothing tells
the agent how long its beat text will take to speak. So the agent authors blind, records, and
only then learns a scene is under its floor — where the repair "give this beat more words"
invalidates the take.

**Estimates are advisory and never authoritative.** `syntheticBeats` divides a caller-supplied
duration evenly; it does not predict narration. Producing `BELOW_MIN_DURATION` from estimated
timings would manufacture false hard failures and cross rule 5. Only compilation against the
recorded take determines it, and preflight must say so in its own output.

Preflight also runs every plan-only check available without fabricated word onsets.

## Starting measurement

Measured from committed take `0a663181b592`, at no quota cost:

| | |
|---|---|
| voiceId | `JBFqnCBsd6RMkjVDRZzb` |
| basis | authored beat-text characters, excluding `BEAT_SEPARATOR` |
| provisional rate | 66.25 ms/authored beat-text character |
| sample | four beats, one script, one voice |
| observed per-beat spread | 61.6–71.1 ms/authored beat-text character |

Characters are preferred to words because the observed spread is tighter — ±8% against ±16%
for words (166 wpm overall). The denominator is the 419 characters authored in the four beat
texts; the three separator spaces are excluded even though their elapsed time remains inside
the preceding beat windows. This convention estimates duration from the text the agent
authors rather than from the synthesis string the voice package constructs. It is
configuration-scoped evidence, not a universal narration rate, and the margin must be sized
for n=4 rather than for the tightness of the mean.

A future voice change automatically invalidates this parameter, which must then be remeasured
from that voice's first verified take.

## Resolved when

The basis, rate, margin, advisory wording and falsification method are fixed, and the report
states in its own words what it cannot determine.

## Comments

### Grilling round 1 — estimator and calibration identity

Repository evidence fixes several facts before a decision is needed. The verified Take spans
27,760 ms over 419 authored beat-text UTF-16 code units; its synthesis string contains three
additional separator spaces. The four per-beat rates span 61.6–71.1 ms per authored unit.
ADR-0004 fixes the slice language to English, and the production voice decision fixes
ElevenLabs George (`JBFqnCBsd6RMkjVDRZzb`), `eleven_v3`, seed 7. Both current capabilities
publish a 90-frame minimum; their recommendations differ at 180 and 210 frames.

The open frontier is:

1. estimate each Beat as `authoredUtf16Units × 66.25 ms`, with no intercept, normalisation,
   trimming or `BEAT_SEPARATOR` charge; estimate a SceneInstance by summing the estimates of
   the exact Beats in `spansBeats`; convert only the resulting scene boundary to frames using
   the production FPS. UTF-16 units match both JavaScript string length and ADR-0004's verified
   alignment contract. The estimator reads only agent-authored text and never calls
   `syntheticBeats` or invents word onsets;
2. key this calibration to the complete synthesis configuration and language: provider,
   `voiceId`, `modelId`, seed and English. Publish its evidence with Take id, sample beat count,
   sample character count, point rate and observed range. If any key field changes, duration
   assessment becomes explicitly `unavailable`; Preflight still succeeds and permits
   `record`, but it must not borrow a rate from another voice, model, seed or language.

The recommendation is yes to both. The safety margin depends on this rate model; report risk
bands, wording and later falsification depend on the margin and follow in later rounds.

User confirmed both recommendations on 2026-08-13: `Q1 oui, Q2 oui`.

### Grilling round 2 — uncertainty policy and threshold meanings

The compiler establishes one mechanical detail rather than another user choice: it rounds
cumulative millisecond boundaries with `round(ms × fps / 1000)` and derives each scene window
from its first and last Beat boundary. Preflight must use that same boundary conversion for its
estimated windows instead of rounding independently estimated Beat durations.

The open frontier is:

3. apply an initial symmetric policy margin of 20% around the 66.25 ms/unit point estimate:
   53.00–79.50 ms per authored UTF-16 unit. Call this an `uncertaintyMargin`, never a
   confidence interval; n=4 cannot justify a probability claim. The lower estimate is the
   protective value for detecting narration that may be too short. Twenty percent is more than
   twice the observed 8% downward spread while remaining useful: at 30 fps, clearing a 90-frame
   minimum conservatively requires about 57 authored units rather than the point estimate's 46;
4. assess `minDurationFrames` and `recommendedDurationFrames` separately with the same three
   advisory states: `point_below` when the point estimate is below the threshold,
   `margin_crosses` when the point estimate reaches it but the lower estimate does not, and
   `margin_clear` when the lower estimate reaches it. The minimum assessment predicts risk of a
   later hard compile error; the recommended assessment predicts only the existing quality
   warning. None is named `pass`, `fail`, `valid` or `invalid`, and the upper estimate is shown
   for uncertainty disclosure rather than used to wave away short-duration risk.

The recommendation is yes to both. The exact report fields and sentences depend on these
states; the falsification policy depends on the accepted margin and follows afterward.

User confirmed both recommendations on 2026-08-13: `Q3 oui, Q4 oui`.

### Grilling round 3 — public report and falsification

The open frontier is:

5. make the persisted Preflight artifact a versioned advisory report with this shape, distinct
   from a Compile report:

   ```json
   {
     "reportVersion": 1,
     "authority": "advisory",
     "planChecks": { "findingCount": 0, "findings": [] },
     "duration": {
       "status": "available",
       "reasonCode": null,
       "calibration": {
         "provider": "elevenlabs",
         "voiceId": "JBFqnCBsd6RMkjVDRZzb",
         "modelId": "eleven_v3",
         "seed": 7,
         "language": "en",
         "basis": "authored_utf16_units",
         "pointMsPerUnit": 66.25,
         "uncertaintyMargin": 0.2,
         "lowerMsPerUnit": 53,
         "upperMsPerUnit": 79.5,
         "evidence": {
           "takeId": "0a663181b592",
           "beatCount": 4,
           "authoredUnits": 419,
           "observedMinMsPerUnit": 61.6,
           "observedMaxMsPerUnit": 71.1
         }
       },
       "summary": {
         "sceneCount": 0,
         "minimum": { "pointBelow": 0, "marginCrosses": 0, "marginClear": 0 },
         "recommended": { "pointBelow": 0, "marginCrosses": 0, "marginClear": 0 }
       },
       "scenes": []
     },
     "limitations": []
   }
   ```

   Each `planChecks.findings[]` entry is
   `{ code, regime, severity, sectionId, sceneId, field, message, repair }`, with nullable
   fields always present where not applicable. Each scene entry is
   `{ sectionId, sceneId, capabilityId, authoredUtf16Units, estimate: { lowerMs, pointMs,
   upperMs, lowerFrames, pointFrames, upperFrames }, minimum: { thresholdFrames, assessment },
   recommended: { thresholdFrames, assessment }, guidance }`. Millisecond estimates are
   reported to two decimals while frame bounds use the compiler's boundary-rounding rule.
   When calibration is absent or invalidated, `status` is `unavailable`, `reasonCode` is
   `CALIBRATION_MISSING` or `CALIBRATION_INVALIDATED`, and `calibration`, `summary` and
   `scenes` are null; plan-only findings remain available. The command still succeeds.

   `limitations` always says, in the report itself: “Duration estimates are advisory and
   derived from authored text; no Take was used. Preflight cannot determine actual Beat or
   Word timings or whether compilation will emit `BELOW_MIN_DURATION` or
   `SCENE_BELOW_RECOMMENDED_DURATION`. Only compilation against a verified Take is
   authoritative.” Scene guidance names a risk, never an error, and recommends reassigning or
   merging Beats before recording; textual revision is suggested only when editorial intent
   warrants it. Preflight never mutates the plan;
6. treat every later verified Take for the exact calibration key as holdout evidence. Audit
   each non-empty Beat's actual milliseconds per authored UTF-16 unit against 53.00–79.50 and
   compare every scene previously assessed `margin_clear` at its minimum with authoritative
   compilation. Any Beat outside the published interval, or any minimum `margin_clear` scene
   that compiles with `BELOW_MIN_DURATION`, falsifies that calibration version immediately.
   Persist the observation, mark the calibration invalidated, and make later duration reports
   unavailable until a reviewed, newly versioned calibration from verified Takes replaces it;
   never silently widen the margin or retune the rate from production traffic. The founding
   Take is calibration evidence, not its own holdout.

The recommendation is yes to both. This is the final frontier for ticket 05; an ADR is not
warranted because the provisional rate and margin are intentionally cheap to replace, while
the durable advisory/authoritative distinction already belongs to the public lifecycle.

User confirmed both recommendations on 2026-08-13: `Q5 oui, Q6 oui`.

## Answer

Preflight estimates narration duration from the exact text the agent authors, before quota is
spent, but never manufactures timings or a compile result.

### Estimator and calibration

For the accepted English production configuration — ElevenLabs George
`JBFqnCBsd6RMkjVDRZzb`, `eleven_v3`, seed 7 — each Beat's point duration is:

`authored UTF-16 units × 66.25 ms`

Counting uses the verbatim Beat text with no normalisation or trimming. `BEAT_SEPARATOR` is
excluded and there is no intercept. Scene estimates sum the exact Beats named by
`spansBeats`. Cumulative estimated boundaries are converted with the compiler's
`round(ms × fps / 1000)` rule, and scene frames are the difference between the converted first
and last boundaries; individual Beat lengths are never rounded and summed.

The **Duration calibration** key is the complete synthesis configuration plus language:
provider, `voiceId`, `modelId`, seed and English. Its initial evidence is verified Take
`0a663181b592`: four Beats, 419 authored UTF-16 units, point rate 66.25 ms/unit and observed
per-Beat range 61.6–71.1. Any key change makes duration assessment unavailable rather than
borrowing a rate.

The initial `uncertaintyMargin` is 20%, producing a policy interval of 53.00–79.50 ms/unit.
This is deliberately not called a confidence interval: four Beats support no probability
claim. Both `minDurationFrames` and `recommendedDurationFrames` receive one of three advisory
assessments:

- `point_below`: the point estimate is below the threshold;
- `margin_crosses`: the point estimate reaches it but the lower estimate does not;
- `margin_clear`: the lower estimate reaches it.

Minimum assessment predicts risk of the hard `BELOW_MIN_DURATION` check. Recommended
assessment predicts only the quality warning `SCENE_BELOW_RECOMMENDED_DURATION`. Neither is a
pass, failure, validation or compilation decision.

### Public Preflight report

The persisted artifact has `reportVersion: 1`, `authority: "advisory"`, and these top-level
blocks:

- `planChecks: { findingCount, findings }`, where every finding has the always-present fields
  `{ code, regime, severity, sectionId, sceneId, field, message, repair }` and nullable values
  where a field does not apply;
- `duration: { status, reasonCode, calibration, summary, scenes }`;
- `limitations: string[]`.

An available `calibration` publishes its key, basis, point rate, margin, lower and upper rates,
and evidence. `summary` counts all three assessment states separately for the minimum and the
recommendation. Every scene publishes
`{ sectionId, sceneId, capabilityId, authoredUtf16Units, estimate, minimum, recommended,
guidance }`; `estimate` contains lower/point/upper milliseconds and frames, while each threshold
contains its frames and assessment. Milliseconds are reported to two decimals and frame bounds
use the compiler's boundary rounding.

When calibration is missing or invalidated, duration is `{ status: "unavailable",
reasonCode: "CALIBRATION_MISSING" | "CALIBRATION_INVALIDATED", calibration: null, summary:
null, scenes: null }`. Plan-only findings remain available and the command succeeds.

Every report states:

> Duration estimates are advisory and derived from authored text; no Take was used. Preflight
> cannot determine actual Beat or Word timings or whether compilation will emit
> `BELOW_MIN_DURATION` or `SCENE_BELOW_RECOMMENDED_DURATION`. Only compilation against a
> verified Take is authoritative.

Guidance names a risk rather than an error, recommends reassigning or merging Beats before
recording, and suggests a textual revision only when editorial intent warrants it. Preflight
never mutates `plan.json` and its risks never block `record`.

### Falsification

Every later verified Take for the exact calibration key is holdout evidence. For each non-empty
Beat, production compares actual milliseconds per authored UTF-16 unit with 53.00–79.50; it
also compares every scene previously assessed `margin_clear` at the minimum with authoritative
compilation. An observation outside the interval or a supposedly clear scene compiling with
`BELOW_MIN_DURATION` immediately invalidates that calibration version.

The observation is persisted and later duration reports become unavailable until a reviewed,
newly versioned calibration from verified Takes replaces it. Production never silently widens
the margin or retunes the rate from traffic. The founding Take remains calibration evidence,
not its own holdout.

No ADR is added: the provisional numeric rate and margin are intentionally cheap to replace,
while the durable distinction between advisory Preflight and authoritative compilation is
already part of the public lifecycle decision.
