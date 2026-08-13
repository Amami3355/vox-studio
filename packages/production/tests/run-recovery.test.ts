import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CrashPoint, RunCheckpoint } from '../src/run-store/run-store';
import { type RunFixture, createRunFixture } from './run-fixture';

let fixture: RunFixture | null = null;
afterEach(async () => fixture?.cleanup());

const mutation = {
  expectedRevision: 1,
  command: 'run.validate' as const,
  outcome: 'succeeded' as const,
  stage: 'validated' as const,
  artifacts: [
    {
      kind: 'validation_report',
      path: 'artifacts/validation/recovery/report.json',
      bytes: '{"ok":true}',
    },
  ],
  data: { report: { ok: true, errorCount: 0, warningCount: 0 } },
};

describe.each<CrashPoint>(['after_publication', 'after_ledger', 'after_checkpoint'])(
  'Run recovery at %s',
  (point) => {
    it('converges to one committed revision without duplicating receipts', async () => {
      fixture = await createRunFixture();
      fixture.setCrashPoint(point);
      await expect(fixture.store.commit(mutation)).rejects.toThrow(`INJECTED_CRASH:${point}`);

      let checkpoint: RunCheckpoint;
      if (point === 'after_publication') {
        expect((await fixture.store.inspect()).revision).toBe(1);
        checkpoint = await fixture.store.commit(mutation);
      } else {
        expect((await fixture.store.inspect()).revision).toBe(2);
        checkpoint = await fixture.store.recoverCheckpoint();
      }

      expect(checkpoint.revision).toBe(2);
      expect((await fixture.store.inspect()).revision).toBe(2);
      expect((await readdir(join(fixture.runRoot, 'receipts'))).sort()).toEqual([
        '00000000000000000001-run-init.json',
        '00000000000000000002-run-validate.json',
      ]);
    });
  },
);
