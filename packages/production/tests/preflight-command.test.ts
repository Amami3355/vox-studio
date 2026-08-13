import { afterEach, describe, expect, it } from 'vitest';
import { type CommandFixture, createCommandFixture } from './command-fixture';

let fixture: CommandFixture | null = null;
afterEach(async () => fixture?.cleanup());

describe('run preflight', () => {
  it('requires validation, then persists advisory risks without blocking recording', async () => {
    fixture = await createCommandFixture();
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    const early = await fixture.service.preflight({ runRoot: fixture.runRoot });
    expect(early.exitCode).toBe(1);
    expect(early.envelope.error?.code).toBe('PREFLIGHT_REQUIRES_VALIDATION');

    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
    const result = await fixture.service.preflight({ runRoot: fixture.runRoot });
    const report = (
      result.envelope.data as { report: { authority: string; duration: { status: string } } }
    ).report;

    expect(result.exitCode).toBe(0);
    expect(result.envelope.run?.stage).toBe('preflighted');
    expect(report.authority).toBe('advisory');
    expect(report.duration.status).toBe('available');
    expect(result.envelope.next[0]?.command).toBe('run.record');
    expect(fixture.network.request).not.toHaveBeenCalled();
  });

  it('succeeds with duration unavailable when calibration is missing', async () => {
    fixture = await createCommandFixture({ calibration: 'missing' });
    await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
    await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath });
    const result = await fixture.service.preflight({ runRoot: fixture.runRoot });
    const report = (result.envelope.data as { report: { duration: unknown } }).report;

    expect(result.exitCode).toBe(0);
    expect(report.duration).toMatchObject({
      status: 'unavailable',
      reasonCode: 'CALIBRATION_MISSING',
    });
  });
});
