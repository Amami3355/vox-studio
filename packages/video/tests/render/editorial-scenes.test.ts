import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compositionIdFor } from '../../src/runtime/compositionIds';
import { hashStill, renderHarness } from './harness';

const harness = renderHarness();
const out = resolve('.scratch/hackathon-launch/runtime/editorial-capabilities');
// An asymmetric schematic makes a crop observable; this is test artwork, not generated media.
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#142a24"/><ellipse cx="800" cy="420" rx="650" ry="220" fill="#538754"/><path d="M180 420H1420M800 210V640" stroke="#d7e8b0" stroke-width="18"/><g fill="#edba70"><ellipse cx="450" cy="590" rx="70" ry="22"/><ellipse cx="800" cy="640" rx="70" ry="22"/><ellipse cx="1150" cy="590" rx="70" ry="22"/></g></svg>';
const still = async (capabilityId: string, exampleId: string, frame: number, name: string) => {
  const bytes = await harness.still(
    compositionIdFor(capabilityId, exampleId),
    {
      capabilityId,
      exampleId,
      layout: null,
      motionProfile: 'editorialStatic',
      ...(capabilityId === 'image_detail'
        ? {
            assets: {
              assetRequirement: {
                status: 'ready',
                uri: `data:image/svg+xml,${encodeURIComponent(svg)}`,
              },
            },
          }
        : {}),
    },
    frame,
  );
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, `${name}.png`), bytes);
  return hashStill(bytes);
};

describe('editorial capabilities in the actual renderer', () => {
  it('changes the image on focus and restores the unobstructed whole image', async () => {
    const whole = await still('image_detail', 'example-image-detail-explain', 30, 'image-whole');
    const focused = await still('image_detail', 'example-image-detail-explain', 80, 'image-detail');
    const restored = await still(
      'image_detail',
      'example-image-detail-explain',
      140,
      'image-restored',
    );
    expect(focused).not.toBe(whole);
    expect(restored).toBe(whole);
  });
  it('renders different stages and connecting-path positions in one scene', async () => {
    const first = await still(
      'process_steps',
      'example-process-steps-driven',
      35,
      'process-intake',
    );
    const next = await still('process_steps', 'example-process-steps-driven', 95, 'process-change');
    const last = await still(
      'process_steps',
      'example-process-steps-driven',
      155,
      'process-output',
    );
    expect(new Set([first, next, last]).size).toBe(3);
  });
});
