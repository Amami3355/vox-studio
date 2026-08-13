import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256Bytes } from '../src/canonical-json';
import { RUN_PATHS } from '../src/run-store/paths';
import { RunStore } from '../src/run-store/run-store';
import { EMPTY_RUN_BINDINGS } from '../src/run-store/run-store';
import { type RunFixture, createRunFixture } from './run-fixture';

let fixture: RunFixture | null = null;
afterEach(async () => fixture?.cleanup());

describe('Run-store security boundary', () => {
  it('detects a rollback to an earlier valid checkpoint', async () => {
    fixture = await createRunFixture();
    const revisionOne = await readFile(join(fixture.runRoot, RUN_PATHS.checkpoint));
    await fixture.store.commit({
      expectedRevision: 1,
      command: 'run.validate',
      outcome: 'succeeded',
      stage: 'validated',
      data: { report: { ok: true, errorCount: 0, warningCount: 0 } },
    });
    await writeFile(join(fixture.runRoot, RUN_PATHS.checkpoint), revisionOne);

    await expect(fixture.store.inspect()).rejects.toMatchObject({ code: 'RUN_ROLLBACK_DETECTED' });
  });

  it('detects checkpoint forgery and receipt corruption', async () => {
    fixture = await createRunFixture();
    const checkpointPath = join(fixture.runRoot, RUN_PATHS.checkpoint);
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8')) as { stage: string };
    checkpoint.stage = 'rendered';
    await writeFile(checkpointPath, JSON.stringify(checkpoint));
    await expect(fixture.store.inspect()).rejects.toMatchObject({
      code: 'RUN_ATTESTATION_INVALID',
    });

    await fixture.cleanup();
    fixture = await createRunFixture();
    const receipt = join(fixture.runRoot, 'receipts/00000000000000000001-run-init.json');
    await writeFile(receipt, '{"forged":true}');
    await expect(fixture.store.inspect()).rejects.toMatchObject({
      code: 'RUN_RECEIPT_CHAIN_INVALID',
    });
  });

  it('reverifies every artifact descriptor in active bindings', async () => {
    fixture = await createRunFixture();
    await fixture.store.commit({
      expectedRevision: 1,
      command: 'run.validate',
      outcome: 'succeeded',
      stage: 'validated',
      artifacts: [
        {
          kind: 'validation_report',
          path: 'artifacts/validation/security/report.json',
          bytes: '{"ok":true}',
        },
      ],
      bindings: (artifacts) => {
        const report = artifacts[0];
        if (!report) throw new Error('Expected validation report.');
        return {
          ...structuredClone(EMPTY_RUN_BINDINGS),
          validation: {
            validationInputSha256: 'a'.repeat(64),
            planSha256: 'b'.repeat(64),
            report,
            freshness: { state: 'fresh', reasons: [] },
          },
        };
      },
      data: { report: { ok: true, errorCount: 0, warningCount: 0 } },
    });
    await writeFile(
      join(fixture.runRoot, 'artifacts/validation/security/report.json'),
      '{"ok":false}',
    );

    await expect(fixture.store.inspect()).rejects.toMatchObject({ code: 'RUN_ARTIFACT_CHANGED' });
  });

  it('rejects traversal and link/reparse escapes before publication', async () => {
    fixture = await createRunFixture();
    await expect(
      fixture.store.publishImmutable({ kind: 'escape', path: '../outside.json', bytes: '{}' }),
    ).rejects.toMatchObject({ code: 'RUN_PATH_ESCAPE' });

    const artifacts = join(fixture.runRoot, 'artifacts');
    const outside = join(fixture.root, 'outside');
    await mkdir(artifacts);
    await mkdir(outside);
    try {
      await symlink(
        outside,
        join(artifacts, 'escape'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    await expect(
      fixture.store.publishImmutable({
        kind: 'escape',
        path: 'artifacts/escape/file.json',
        bytes: '{}',
      }),
    ).rejects.toMatchObject({ code: 'RUN_PATH_ESCAPE' });
  });

  it('returns RUN_BUSY without mutating while a live private lease exists', async () => {
    fixture = await createRunFixture();
    const lease = join(fixture.ledgerRoot, `${sha256Bytes(fixture.options.runId)}.lease`);
    await writeFile(
      lease,
      JSON.stringify({
        token: 'other-process',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    const contender = new RunStore({ ...fixture.options, lockTimeoutMs: 20, crashAt: undefined });

    await expect(
      contender.commit({
        expectedRevision: 1,
        command: 'run.validate',
        outcome: 'succeeded',
      }),
    ).rejects.toMatchObject({ code: 'RUN_BUSY' });
    expect((await fixture.store.inspect()).revision).toBe(1);
  });
});
