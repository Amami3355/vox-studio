# Add a cheap visual check between compile and render

Type: decision
Status: open
Blocked by: none

## Objective

Everything a compiled document decides can be asserted in JSON in 208 ms. Whether it *looks* right
can only be found out, from a Run, by spending 5 minutes 34 on a full H.264 render. Nothing in the
production path sits in between — so the one question the machine cannot answer is also the most
expensive one to ask.

A still-frame prototype already exists as a development script (`render-demo.mts`); it has never
been pointed at a Run.

Decide whether a still-frame contact sheet becomes a stage of its own, and who gets to ask for it.

**Two different questions wear the same clothes here, and this ticket originally conflated them.
Corrected 2026-08-14 at the user's instruction — see the comment of that date.**

| | the question | who answers it | machine-decidable |
| --- | --- | --- | --- |
| **coherence** | did the renderer *execute* what the document decided? | the agent | **yes** |
| **design** | is the visual language good? | the user, upstream | no |

The first is this ticket's objective. The second is ticket 22's, it is upstream work owned by the
user, and **it is not what an agent's visual check is for.** A contact sheet built to help an agent
judge taste would be building the wrong instrument; a contact sheet built to let an agent confirm
its own render is a correctness tool that happens to use pixels.

## The measured cost

From `proofs/2026-08-14T012547-734Z-northbridge-night-bus/commands.jsonl`, one 183-second video:

| command | duration |
| --- | --- |
| `run.validate` | 0.1 – 0.4 s |
| `run.preflight` | 0.1 – 0.45 s |
| `run.record` | 46.8 s (the provider call) |
| `run.compile` | **0.208 s** |
| `run.render` | **333.7 s** |
| `run.render`, second call | 0.9 s (content-addressed reuse) |

The iteration loop below the render is already excellent: a plan change stales validation,
preflight and compilation, and all three re-run in under a second. Above it there is a cliff.

## What a still actually costs — measured 2026-08-14

The premise below was an assumption when this ticket was filed. It is now a measurement, taken
by `packages/video/scripts/measure-still-cost.mjs` against this same Run's compiled document, on
the same machine that produced the 333.7 s render.

Two runs, reported as a range rather than as one flattering figure. The spread is real and worth
carrying: `openBrowser` in particular collapses from 1 260 ms to 217 ms once Chrome is warm.

| phase | run 1 | run 2 | paid |
| --- | --- | --- | --- |
| `bundle` | 1 994 ms | 1 826 ms | once per code change |
| `openBrowser` | 1 260 ms | 217 ms | once per session |
| `selectComposition` | 1 004 ms | 858 ms | once per document |
| **startup subtotal** | **4.3 s** | **2.9 s** | |
| first `renderStill` | 382 ms | 540 ms | |
| each further `renderStill` | **500 ms** | **615 ms** | per frame |
| **14 named frames, everything included** | **11.1 s** | **11.4 s** | |

Per-still spread within a run: 318 / 491 / 891 ms and 484 / 573 / 958 ms (min / median / max).
The total is the stable number — **11.1–11.4 s** — because startup and marginal cost trade against
each other.

**30× cheaper than the render it replaces**, and 660× per additional frame. No network call and
no provider, so the money cost is zero. The fourteen PNGs weigh 7.4 MB.

The number that decides the shape is the **~0.5 s marginal**, not the 11 s total: startup
amortises across every frame of a session, so a contact sheet that samples more frames gets
cheaper per frame, and an interactive loop that re-samples one frame after a token change pays
about half a second.

The feared cost was the bundle, on the theory that a still cannot escape it. It cannot — but the
bundle is 2 seconds, or **0.6% of the render**. What the 333.7 s actually buys is 5 501 frames
and the H.264/AAC encode, and a still declines both.

## What already exists, and is not connected

**The moments worth looking at are already named.** A compiled document names every frame a visual
decision lands on. For this run that is 7 scene starts and 12 resolved events — five of which fall
exactly on their scene's start, since an event stored at scene-relative `frame: 0` is the scene's
own opening. Their distinct union is:

```
0, 637, 835, 1075, 1436, 1470, 1843, 2215, 3046, 3419, 3792, 4156, 4486, 4520
```

**Fourteen frames, out of 5 501 rendered.** Frame 1075 is the one `b2.word:March` resolved to.

Two caveats on that set. `durationInFrames` is 5 501 and is **exclusive**, so the last valid index
is 5 500; a closing frame has to be asked for deliberately, making it 15. And `rainy-opener` and
`access-closing` carry no events at all, so this set gives them one frame each out of 637 and 981 —
which is the strongest argument for the fixed-sample-per-scene question in Scope below.

The set is also not *everything* the compiler decided: it omits the 399 word onsets, the safe
areas, the layouts and the asset resolutions. It is every frame worth **looking** at, which is a
smaller and more useful claim.

**The reading method already exists and is already proven.** `apps/component-studio/src/App.tsx`
has a filmstrip mode — *"Six frames across the scene. Read them against the grid: one dominant
element…"* — and its own header states the reason it was built:

```
The evaluation loop the quality grid needs, and the thing Remotion Studio cannot do:
[…] filmstrip per variant. Without this there is no way to see that a token change broke
```

So the idea is not new here. What it reads is a **capability's examples in isolation**, against
synthetic beats, inside a browser. It has never been pointed at a compiled document, at a real
Take, or at a Run.

**The renderer half already exists as a prototype.** `packages/video/scripts/render-demo.mts:110`
is a hand-rolled contact sheet of a compiled document:

```ts
const inputProps = { document: result.document };
const composition = await selectComposition({ serveUrl, id: 'compiled-document', inputProps });

for (const frame of [15, 45, 75, 120]) {
  await renderStill({ serveUrl, composition, inputProps, frame,
    output: join(out, `frame-${String(frame).padStart(3, '0')}.png`),
    imageFormat: 'png', logLevel: 'error' });
}
```

Four hard-coded frames, over a document compiled from a synthetic take — never over a Run's real
Take, and never at frames the document itself names. `packages/video/tests/render/` goes further
and md5-hashes stills of a compiled document, so a machine-assertable still check already exists in
the test suite.

What is missing is not the mechanism. It is the mechanism pointed at a Run, sampling the frames the
document names, and reachable from anywhere other than a script.

The production path has none of it: `packages/production/src/render/remotion.ts` calls `bundle`,
`selectComposition` and `renderMedia`, and nothing else.

## Why it is worth a ticket

Ticket 22 exists because a human watched a technically complete preview and refused the
system-premium claim. That verdict is the only instrument the project has for the quality
frontier, and today it costs a full render to obtain a single sample of it. A frontier that
expensive to observe is a frontier nobody probes often enough.

The long-form run makes the point sharper than any argument: its render took over five minutes and
the agent's own narration records two earlier attempts killed by a shell timeout, with stranded
Remotion workers it had to terminate by hand. The expensive step is also the fragile one.

## Scope

Open questions, no approach chosen:

- **Which frames.** Scene boundaries plus resolved events is the obvious set, and the document
  already carries both. Whether to add a fixed sample per scene — component-studio's six — or to
  bias toward the first frames after each event, where entrance animations land, is undecided.
- **~~What it costs.~~ Closed 2026-08-14** — see *What a still actually costs* above. 3–4 s of
  startup, ~0.5 s per frame, 11.1–11.4 s for the whole fourteen. The premise held.
- **Where it lives.** A stage between `compile` and `render`, content-addressed like the others, is
  the shape that matches everything around it. The alternative is a local-only script, which costs
  less and teaches the agent nothing.
- **Who may ask.** If it becomes `run.contactsheet`, it is an eleventh public command and the
  agent can call it. That is arguably the point — an agent that can look at its own output before
  committing to a render.

  Two corrections to the objection this bullet originally raised, both found on 2026-08-14.

  *"The agent cannot see images"* is a property of a harness, not of agents. It holds for Codex
  behind the proof sandbox, which returns text. It does not hold for a multimodal harness —
  Google ADK over Gemini, or Claude Code, which read one of the measured PNGs directly. So the
  artifact should be **two artifacts at no extra render cost**: the PNG for whoever can look, and
  a JSON of measurements for whoever cannot. The measuring half already exists and is already
  proven — `packages/video/tests/render/png.ts` decodes a PNG and exposes `pixelAt`,
  `hashRegions`, `bandsInside` and `bandsOutside`, and `safe-area.test.ts` runs them over the
  whole catalog. That machinery is pointed at the catalog and has never seen a Run either.

  *The harder constraint is a schedule one, and it is not in this ticket.*
  `docs/measurement-gate.md` — *The harness*, settled — states: **"Blind on render during the
  measured run. No stills, no video, no frame of feedback."** A public `run.contactsheet` is
  therefore a capability that must be **withheld during a measurement-gate cold pass**, in the
  same way and for the same reason `validate` is withheld. *What voids a run* lists "a render was
  seen during the cold pass" as voiding. A still is a render.

  This does not argue against the command. It says that shipping it as an unconditional eleventh
  public command would silently void the next gate run, and that whatever is built needs the same
  withholding switch `validate` already has. Decide it here rather than discovering it in
  September.
- **Which of three existing things is promoted.** `render-demo.mts` already writes PNG stills from
  a compiled document and shares the `selectComposition` + `inputProps: { document }` shape with
  `render/remotion.ts` — the cheapest path is to generalise its frame list and give it a home.
  component-studio's filmstrip contributes the *reading* method, not machinery: it renders live
  React in a browser over catalog examples. The third option, a new implementation, should have to
  argue against the first.

## Acceptance

Given a Run at stage `compiled`, a human can obtain the frames where every scene begins and every
event fires, without rendering the video. The operation is content-addressed and reused on a
second identical call, like every other stage.

## Does not claim

This does not make the visual quality assertable by machine, and must not be presented as doing
so. It makes the human verdict of ticket 22 cheap enough to run early and often, which is a
different and smaller claim. Ticket 22 states the same need independently: *"Fixing it therefore
must not require re-running a paid proof to observe. Any candidate improvement should be judgeable
on a rendered preview built from an existing Take."*

It does **not** claim the still machinery is novel. `render-demo.mts` and the render tests already
call `renderStill` over a compiled document; this is a promotion and a generalisation, not an
invention.

It also does not touch the time pipeline. Every frame a contact sheet samples is a frame the
compiled document already named; nothing here computes a new one.

**It says nothing about the voiceover.** `renderStill` produces a silent PNG; a contact sheet
cannot observe narration, sync or pace. That is not a gap this ticket should try to close,
because the audio question is already answered upstream and for free: the take carries
`alignment.json` with a per-word onset, and compilation resolves every word anchor to a frame
inside `run.compile`'s 208 ms. Whether `b2.word:March` landed on the spoken word is a JSON
assertion that exists today. A still is the answer to a **spatial** question only — composition,
typography, safe areas, layout — and pairing it with the alignment JSON is what covers both
without either pretending to be the other.

## Comments

### Opened 2026-08-14

Opened during a teaching session, from a question about whether compilation could be made
deterministic before building the full MP4. It already is — the surprise was that `run.compile`
costs 208 ms and the cliff is entirely in `run.render`.

Checked before filing: no existing ticket 01–23 proposes a still, contact sheet or visual-check
capability, and component-studio's filmstrip is wired to the catalog rather than to a Run.

### Corrected 2026-08-14

A review caught two errors in the first draft, both of which weakened the ticket rather than
propping it up.

The frame set was given as nineteen. It is **fourteen**: five of the twelve events sit at
scene-relative `frame: 0` and were double-counted, and `durationInFrames` was listed as a
sampleable frame when it is the exclusive end.

More importantly, the draft claimed `renderStill` appeared nowhere in this repository's own source,
and stated that as a pre-filing check. It was wrong — `render-demo.mts:113` and three tests under
`packages/video/tests/render/` use it, and the first of those already renders stills from a
compiled document. The ticket now asks for a promotion rather than a build, which is a smaller and
better-founded request.

### Measured 2026-08-14

The cost question is closed with numbers rather than an estimate, and two of the remaining open
questions moved with it. Sections added above: *What a still actually costs*, the rewritten
*Who may ask*, and the voiceover paragraph under *Does not claim*.

The measurement is reproducible: `pnpm --filter @vox/video measure:stills` runs
`scripts/measure-still-cost.mjs`, which points the existing `renderStill` path at this Run's
stored `document.json` and times every phase separately. It writes fourteen PNGs and a
`measurement.json` to a scratch directory and touches no production code. Re-run it after any
change to the bundle's size or the scene tree; the numbers above are the baseline it is compared
against.

Two things the measurement produced that no argument had:

**The still machinery works on a real Run, first try.** The ticket claimed `render-demo.mts` had
"never been pointed at a Run". It has now, by the measuring script, and the only thing needed was
handing the stored `document.json` in as `inputProps` — the shape `render/remotion.ts:42` already
uses. There is no adapter to write. Whatever this ticket becomes, it is a promotion, and the
estimate should reflect that.

**A side observation for ticket 22, not a justification for this one.** Frame 1075 — the frame `b2.word:March` resolved
to — renders correctly: the highlight lands on the right bar, the type is clean, the values read.
And the right third of the canvas is empty. Ticket 22 has been open since 2026-08-14 with *"no
single offending element was named"*; this is a candidate, produced in eleven seconds by a tool
that did not exist that morning. It is one frame and one reader's note, not a verdict — but it is
the first thing that ticket has had to point at.

### Objective corrected 2026-08-14 — deferred, not dropped

**Status: parked at the user's instruction.** Not scheduled before the 7 September deadline. What
follows is recorded so that whoever picks this up builds the right thing.

The session that measured the cost also argued the ticket from the wrong end — treating the
contact sheet as an instrument for **judging design**, and therefore weighing it against ticket 22
and against the human verdict. The user's actual reasoning, stated plainly:

> l'agent puisse vérifier le rendu pour la cohérence pas pour juger du design des composants.
> ça c'est notre travail en amont.

**Coherence, not taste.** Design quality is upstream work the user owns; it is never delegated to
an agent, and an agent's visual check is not an input to it. This is the objective.

**Why that is a stronger ticket than the one argued, and closes a real hole.** Everything the
compiled document asserts in 208 ms is a statement about a *decision*: this scene runs 637→1470,
`highlightBar` resolves to frame 1075, this asset degraded to a placeholder. None of it is a
statement about the **artifact**. A component that silently fails to draw its highlight, an asset
that resolves and then does not load, a title that overflows its safe area, a scene that renders
empty — every one of those passes every JSON assertion in the repository, because the JSON
describes what the compiler decided and not what the renderer did.

That gap is the repository's own recorded failure mode, from the ticket-20 review: *a proof
assertion must measure the artifact it names, not the assertion's name.* A coherence check on
stills is that principle applied one layer further out — it is the first assertion in the system
that measures the artifact rather than the plan.

**And it does not need the agent to see anything.** The distinction that made the "who may ask"
objection look fatal disappears once the goal is coherence. Taste needs an eye; coherence needs a
predicate. Everything on this list is a boolean an agent reads as text:

- the region a scene declares is non-empty at the frames the scene owns
- the frame an event resolves to differs from the frame before it — the event visibly happened
- nothing is drawn outside the safe area the compiler assigned (`bandsOutside` already does this)
- a placeholder is drawn where the compilation reported a placeholder, and nowhere else
- two renders of the same document produce the same frames

`packages/video/tests/render/png.ts` already provides `pixelAt`, `hashRegions`, `bandsInside` and
`bandsOutside`, and `safe-area.test.ts` already runs the last one across the whole catalog against
a rendered control frame. The reading half is built and proven; it has only ever been pointed at
the catalog, never at a Run.

**What this means for the envelope.** A receipt returns `{ kind, path, sha256 }` — a path to a
file a text-only agent cannot open. The PNG is therefore not the deliverable for an agent; the
**predicates are**, and they belong in `envelope.data`. The PNG remains the deliverable for the
user and for a multimodal harness. Same render, two readers, no extra cost.

**The measurement-gate collision survives this correction and gets sharper.** See
`docs/measurement-gate.md` §Open. A coherence predicate returning "the highlight did not render"
is still feedback on a render during a cold pass. Whether an objective predicate counts as *seeing
a render* the way an image does is now the precise form of that question, and it is a better
question than the one filed.

**What is settled and what is not.** Settled: the objective is coherence; design stays upstream
with the user; the cost is measured. Open: everything in *Scope* above except cost, plus the gate
question. Nothing is claimed as built.

