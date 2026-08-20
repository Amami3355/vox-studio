import { defineConfig } from 'vitest/config';

/**
 * The content-stress matrix: every capability's schema taken to its ceiling and to its
 * floor, drawn in every layout, in every composition it declares, under both cameras.
 *
 * Split from `test:render` rather than added to it, which is the same split `test:render`
 * made when it left `test`. The render suite is the standing discipline that a red pixel
 * test is a real failure, and that discipline survives only while people run it; this
 * matrix roughly doubles its cost and answers a different question — `test:render` asks
 * whether the *catalog's declarations* are true, and this asks whether the *schemas'
 * ceilings* are survivable. ADR-0003 makes it obligatory for any commit touching a schema,
 * a layout or `supportedCompositions`, with `catalog:check` as the precedent for a
 * change-scoped obligation rather than a universal one nobody honours.
 *
 * `fileParallelism: false` and the generous timeouts for the reasons
 * `vitest.render.config.ts` gives for its own: every file here bundles the project and
 * opens a headless Chrome, and a gate nobody trusts is not a gate.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['packages/*/tests/stress/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    reporters: 'default',
    fileParallelism: false,
  },
});
