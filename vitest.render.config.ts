import { defineConfig } from 'vitest/config';

/**
 * Rendering tests only: bundle the Remotion entry, drive headless Chrome, hash stills.
 *
 * Separated from the default suite because they need a browser and take minutes. The
 * timeouts are generous for the same reason — a cold bundle on a cold machine is slow,
 * and a flaky timeout here would teach everyone to ignore the one suite that actually
 * looks at pixels.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['packages/*/tests/render/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    reporters: 'default',
  },
});
