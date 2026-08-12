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
    /**
     * One file at a time.
     *
     * Every file here bundles the project and opens its own headless Chrome, so running
     * them in parallel threads means three bundlers and three browsers competing for the
     * machine. That is the whole of this suite's long-standing flakiness: it fails with
     * `net::ERR_SOCKET_NOT_CONNECTED` on a *different* test each run, and every failing
     * file passes when run alone. A gate nobody trusts is not a gate, and the habit of
     * re-running until green is exactly how a real failure gets waved through.
     *
     * The cost is wall-clock, which this suite already spends in minutes. Parallelism
     * inside a file is untouched — the stills of one case still render together on the
     * one browser that file opened.
     */
    fileParallelism: false,
  },
});
