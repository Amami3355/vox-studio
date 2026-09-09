import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchProductionArgv } from '../src/commands/dispatch';
import { ProductionPayloadSurface } from '../src/commands/payload-surface';
import type { ResultEnvelope } from '../src/contracts/schemas';
import {
  type CommandFixture,
  VALID_PLAN,
  createCommandFixture,
  recordedResponseFor,
} from './command-fixture';
import { REQUEST } from './run-fixture';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

let fixture: CommandFixture | null = null;
afterEach(async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  vi.mocked(randomUUID).mockImplementation(actual.randomUUID);
  await fixture?.cleanup();
});

/** The Run directory is pinned so a test can name the file a payload landed in. */
const RUN_DIRECTORY = 'run-surface';

const DECISION = {
  protocolVersion: 1,
  kind: 'unservable_brief',
  summary: 'The current catalogue cannot serve the requested route map.',
  unmetNeeds: [{ need: 'A geographic route', catalogGap: 'No map capability is published.' }],
} as const;

const surfaceFor = (open: CommandFixture): ProductionPayloadSurface =>
  new ProductionPayloadSurface({
    service: open.service,
    runsRoot: join(open.root, 'public'),
    createRunDirectory: () => RUN_DIRECTORY,
  });

describe('the payload surface', () => {
  it('creates a Run from a request object, with no path from the caller', async () => {
    fixture = await createCommandFixture();
    const surface = surfaceFor(fixture);

    const result = await surface.execute({ command: 'run.init', payload: REQUEST });

    expect(result.exitCode).toBe(0);
    expect(result.envelope.outcome).toBe('succeeded');
    expect(result.envelope.run).toMatchObject({ id: 'run-command-test', stage: 'initialized' });
  });
});

describe('resolving a Run id', () => {
  it('names a Run by id alone, on a surface that never saw it created', async () => {
    fixture = await createCommandFixture();
    await surfaceFor(fixture).execute({ command: 'run.init', payload: REQUEST });

    const restarted = surfaceFor(fixture);
    const result = await restarted.execute({ command: 'run.status', runId: 'run-command-test' });

    expect(result.exitCode).toBe(0);
    expect(result.envelope.run).toMatchObject({ id: 'run-command-test', stage: 'initialized' });
  });

  it('refuses a Run id no directory carries, without naming a path', async () => {
    fixture = await createCommandFixture();
    const surface = surfaceFor(fixture);

    const result = await surface.execute({ command: 'run.status', runId: 'run-absent' });

    expect(result.exitCode).toBe(1);
    expect(result.envelope.outcome).toBe('failed');
    expect(result.envelope.error?.code).toBe('UNKNOWN_RUN');
    expect(result.envelope.error?.message).not.toContain(fixture.root);
  });
});

describe('materialising a payload', () => {
  it('returns a malformed-invocation envelope when image JSON cannot be parsed', async () => {
    fixture = await createCommandFixture();
    await writeFile(join(fixture.root, 'broken-image-request.json'), '{', 'utf8');

    const result = await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'run',
      'image-start',
      '--run',
      'public/run',
      '--request',
      'broken-image-request.json',
    ]);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: 'run.image.start',
      outcome: 'failed',
      error: { code: 'INVALID_INVOCATION' },
    });
  });

  it('writes a plan to plan.json inside the Run, under the name the crew writes today', async () => {
    fixture = await createCommandFixture();
    const surface = surfaceFor(fixture);
    const init = await surface.execute({ command: 'run.init', payload: REQUEST });
    const runId = init.envelope.run?.id as string;

    const result = await surface.execute({
      command: 'run.validate',
      runId,
      payload: VALID_PLAN as unknown as Record<string, unknown>,
    });

    expect(result.exitCode).toBe(0);
    expect(result.envelope.run?.stage).toBe('validated');
    const staged = join(fixture.root, 'public', 'run-surface', 'plan.json');
    expect(JSON.parse(await readFile(staged, 'utf8'))).toEqual(VALID_PLAN);
  });

  it('writes a decline decision to decision.json', async () => {
    fixture = await createCommandFixture();
    const surface = surfaceFor(fixture);
    const init = await surface.execute({ command: 'run.init', payload: REQUEST });
    const runId = init.envelope.run?.id as string;

    const result = await surface.execute({
      command: 'run.decline',
      runId,
      payload: DECISION as unknown as Record<string, unknown>,
    });

    expect(result.envelope.outcome).toBe('declined');
    const staged = join(fixture.root, 'public', 'run-surface', 'decision.json');
    expect(JSON.parse(await readFile(staged, 'utf8'))).toEqual(DECISION);
  });

  it('writes a replacement authorisation to replacement-authorisation.json, the third name', async () => {
    fixture = await createCommandFixture(stubs());
    const surface = surfaceFor(fixture);
    const runId = await toPreflight(surface);

    await surface.execute({
      command: 'run.record',
      runId,
      payload: AUTHORISATION as unknown as Record<string, unknown>,
    });

    const staged = join(fixture.root, 'public', RUN_DIRECTORY, 'replacement-authorisation.json');
    expect(JSON.parse(await readFile(staged, 'utf8'))).toEqual(AUTHORISATION);
  });
});

const VALID_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
]);

const stubs = () => ({
  synthesizer: vi.fn(async () => recordedResponseFor(VALID_PLAN)),
  renderer: vi.fn(async () => ({
    bytes: VALID_MP4,
    container: 'mp4' as const,
    videoCodec: 'h264' as const,
    audioCodec: 'aac' as const,
  })),
  now: () => new Date('2026-08-13T12:00:00.000Z'),
});

/** The bytes the surface writes, so the argv side stages a byte-identical file. */
const staged = (payload: unknown): string => `${JSON.stringify(payload, null, 2)}\n`;

/**
 * `run.record` is the only command whose payload is optional, so it is the only staged filename
 * that a chain driven without one never writes. It is asserted here on its own.
 */
const AUTHORISATION = {
  protocolVersion: 1,
  kind: 'replacement_grant',
  reason: 'The previous dispatch left no complete durable response.',
} as const;

const toPreflight = async (surface: ProductionPayloadSurface): Promise<string> => {
  const init = await surface.execute({
    command: 'run.init',
    payload: REQUEST as unknown as Record<string, unknown>,
  });
  const runId = init.envelope.run?.id as string;
  await surface.execute({
    command: 'run.validate',
    runId,
    payload: VALID_PLAN as unknown as Record<string, unknown>,
  });
  await surface.execute({ command: 'run.preflight', runId });
  return runId;
};

const CHAIN = [
  'run.init',
  'run.validate',
  'run.preflight',
  'run.record',
  'run.compile',
  'run.render',
  'run.status',
] as const;

const throughSurface = async (open: CommandFixture): Promise<ResultEnvelope[]> => {
  const surface = surfaceFor(open);
  const envelopes: ResultEnvelope[] = [];
  let runId = '';
  for (const command of CHAIN) {
    const payload =
      command === 'run.init'
        ? (REQUEST as unknown as Record<string, unknown>)
        : command === 'run.validate'
          ? (VALID_PLAN as unknown as Record<string, unknown>)
          : null;
    const result = await surface.execute({ command, runId: runId || null, payload });
    if (command === 'run.init') runId = result.envelope.run?.id as string;
    envelopes.push(result.envelope);
  }
  return envelopes;
};

const throughArgv = async (open: CommandFixture): Promise<ResultEnvelope[]> => {
  const runArgument = `public/${RUN_DIRECTORY}`;
  const requestArgument = 'request-argv.json';
  await writeFile(join(open.root, requestArgument), staged(REQUEST), 'utf8');
  const envelopes: ResultEnvelope[] = [];
  const run = async (argv: string[]): Promise<void> => {
    const result = await dispatchProductionArgv(open.service, open.root, argv);
    envelopes.push(JSON.parse(result.stdout) as ResultEnvelope);
  };
  await run(['production', 'run', 'init', '--request', requestArgument, '--out', runArgument]);
  await writeFile(
    join(open.root, 'public', RUN_DIRECTORY, 'plan.json'),
    staged(VALID_PLAN),
    'utf8',
  );
  await run([
    'production',
    'run',
    'validate',
    '--run',
    runArgument,
    '--plan',
    `${runArgument}/plan.json`,
  ]);
  for (const verb of ['preflight', 'record', 'compile', 'render', 'status']) {
    await run(['production', 'run', verb, '--run', runArgument]);
  }
  return envelopes;
};

describe('the surface is a relocation, not a reimplementation', () => {
  it('produces the envelope the argv path produces, field by field, for every command', async () => {
    // Both independent Runs must receive the same nondeterministic input, just like the
    // clock in stubs(), so the complete recording receipt remains part of the comparison.
    vi.mocked(randomUUID).mockReturnValue('11111111-1111-4111-8111-111111111111');
    fixture = await createCommandFixture(stubs());
    const viaSurface = await throughSurface(fixture);
    await fixture.cleanup();

    fixture = await createCommandFixture(stubs());
    const viaArgv = await throughArgv(fixture);

    expect(viaSurface.map((envelope) => envelope.command)).toEqual([...CHAIN]);
    expect(viaSurface).toEqual(viaArgv);
    // Two full Runs through record, compile and render. It is a long test by construction and
    // it timed out at the default 5s under the whole suite's load, which is not a verdict.
  }, 60_000);

  it('produces the argv envelope for decline, which is terminal and needs its own Run', async () => {
    fixture = await createCommandFixture();
    const surface = surfaceFor(fixture);
    const init = await surface.execute({
      command: 'run.init',
      payload: REQUEST as unknown as Record<string, unknown>,
    });
    const viaSurface = await surface.execute({
      command: 'run.decline',
      runId: init.envelope.run?.id,
      payload: DECISION as unknown as Record<string, unknown>,
    });
    await fixture.cleanup();

    fixture = await createCommandFixture();
    const runArgument = `public/${RUN_DIRECTORY}`;
    await writeFile(join(fixture.root, 'request-argv.json'), staged(REQUEST), 'utf8');
    await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'run',
      'init',
      '--request',
      'request-argv.json',
      '--out',
      runArgument,
    ]);
    await writeFile(
      join(fixture.root, 'public', RUN_DIRECTORY, 'decision.json'),
      staged(DECISION),
      'utf8',
    );
    const argv = await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'run',
      'decline',
      '--run',
      runArgument,
      '--decision',
      `${runArgument}/decision.json`,
    ]);

    expect(viaSurface.envelope).toEqual(JSON.parse(argv.stdout));
  });

  it('produces the argv envelope for a record carrying a replacement authorisation', async () => {
    fixture = await createCommandFixture(stubs());
    const viaSurface = await (async () => {
      const surface = surfaceFor(fixture as CommandFixture);
      const runId = await toPreflight(surface);
      return surface.execute({
        command: 'run.record',
        runId,
        payload: AUTHORISATION as unknown as Record<string, unknown>,
      });
    })();
    await fixture.cleanup();

    fixture = await createCommandFixture(stubs());
    const runArgument = `public/${RUN_DIRECTORY}`;
    await writeFile(join(fixture.root, 'request-argv.json'), staged(REQUEST), 'utf8');
    await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'run',
      'init',
      '--request',
      'request-argv.json',
      '--out',
      runArgument,
    ]);
    await writeFile(
      join(fixture.root, 'public', RUN_DIRECTORY, 'plan.json'),
      staged(VALID_PLAN),
      'utf8',
    );
    await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'run',
      'validate',
      '--run',
      runArgument,
      '--plan',
      `${runArgument}/plan.json`,
    ]);
    await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'run',
      'preflight',
      '--run',
      runArgument,
    ]);
    await writeFile(
      join(fixture.root, 'public', RUN_DIRECTORY, 'replacement-authorisation.json'),
      staged(AUTHORISATION),
      'utf8',
    );
    const argv = await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'run',
      'record',
      '--run',
      runArgument,
      '--replacement-authorisation',
      `${runArgument}/replacement-authorisation.json`,
    ]);

    expect(viaSurface.envelope).toEqual(JSON.parse(argv.stdout));
  }, 60_000);

  it('serves the two contract commands, which name no Run and take a payload only to name a category', async () => {
    fixture = await createCommandFixture();
    const surface = surfaceFor(fixture);

    const index = await surface.execute({ command: 'contract.index' });
    const show = await surface.execute({
      command: 'contract.show',
      payload: { category: 'protocol' },
    });

    const argvIndex = await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'contract',
      'index',
    ]);
    const argvShow = await dispatchProductionArgv(fixture.service, fixture.root, [
      'production',
      'contract',
      'show',
      'protocol',
    ]);
    expect(index.envelope).toEqual(JSON.parse(argvIndex.stdout));
    expect(show.envelope).toEqual(JSON.parse(argvShow.stdout));
  });
});

describe('artifact retrieval', () => {
  const validated = async (open: CommandFixture) => {
    const surface = surfaceFor(open);
    const init = await surface.execute({
      command: 'run.init',
      payload: REQUEST as unknown as Record<string, unknown>,
    });
    const runId = init.envelope.run?.id as string;
    const result = await surface.execute({
      command: 'run.validate',
      runId,
      payload: VALID_PLAN as unknown as Record<string, unknown>,
    });
    const descriptor = result.envelope.artifacts.find((each) => each.kind === 'plan_snapshot');
    if (!descriptor) throw new Error('validate published no plan snapshot.');
    return { surface, runId, descriptor };
  };

  it('returns the bytes and a digest it computed for itself', async () => {
    fixture = await createCommandFixture();
    const { surface, runId, descriptor } = await validated(fixture);

    const artifact = await surface.fetchArtifact(runId, descriptor);

    expect(artifact.kind).toBe('plan_snapshot');
    expect(artifact.sha256).toBe(descriptor.sha256);
    expect(createHash('sha256').update(artifact.bytes).digest('hex')).toBe(descriptor.sha256);
    expect(JSON.parse(Buffer.from(artifact.bytes).toString('utf8'))).toEqual(VALID_PLAN);
  });

  it('reports a corrupted artifact, which is what proves the digest is recomputed', async () => {
    fixture = await createCommandFixture();
    const { surface, runId, descriptor } = await validated(fixture);
    const onDisk = join(fixture.root, 'public', RUN_DIRECTORY, descriptor.path);
    await chmod(onDisk, 0o600);
    await writeFile(onDisk, '{"beats":[]}', 'utf8');

    await expect(surface.fetchArtifact(runId, descriptor)).rejects.toMatchObject({
      code: 'ARTIFACT_CORRUPTED',
    });
  });

  it('refuses a descriptor that escapes its Run', async () => {
    fixture = await createCommandFixture();
    const { surface, runId, descriptor } = await validated(fixture);

    await expect(
      surface.fetchArtifact(runId, { ...descriptor, path: '../../secrets.json' }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_OUTSIDE_RUN' });
  });

  it('refuses a descriptor that escapes through a symlink, not only through ..', async () => {
    fixture = await createCommandFixture();
    const { surface, runId } = await validated(fixture);
    // A lexical containment check passes this: every segment is an ordinary name and nothing
    // climbs. Only resolving the link says the bytes are outside the Run. A junction is used
    // because Windows grants it without the privilege a file symlink needs.
    const outside = join(fixture.root, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'secrets.json'), '{"provider":"key"}', 'utf8');
    await symlink(outside, join(fixture.root, 'public', RUN_DIRECTORY, 'escape'), 'junction');

    await expect(
      surface.fetchArtifact(runId, {
        kind: 'plan_snapshot',
        path: 'escape/secrets.json',
        sha256: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_OUTSIDE_RUN' });
  });

  it('refuses a descriptor another Run published, which this Run does not carry', async () => {
    fixture = await createCommandFixture();
    const { surface, runId } = await validated(fixture);

    await expect(
      surface.fetchArtifact(runId, {
        kind: 'plan_snapshot',
        path: 'inputs/plans/'.concat('0'.repeat(64), '.json'),
        sha256: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_MISSING' });
  });

  it('refuses a descriptor for a Run that does not exist', async () => {
    fixture = await createCommandFixture();
    const { surface, descriptor } = await validated(fixture);

    await expect(surface.fetchArtifact('run-absent', descriptor)).rejects.toMatchObject({
      code: 'UNKNOWN_RUN',
    });
  });
});

describe('the payload with nowhere durable to live', () => {
  const strays = async (open: CommandFixture): Promise<string[]> =>
    (await readdir(join(open.root, 'public'))).filter((name) => name.startsWith('.inbox-'));

  it('takes the request away again once the Run exists', async () => {
    fixture = await createCommandFixture();

    await surfaceFor(fixture).execute({
      command: 'run.init',
      payload: REQUEST as unknown as Record<string, unknown>,
    });

    expect(await strays(fixture)).toEqual([]);
  });

  it('takes it away when init fails, because a runs root with a stray file evidences nothing', async () => {
    fixture = await createCommandFixture();

    const result = await surfaceFor(fixture).execute({
      command: 'run.init',
      payload: { protocolVersion: 1, brief: 'not a brief object' },
    });

    expect(result.envelope.outcome).toBe('failed');
    expect(await strays(fixture)).toEqual([]);
  });
});
