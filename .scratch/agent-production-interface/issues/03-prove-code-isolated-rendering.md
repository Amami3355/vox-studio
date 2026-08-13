# Prove code-isolated rendering

Type: prototype
Status: resolved
Blocked by: none

## Question

Which candidate boundary can validate, compile and render a current `VideoPlan` while keeping
the agent code-blind? Unless the map's third cut-line item has been invoked, compare both:

1. a local opaque runtime artifact placed in the agent's environment;
2. a thin local CLI invoking a production process outside the readable environment.

Report what each boundary exposes, leaks and requires. These are not two packagings of one
design: the second moves `compile` and `render` off the agent's machine, which is a different
trust model, failure surface and artifact-ownership story.

If the third cut-line item has been invoked, test the most credible candidate first. A green
result resolves the prototype without testing the other; a leak or failure requires testing
the second before the result may be red.

Build only enough to make the boundary decision concrete. Do not turn the prototype into
production packaging.

## Pass / fail

**Green** — at least one candidate renders a current `VideoPlan` with none of the following
reachable from the agent's environment: readable internal implementations, TypeScript,
sourcemaps, repository paths, retained internal comments or documentation.

**Red** — neither candidate satisfies those conditions within the permitted environment.

Isolation must be **actively falsified**, not inferred from packaging settings: search the
built artifacts for known leak markers — a JSDoc sentence known to exist in
`packages/video/src/compile/index.ts`, a `packages/video/src` path fragment, a `.map`
reference, or a distinctive internal implementation identifier. Public identifiers are
expected. An internal identifier is a signal to inspect, not an automatic failure; the green
condition fails only when an implementation is readable from the agent's environment.

**On red, code-blindness is not weakened.** It is the defining property of the destination and
the map's *Never cut* list holds it. The destination is redrawn explicitly by the user; the
prototype's author may not silently redefine "without code access".

## Answer

**Green through candidate 2: a thin readable client calling production outside the agent's
readable environment. Candidate 1 is rejected in the current runtime toolchain.**

The two candidates were exercised from Docker containers with no repository mount. The
throwaway source and full result record are captured outside the production branch at commit
`10f4fd8` on branch `prototype/code-isolated-rendering-2026-08-13`.

### Candidate 1 — local opaque runtime artifact

The actual Remotion browser artifact needed by a local render contained 15 JavaScript
sourcemaps totalling 12,007,644 bytes. Its `bundle.js.map` named 25 Vox source files and
included their `sourcesContent`, including `src/compile/index.ts` and the precommitted JSDoc
marker. Removing the maps would not make it opaque: `bundle.js` itself exposed readable Vox
implementation and the distinctive internal identifier `reportDegradedAsset`.

The probe run inside the container found all 15 forbidden `.map` files, 19 marker hits and
readable implementation. The repository itself was absent, so the leak came from the runtime
artifact rather than an accidental source mount. Minification is not a remedy under the threat
model. This candidate would require a different, demonstrably non-readable runtime technology;
the current JavaScript/Remotion packaging path fails.

### Candidate 2 — thin client, external production process

The agent container received only the readable HTTP client, `catalog.json`, the current
`vertical-slice.plan.json`, its current timed-beat artifact, the leak probe and outputs. The
repository-owning host service alone loaded the source, production dependencies and Remotion
browser bundle.

The following operations ran from the isolated container rather than being inferred from the
design:

- `validate` returned HTTP 200 with `ok: true`, zero errors and zero warnings;
- `compile` returned HTTP 200 with `ok: true`, a one-section 833-frame document, zero errors
  and the two expected `SLOT_RELOCATED`/`info` warnings;
- `render` returned HTTP 200 and wrote an 8,441,801-byte MP4;
- `ffprobe` identified H.264/AAC MP4, 1920×1080 at 30 fps, 27.818667 seconds;
- the MP4 SHA-256 was
  `EB1ACFF6C44747E8E72766F45939D0E7E293488473BF25FAE0572C33B5F327F9`;
- the final read-only leak probe enumerated all eight agent-readable files and returned
  `ok: true`, no `.ts`/`.tsx`/`.map`, no marker hits, and
  `repositorySourceReachable: false`.

The actively probed markers were the known JSDoc sentence from `compile/index.ts`, a
`packages/video/src` fragment, `sourceMappingURL` and `reportDegradedAsset`. Public identifiers
in the catalog and reports were allowed and were not treated as leaks.

### Trade-offs and requirements exposed

The green boundary keeps production implementations and dependencies outside the readable
environment, but it introduces an authenticated transport, a separately operated production
service, artifact upload/download, remote failure semantics and service-owned temporary
rendering state. Those are production obligations for the boundary and artifact tickets; this
throwaway service is not production packaging and does not settle their contracts.
