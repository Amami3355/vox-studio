import { createHmac } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/canonical-json';
import { AutonomousImageAuthority } from '../src/image/autonomous-authority';

describe('operator autonomous image authority', () => {
  it('adds a frozen recovery approval without resetting original grants and binds each retry once', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vox-recovery-'));
    try {
      const request = 'a'.repeat(64);
      await mkdir(join(directory, 'envelopes'));
      await mkdir(join(directory, 'recovery'));
      const envelope = {
        schemaVersion: 1,
        requestSha256: request,
        maxImages: 1,
        expiresAt: '2026-10-01T00:00:00Z',
      };
      await writeFile(join(directory, 'envelopes', `${request}.json`), JSON.stringify(envelope));
      const build = () =>
        new AutonomousImageAuthority(directory, 'test-key', () => new Date('2026-09-08T12:00:00Z'));
      await build().bind(request, 'run');
      const original = await build().authorize(request, 'run', 'b'.repeat(64));
      await expect(build().authorize(request, 'run', 'b'.repeat(64), 'failed-job')).rejects.toThrow(
        'explicit recovery',
      );
      const approval = {
        schemaVersion: 1,
        requestSha256: request,
        runId: 'run',
        maxImageAttempts: 8,
        minimumIntervalSeconds: 60,
        retryHttpStatuses: [429],
        authorizedAt: '2026-09-08T11:59:00Z',
        expiresAt: envelope.expiresAt,
      };
      const path = join(directory, 'recovery', `${request}.json`);
      await writeFile(path, JSON.stringify(approval));
      const firstRetry = await build().authorize(request, 'run', 'b'.repeat(64), 'failed-job');
      expect(firstRetry?.grantId).not.toBe(original?.grantId);
      expect(await build().authorize(request, 'run', 'b'.repeat(64), 'failed-job')).toEqual(
        firstRetry,
      );
      for (let i = 0; i < 6; i++)
        await build().authorize(request, 'run', 'b'.repeat(64), `retry-${i}`);
      await expect(build().authorize(request, 'run', 'b'.repeat(64), 'ninth')).rejects.toThrow(
        'exhausted',
      );
      const saved = JSON.parse(await readFile(join(directory, 'state', `${request}.json`), 'utf8'));
      expect(saved.envelope).toEqual(envelope);
      expect(saved.grants).toEqual([original]);
      expect(saved.retryGrants).toHaveLength(7);
      await writeFile(path, JSON.stringify({ ...approval, minimumIntervalSeconds: 120 }));
      await expect(build().recoveryPolicy(request, 'run')).rejects.toThrow('changed after use');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('binds one exact request to one Run and retains signed allowances across restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vox-authority-'));
    try {
      const request = 'a'.repeat(64);
      await mkdir(join(directory, 'envelopes'));
      await writeFile(
        join(directory, 'envelopes', `${request}.json`),
        JSON.stringify({
          schemaVersion: 1,
          requestSha256: request,
          maxImages: 2,
          expiresAt: '2026-10-01T00:00:00Z',
        }),
      );
      const build = () =>
        new AutonomousImageAuthority(
          directory,
          'synthetic-key',
          () => new Date('2026-09-08T00:00:00Z'),
        );
      await expect(
        build().authorize('b'.repeat(64), 'run', 'c'.repeat(64)),
      ).resolves.toBeUndefined();
      await build().bind(request, 'run');
      const first = await build().authorize(request, 'run', 'c'.repeat(64));
      expect(first).toBeDefined();
      const { grant, ...unsigned } = first!;
      expect(grant).toBe(
        createHmac('sha256', 'synthetic-key').update(canonicalJson(unsigned)).digest('hex'),
      );
      expect(await build().authorize(request, 'run', 'c'.repeat(64))).toEqual(first);
      await expect(build().bind(request, 'another-run')).rejects.toThrow('already bound');
      await build().authorize(request, 'run', 'd'.repeat(64));
      await expect(build().authorize(request, 'run', 'e'.repeat(64))).rejects.toThrow('exhausted');
      expect(
        JSON.parse(await readFile(join(directory, 'state', `${request}.json`), 'utf8')).grants,
      ).toHaveLength(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
