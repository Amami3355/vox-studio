import { describe, expect, it } from 'vitest';
import { sanitizeBoundaryText } from '../src/ipc/sanitize';

/**
 * The container's own path shapes, taken from the image and the mount rather than invented:
 * `/app` is the image's `WORKDIR`, and `/var/lib/vox/runs` is where the run store's disk is
 * mounted inside the container.
 */
describe('sanitising a container-shaped path', () => {
  it('redacts an absolute POSIX path out of the image', () => {
    const sanitized = sanitizeBoundaryText(
      "Cannot find module '/app/packages/production/src/commands/service.ts'",
    );

    expect(sanitized).not.toContain('/app/');
    expect(sanitized).toContain('<redacted-path>');
  });

  it('redacts the run store mount out of an ENOENT message', () => {
    const sanitized = sanitizeBoundaryText(
      "ENOENT: no such file or directory, open '/var/lib/vox/runs/run-a1b2/plan.json'",
    );

    expect(sanitized).not.toContain('/var/lib/vox');
    expect(sanitized).not.toContain('run-a1b2');
    expect(sanitized).toContain('<redacted-path>');
  });

  it('redacts a POSIX path inside the installed runtime', () => {
    const sanitized = sanitizeBoundaryText('loaded /usr/local/lib/node_modules/tsx/dist/cli.mjs');

    expect(sanitized).not.toContain('/usr/local');
    expect(sanitized).not.toContain('node_modules');
  });

  it('redacts a file: URI with no drive letter', () => {
    const sanitized = sanitizeBoundaryText('imported from file:///app/packages/video/src/x.js');

    expect(sanitized).not.toContain('/app/');
    expect(sanitized).toContain('<redacted-path>');
  });

  it('leaves a Run-relative artifact path alone, because the envelope publishes them', () => {
    const envelope = JSON.stringify({
      artifacts: [{ kind: 'take_audio', path: 'takes/9f2c/audio.mp3' }],
    });

    expect(sanitizeBoundaryText(envelope)).toBe(envelope);
  });

  it('leaves ordinary prose carrying a slash alone', () => {
    const prose = 'the beat and/or its scene, recorded 09/02/2026, at / in the tree';

    expect(sanitizeBoundaryText(prose)).toBe(prose);
  });
});

/**
 * The two expressions that already worked on both platforms. They are asserted here so that a
 * later widening of `internalPath` cannot quietly take them with it.
 */
describe('the expressions that did not move', () => {
  it('still redacts a relative implementation directory on either separator', () => {
    expect(sanitizeBoundaryText('resolved packages/production/src/x.ts')).toContain(
      '<redacted-internal>',
    );
    expect(sanitizeBoundaryText('resolved packages\\production\\src\\x.ts')).toContain(
      '<redacted-internal>',
    );
  });

  it('still strips a stack frame regardless of separator', () => {
    const sanitized = sanitizeBoundaryText(
      'failed\n    at internalCall (/app/x.js:1:2)\n    at other (C:\\repo\\y.js:3:4)',
    );

    expect(sanitized).not.toMatch(/\bat\s+internalCall/);
    expect(sanitized).not.toMatch(/\bat\s+other/);
  });

  it('still redacts a Windows path, so the local topology is unchanged', () => {
    const sanitized = sanitizeBoundaryText('failed at C:\\Users\\builder\\vox-studio\\x.ts');

    expect(sanitized).not.toContain('C:\\');
    expect(sanitized).toContain('<redacted-path>');
  });
});
