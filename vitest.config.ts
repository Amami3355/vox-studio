import { defineConfig } from 'vitest/config';

/**
 * The default suite is the deterministic core: pure functions, schemas, validation and
 * catalog contracts. It must stay fast enough to run on every save.
 *
 * `packages/*\/tests/render/` is excluded because those tests bundle the project and
 * drive headless Chrome — minutes, not milliseconds, and a browser dependency. Run them
 * with `pnpm test:render` (and in CI) via `vitest.render.config.ts`.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/*/tests/render/**'],
    reporters: 'default',
  },
});
