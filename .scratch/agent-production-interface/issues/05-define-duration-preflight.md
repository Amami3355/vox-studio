# Define duration preflight

Type: grilling
Status: open
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
