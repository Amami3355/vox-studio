import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type AssetRequirement, type VideoPlan, assetRequirementId } from '@vox/video';
import { afterEach, expect, it, vi } from 'vitest';
import { imageJobSchema } from '../src/contracts/schemas';
import type { RenderAdapter } from '../src/render/remotion';
import { imageGenerationRequestIdentity } from '../src/run-store/identities';
import {
  type CommandFixture,
  VALID_PLAN,
  createCommandFixture,
  seedVerifiedTake,
} from './command-fixture';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
let fixture: CommandFixture | undefined;
afterEach(async () => fixture?.cleanup());

it('overlaps two provider calls, commits simultaneous results and accepts both without lost updates', async () => {
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const generate = vi.fn(async () => {
    await gate;
    return { bytes: PNG, mediaType: 'image/png' as const };
  });
  const renderer = vi.fn<RenderAdapter>(async () => ({
    bytes: Buffer.from('0000ftyp0000'),
    container: 'mp4' as const,
    videoCodec: 'h264' as const,
    audioCodec: 'aac' as const,
  }));
  fixture = await createCommandFixture({
    imageGenerator: { mode: 'recorded', generate },
    renderer,
  });
  const plan: VideoPlan = structuredClone(VALID_PLAN);
  plan.beats.push({
    id: 'b2',
    text: 'At the next stop, the bus crosses the bridge above the river.',
  });
  const section = structuredClone(plan.sections[0]!);
  section.id = 'bridge';
  section.spansBeats = ['b2'];
  section.scenes[0]!.id = 'bridge';
  section.scenes[0]!.spansBeats = ['b2'];
  section.scenes[0]!.props.assetRequirement = {
    type: 'image',
    subject: 'A bus crossing a river bridge',
    treatment: 'photo',
    orientation: 'landscape',
  };
  plan.sections.push(section);
  await writeFile(fixture.planPath, JSON.stringify(plan));
  await fixture.service.init({ requestPath: fixture.requestPath, out: fixture.runRoot });
  expect(
    (await fixture.service.validate({ runRoot: fixture.runRoot, planPath: fixture.planPath }))
      .envelope.outcome,
  ).toBe('succeeded');
  await fixture.service.preflight({ runRoot: fixture.runRoot });
  await seedVerifiedTake(fixture, plan);
  await fixture.service.compile({ runRoot: fixture.runRoot });
  const requests = plan.sections.map((item) => {
    const requirement = item.scenes[0]!.props.assetRequirement as AssetRequirement;
    const provider = {
      prompt: `Draw ${requirement.subject}`,
      aspectRatio: '16:9' as const,
      outputMimeType: 'image/png' as const,
      seed: 7,
    };
    return {
      protocolVersion: 1 as const,
      requirementId: assetRequirementId(requirement),
      identityKey: assetRequirementId(requirement),
      ...provider,
      requestSha256: imageGenerationRequestIdentity(provider),
    };
  });
  const pending = requests.map((request) =>
    fixture!.service.imageStart({ runRoot: fixture!.runRoot, request }),
  );
  await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2), { timeout: 12_000 });
  // Both external calls are in flight before either provider returns.
  release();
  const results = await Promise.all(pending);
  const jobs = results.map((result) =>
    imageJobSchema.parse((result.envelope.data as { job: unknown }).job),
  );
  expect(jobs.map((job) => job.status)).toEqual(['candidate', 'candidate']);
  expect(jobs[0]!.candidate!.artifact.path).toBe(jobs[1]!.candidate!.artifact.path);
  const decisions = await Promise.all(
    jobs.map((job) =>
      fixture!.service.imageAccept({
        runRoot: fixture!.runRoot,
        decision: {
          protocolVersion: 1,
          jobId: job.id,
          candidateSha256: job.candidate!.artifact.sha256,
        },
      }),
    ),
  );
  expect(decisions.map((result) => result.envelope.outcome)).toEqual(['succeeded', 'succeeded']);
  expect((await fixture.service.compile({ runRoot: fixture.runRoot })).envelope.outcome).toBe(
    'succeeded',
  );
  expect((await fixture.service.render({ runRoot: fixture.runRoot })).envelope.outcome).toBe(
    'succeeded',
  );
  expect(
    renderer.mock.calls[0]![0].document.sections[0]!.scenes[0]!.assets.assetRequirement!.uri,
  ).toMatch(/^data:image\/png;base64,/);
  const state = JSON.parse(await readFile(resolve(fixture.runRoot, 'run.json'), 'utf8'));
  expect(state.bindings.images.jobs.map((job: { status: string }) => job.status)).toEqual([
    'accepted',
    'accepted',
  ]);
  for (const name of await readdir(resolve(fixture.runRoot, 'receipts'))) {
    expect(await readFile(resolve(fixture.runRoot, 'receipts', name), 'utf8')).not.toContain(
      'data:image/png;base64,',
    );
  }
}, 30_000);
