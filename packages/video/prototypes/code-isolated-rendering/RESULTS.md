# Results — 2026-08-13

## Verdict

Green through the thin-client candidate. The current local Remotion runtime artifact is not
code-blind and is rejected.

This experiment is a throwaway boundary proof, not production packaging and not the final
stranger-executable proof.

## Candidate 1 — local runtime artifact

The renderer's actual Webpack output was placed in a container with no repository mount and
probed from inside that container. The artifact contained 15 JavaScript sourcemaps (12,007,644
bytes). `bundle.js.map` named 25 Vox source files and carried their `sourcesContent`, including
`src/compile/index.ts`; the known JSDoc marker was present. Even outside the sourcemaps,
`bundle.js` exposed the distinctive internal identifier `reportDegradedAsset` and readable
implementation statements.

Removing sourcemaps would therefore remove one leak and leave the readable implementation.
Minifying it would not satisfy the threat model. This candidate would need a different native
or otherwise demonstrably non-readable runtime technology, not a packaging flag in the
current JavaScript renderer.

## Candidate 2 — thin client, production outside the readable environment

The host service owned the repository and ran `validateVideoPlan`, `compile`, Remotion bundle
and `renderMedia`. A Docker container with no repository mount received only:

- `agent-client.mjs`, the readable HTTP transport;
- `catalog.json`;
- the current `vertical-slice.plan.json` as `plan.json`;
- the current `vertical-slice.beats.json` as `take.beats.json`;
- the leak probe and command outputs.

The three client commands were run separately from that container:

```text
validate -> HTTP 200; report ok=true, 0 errors, 0 warnings
compile  -> HTTP 200; result ok=true, 833 frames, 0 errors, 2 SLOT_RELOCATED/info warnings
render   -> HTTP 200; preview.mp4 written
```

`ffprobe` identified the returned file as H.264/AAC MP4, 1920×1080 at 30 fps, duration
27.818667 seconds. It was 8,441,801 bytes with SHA-256
`EB1ACFF6C44747E8E72766F45939D0E7E293488473BF25FAE0572C33B5F327F9`.

The final read-only probe from inside the container enumerated eight readable files and found:

```json
{
  "ok": true,
  "forbiddenNames": [],
  "markerHits": [],
  "repositorySourceReachable": false
}
```

The markers were the known JSDoc sentence from `compile/index.ts`, a
`packages/video/src` fragment, `sourceMappingURL`, and `reportDegradedAsset`.

## Boundary consequences

The green candidate exposes a small readable transport and public JSON, while the production
implementation, Remotion browser bundle and production dependencies remain in the service
environment. It requires a separately isolated production process, authenticated transport,
artifact transfer and service-failure semantics. The prototype proves the isolation shape and
current rendering path only; it does not settle those production contracts.
