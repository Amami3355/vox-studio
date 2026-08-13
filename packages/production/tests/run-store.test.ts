import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/canonical-json';
import {
  beatShapeIdentity,
  recordingInputIdentity,
  takeIdOf,
  takeIdentity,
} from '../src/run-store/identities';
import { RUN_PATHS } from '../src/run-store/paths';
import { EMPTY_RUN_BINDINGS, RunStoreError } from '../src/run-store/run-store';
import { REQUEST, type RunFixture, createRunFixture } from './run-fixture';

let fixture: RunFixture | null = null;
afterEach(async () => fixture?.cleanup());

describe('authenticated Run store', () => {
  it('initializes canonical public state and a private monotonic ledger', async () => {
    fixture = await createRunFixture();
    const checkpoint = await fixture.store.inspect();
    const checkpointBytes = await readFile(join(fixture.runRoot, RUN_PATHS.checkpoint), 'utf8');
    const requestBytes = await readFile(join(fixture.runRoot, RUN_PATHS.request), 'utf8');

    expect(checkpoint.revision).toBe(1);
    expect(checkpoint.stage).toBe('initialized');
    expect(checkpoint.quota).toEqual({
      maxNewTakes: 2,
      newTakesUsed: 0,
      replacementGrantIdsUsed: [],
    });
    expect(checkpointBytes).toBe(canonicalJson(JSON.parse(checkpointBytes)));
    expect(requestBytes).toBe(canonicalJson(REQUEST));
    expect(await readdir(fixture.ledgerRoot)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.ledger\.json$/), 'tmp']),
    );
  });

  it('reuses identical immutable bytes and refuses an occupied path with different bytes', async () => {
    fixture = await createRunFixture();
    const path = 'artifacts/validation/a/report.json';
    const first = await fixture.store.publishImmutable({
      kind: 'validation_report',
      path,
      bytes: '{"ok":true}',
    });
    const reused = await fixture.store.publishImmutable({
      kind: 'validation_report',
      path,
      bytes: '{"ok":true}',
    });

    expect(reused).toEqual(first);
    await expect(
      fixture.store.publishImmutable({ kind: 'validation_report', path, bytes: '{"ok":false}' }),
    ).rejects.toMatchObject({ code: 'IMMUTABLE_ARTIFACT_MISMATCH' });
  });

  it('chains receipts and advances quota and bindings in one revision CAS', async () => {
    fixture = await createRunFixture();
    const checkpoint = await fixture.store.commit({
      expectedRevision: 1,
      command: 'run.validate',
      outcome: 'succeeded',
      stage: 'validated',
      artifacts: [
        {
          kind: 'validation_report',
          path: 'artifacts/validation/input/report.json',
          bytes: '{"ok":true}',
        },
      ],
      bindings: (artifacts) => {
        const report = artifacts[0];
        if (!report) throw new Error('Expected validation report artifact.');
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
      quota: { newTakesDelta: 1, consumeGrantId: 'grant-1' },
    });

    expect(checkpoint.revision).toBe(2);
    expect(checkpoint.quota).toEqual({
      maxNewTakes: 2,
      newTakesUsed: 1,
      replacementGrantIdsUsed: ['grant-1'],
    });
    expect((await readdir(join(fixture.runRoot, 'receipts'))).sort()).toEqual([
      '00000000000000000001-run-init.json',
      '00000000000000000002-run-validate.json',
    ]);
    await expect(
      fixture.store.commit({
        expectedRevision: 1,
        command: 'run.preflight',
        outcome: 'succeeded',
      }),
    ).rejects.toMatchObject({ code: 'RUN_REVISION_CONFLICT' });
  });

  it('derives recording, Take and Beat-shape identities from their exact domains', async () => {
    const plan = {
      beats: [
        { id: 'b1', text: 'One.' },
        { id: 'b2', text: 'Two.' },
      ],
      sections: [],
    };
    const sameWordsNewIds = {
      ...plan,
      beats: plan.beats.map((beat, index) => ({ ...beat, id: `x${index}` })),
    };

    expect(recordingInputIdentity(plan, REQUEST)).toBe(
      recordingInputIdentity(sameWordsNewIds, REQUEST),
    );
    expect(beatShapeIdentity(plan)).not.toBe(beatShapeIdentity(sameWordsNewIds));
    const take = takeIdentity('a'.repeat(64), 'b'.repeat(64));
    expect(takeIdOf(take)).toBe(take.slice(0, 12));
  });

  it('updates quota and grant consumption monotonically', async () => {
    fixture = await createRunFixture();
    await fixture.store.commit({
      expectedRevision: 1,
      command: 'run.record',
      outcome: 'succeeded',
      stage: 'recorded',
      quota: { newTakesDelta: 1, consumeGrantId: 'grant-a' },
      data: { disposition: 'recorded', takeId: 'abcdef123456', newTakesUsed: 1, maxNewTakes: 2 },
    });
    await expect(
      fixture.store.commit({
        expectedRevision: 2,
        command: 'run.record',
        outcome: 'succeeded',
        quota: { newTakesDelta: 1, consumeGrantId: 'grant-a' },
      }),
    ).rejects.toBeInstanceOf(RunStoreError);
    await fixture.store.commit({
      expectedRevision: 2,
      command: 'run.record',
      outcome: 'succeeded',
      quota: { newTakesDelta: 1, consumeGrantId: 'grant-b' },
      data: {
        disposition: 'replacement_recorded',
        takeId: '123456abcdef',
        newTakesUsed: 2,
        maxNewTakes: 2,
      },
    });
    await expect(
      fixture.store.commit({
        expectedRevision: 3,
        command: 'run.record',
        outcome: 'succeeded',
        quota: { newTakesDelta: 1 },
      }),
    ).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
  });
});
