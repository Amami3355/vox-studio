# 01 — The `image_context` capability

Status: ready-for-agent

Add a second, structurally different `SceneCapability` for an editorial image paired with
concise context copy. One `splitLeft` layout, no event vocabulary, agent-authored props
carrying a semantic `AssetRequirement` and never a URI.

Covers spec user stories 1–21 and 28–29.

Done when the eight contract files exist, the capability is registered once, and the
catalog contract test passes it without a special case.

## Comments

**Delivered** in `d34af39`. `packages/video/src/scenes/ImageContextScene/`.

**Amended after review.** Every contract file was missing the rationale header that
`BarChartScene` establishes as the pattern; added. `meta.ts` now states why
`occupiesRegions: ['full']` is the honest declaration rather than an under-specified one
— see `06`.
