import type { CompiledDocument } from '@vox/video';
import { describe, expect, it, vi } from 'vitest';

/**
 * Ticket 11 measured the defect this pins shut: Remotion resolves Chrome Headless Shell from
 * `node_modules/.remotion/` **relative to the working directory**, and only `@remotion/cli` — which
 * lives in `@vox/video` — installs it. The service renders with the repo root as its working
 * directory, finds nothing, and downloads 92 MB from `remotion.media` at every start.
 *
 * That download is a network dependency below `service-host.ts:59`, where the denying adapter
 * cannot see it, and under this ticket's egress restriction it fails and the service never renders.
 * The spike worked around it with a symlink; ticket 07 threads the path instead, so the browser is
 * pinned rather than derived from wherever the process happens to be standing.
 *
 * The Remotion boundary is mocked here on purpose. This test is about which options cross it — a
 * real render would take three minutes and would still not show whether the option was passed.
 */
/** Typed with their one parameter so `mock.calls[0][0]` is the options object, not `never`. */
const selectComposition = vi.fn(async (_options: Record<string, unknown>) => ({
  id: 'compiled-document',
  durationInFrames: 1,
}));
const renderMedia = vi.fn(async (_options: Record<string, unknown>) => undefined);
const bundle = vi.fn(async (_options: Record<string, unknown>) => 'file:///bundle');

vi.mock('@remotion/renderer', () => ({
  selectComposition: (options: Record<string, unknown>) => selectComposition(options),
  renderMedia: (options: Record<string, unknown>) => renderMedia(options),
}));
vi.mock('@remotion/bundler', () => ({
  bundle: (options: Record<string, unknown>) => bundle(options),
}));

const { createRemotionRenderAdapter } = await import('../src/render/remotion');

const DOCUMENT = { audio: { voiceover: 'unused' } } as unknown as CompiledDocument;

const render = async (browserExecutable?: string): Promise<void> => {
  const adapter = createRemotionRenderAdapter({ entryPoint: '/app/entry.ts', browserExecutable });
  // `renderMedia` is mocked away, so no file is produced and `readFile` fails. Everything this
  // test asserts has already happened by then.
  await adapter({ document: DOCUMENT, audio: new Uint8Array([1]) }).catch(() => undefined);
};

describe('pinning the headless browser', () => {
  it('passes the executable to both Remotion calls that launch one', async () => {
    selectComposition.mockClear();
    renderMedia.mockClear();

    await render('/app/node_modules/.remotion/chrome-headless-shell');

    expect(selectComposition.mock.calls[0]?.[0]).toMatchObject({
      browserExecutable: '/app/node_modules/.remotion/chrome-headless-shell',
    });
    expect(renderMedia.mock.calls[0]?.[0]).toMatchObject({
      browserExecutable: '/app/node_modules/.remotion/chrome-headless-shell',
    });
  });

  /**
   * The local Windows service has a working resolution and pins nothing. Passing `undefined`
   * rather than omitting the key would be handing Remotion an explicit "no browser", so the
   * absent case is asserted as absent.
   */
  it('omits the option entirely when nothing is pinned', async () => {
    selectComposition.mockClear();
    renderMedia.mockClear();

    await render(undefined);

    expect(selectComposition.mock.calls[0]?.[0]).not.toHaveProperty('browserExecutable');
    expect(renderMedia.mock.calls[0]?.[0]).not.toHaveProperty('browserExecutable');
  });
});
