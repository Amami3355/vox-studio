import { defineConfig } from 'vitest/config';

/**
 * The default suite is the deterministic core: pure functions, schemas, validation and
 * catalog contracts. It must stay fast enough to run on every save.
 *
 * `packages/*\/tests/render/` and `packages/*\/tests/stress/` are excluded because those
 * tests bundle the project and drive headless Chrome — minutes, not milliseconds, and a
 * browser dependency. Run them with `pnpm test:render` and `pnpm test:stress` (and in CI)
 * via `vitest.render.config.ts` and `vitest.stress.config.ts`.
 *
 * The stress suite's *generator* is not excluded: `packages/video/tests/stress-cases.test.ts`
 * sits here on purpose, because deriving a case from a published schema is a pure function
 * and only its consequence needs a browser.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/*/tests/render/**',
      'packages/*/tests/stress/**',
    ],
    reporters: 'default',
  },
});
