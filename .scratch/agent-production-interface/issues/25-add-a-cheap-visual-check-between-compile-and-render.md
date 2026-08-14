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
- **What it costs.** A still still needs the Remotion bundle, and the bundle's share of the 333 s
  has not been measured. What disappears is 5 500 frames of rendering plus the H.264/AAC encode.
  **Measure the split before promising a number** — the whole premise is that this is cheap, and
  that premise is currently an assumption. `render-demo.mts` already isolates bundle-then-stills
  from `renderMedia`, so this is a timing run rather than a build.
- **Where it lives.** A stage between `compile` and `render`, content-addressed like the others, is
  the shape that matches everything around it. The alternative is a local-only script, which costs
  less and teaches the agent nothing.
- **Who may ask.** If it becomes `run.contactsheet`, it is an eleventh public command and the
  agent can call it. That is arguably the point — an agent that can look at its own output before
  committing to a render — except that the agent cannot see images, so it would be spending time
  producing evidence only a human can read. Worth deciding deliberately rather than by default.
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

