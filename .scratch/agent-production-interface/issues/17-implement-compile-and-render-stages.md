# Implement production compile and render stages

Type: task
Status: resolved
Blocked by: 13, 15, 16

## Objective

Add authoritative compilation and Remotion rendering to the Production service without making
the implementation or its dependencies readable to the agent.

## Scope

- Reverify plan, validation, Preflight, Take, alignment and current fold before every compile.
- Persist content-addressed Compiled document, structured report, asset-resolution view and
  fresh/stale bindings; warnings never block, errors produce `needs_repair`.
- Reverify compilation inputs, audio and service-readable assets before every render.
- Render H.264/AAC MP4 through private Remotion/Chromium/FFmpeg dependencies and publish only
  the verified preview artifact under the Run root.
- Preserve `ready`, `placeholder` and `failed` distinctly through compilation, render binding
  and final receipts.
- Prove identical compile/render input reuse and zero outbound network.

## Acceptance

The current vertical slice can compile and render through the service from a verified Take;
tampering, stale bindings and missing assets behave exactly as the public protocol specifies.

## Verification

```text
pnpm --filter @vox/production typecheck
pnpm test -- packages/production/tests/compile-command.test.ts packages/production/tests/render-command.test.ts
pnpm test:render
```

## Answer

Implemented 2026-08-13.

- `run.compile` now distrusts and recomputes the plan identity, validation projection,
  Preflight projection, complete Take identity and current TimedBeat fold before invoking the
  compiler. A green compile publishes immutable content-addressed document/report artifacts;
  a red compile returns `needs_repair` at exit 0 and never binds a document.
- Persisted Compile reports and Compiled documents have strict runtime schemas. Rendering
  recomputes the complete compilation input, verifies those schemas and hashes, reverifies the
  Take/audio, and compares a derived asset-resolution view with the authenticated binding.
- `ready`, `placeholder` and `failed` remain distinct in compile and render bindings.
  Placeholder/failed scene media use the designed editorial plate without dereferencing their
  operational URI; a `ready` asset must be a non-empty data URI or an existing local file.
- Exact compile and render input repeats verify and reselect their immutable outputs, append a
  new receipt, and do not call the compiler or renderer again. Changed/missing artifacts and
  unreadable ready assets return structured `needs_repair` without regeneration.
- The Remotion adapter stages only the verified bound audio in a private temporary public
  directory, bundles the generic entry point, renders `compiled-document` as H.264/AAC MP4,
  verifies the MP4 signature and removes its temporary workspace before publishing preview
  bytes under the Run root.
- The recorded vertical slice was driven through `init -> validate -> preflight -> verified
  Take -> compile -> render`; the produced preview exceeded 100 KB and `ffprobe` independently
  reported H.264 video and AAC audio. The injected outbound network adapter remained unused.
- Reverification exposed and fixed an integrity bug in `verifyTimedBeatFold`: semantically
  identical canonical JSON was being compared with insertion-order-sensitive `JSON.stringify`.
  It now uses structural equality after the artifact hashes have been verified.

Verification actually run:

```text
pnpm --filter @vox/production typecheck
  PASS
pnpm test -- packages/production/tests/compile-command.test.ts packages/production/tests/render-command.test.ts
  PASS - 2 files, 12 tests
pnpm test:render
  PASS - 4 files, 45 tests, including real service MP4 + ffprobe H.264/AAC
pnpm catalog:check
  PASS - catalog and Production projections current
pnpm typecheck
  PASS - all 4 workspace projects
pnpm test
  PASS - 28 files, 330 tests
git diff --check
  PASS
```

The first full render-suite pass encountered one transient Puppeteer page-close/composition
discovery failure in the existing `safe-area` suite. Its isolated replay passed 38/38, and the
subsequent full `pnpm test:render` pass was green 45/45; no retry is omitted from the evidence.
