import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VideoPlan } from '@vox/video';
import { type ProviderSynthesisResponse, createRunTake, foldRunTake, scriptFor } from '@vox/voice';
import { vi } from 'vitest';
import { type JsonValue, canonicalJson } from '../src/canonical-json';
import {
  ProductionCommandService,
  type ProductionCommandServiceOptions,
} from '../src/commands/service';
import { DurationCalibrationStore, activeInitialCalibration } from '../src/preflight/calibration';
import { RUN_PATHS } from '../src/run-store/paths';
import { RunStore } from '../src/run-store/run-store';
import { REQUEST } from './run-fixture';

export const VALID_PLAN: VideoPlan = {
  beats: [
    {
      id: 'b1',
      text: 'At Northbridge, the last bus waits under the station clock before beginning its route.',
    },
  ],
  sections: [
    {
      id: 'northbridge',
      spansBeats: ['b1'],
      scenes: [
        {
          id: 'station',
          component: 'image_context',
          layout: 'splitLeft',
          spansBeats: ['b1'],
          props: {
            headline: 'The last bus',
            caption: 'A fictional route used for production tests.',
            assetRequirement: {
              type: 'image',
              subject: 'A night bus waiting outside a small railway station',
              treatment: 'photo',
              orientation: 'landscape',
            },
          },
        },
      ],
    },
  ],
};

export type CommandFixture = {
  root: string;
  trustedRoot: string;
  runRoot: string;
  ledgerRoot: string;
  requestPath: string;
  planPath: string;
  declinePath: string;
  network: { request: ReturnType<typeof vi.fn> };
  service: ProductionCommandService;
  cleanup: () => Promise<void>;
};

export const recordedResponseFor = (
  plan: VideoPlan,
  audio: Uint8Array = Buffer.from('synthetic-test-mp3'),
): ProviderSynthesisResponse => {
  const characters = scriptFor(plan.beats).split('');
  return {
    audio,
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, index) => index * 0.05),
      character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
    },
  };
};

export const createCommandFixture = async (options?: {
  studioAuthorizationKey?: string;
  studioImageGrantKey?: string;
  calibration?: 'active' | 'missing';
  compiler?: ProductionCommandServiceOptions['compiler'];
  renderer?: ProductionCommandServiceOptions['renderer'];
  compilerVersion?: string;
  rendererVersion?: string;
  synthesizer?: ProductionCommandServiceOptions['synthesizer'];
  verifyReplacementGrant?: ProductionCommandServiceOptions['verifyReplacementGrant'];
  imageGenerator?: ProductionCommandServiceOptions['imageGenerator'];
  verifyImageGrant?: ProductionCommandServiceOptions['verifyImageGrant'];
  autonomousImages?: ProductionCommandServiceOptions['autonomousImages'];
  recordingCrashAt?: ProductionCommandServiceOptions['recordingCrashAt'];
  now?: ProductionCommandServiceOptions['now'];
  splitTrustedRoot?: boolean;
}): Promise<CommandFixture> => {
  const root = await mkdtemp(join(tmpdir(), 'vox-commands-'));
  const trustedRoot = options?.splitTrustedRoot
    ? await mkdtemp(join(tmpdir(), 'vox-trusted-'))
    : root;
  const runRoot = join(root, 'public', 'run');
  const ledgerRoot = join(trustedRoot, 'private');
  const requestPath = join(root, 'request.json');
  const planPath = join(root, 'plan.json');
  const declinePath = join(root, 'decline.json');
  const calibrationStore = new DurationCalibrationStore(
    join(trustedRoot, 'authority', 'duration.json'),
  );
  await mkdir(join(root, 'public'));
  if (options?.calibration !== 'missing') await calibrationStore.save(activeInitialCalibration());
  await writeFile(requestPath, JSON.stringify(REQUEST));
  await writeFile(planPath, JSON.stringify(VALID_PLAN));
  await writeFile(
    declinePath,
    JSON.stringify({
      protocolVersion: 1,
      kind: 'unservable_brief',
      summary: 'The current catalogue cannot serve the requested route map.',
      unmetNeeds: [{ need: 'A geographic route', catalogGap: 'No map capability is published.' }],
    }),
  );
  const network = { request: vi.fn(async () => Promise.reject(new Error('NETWORK_FORBIDDEN'))) };
  const service = new ProductionCommandService({
    studioAuthorizationKey: options?.studioAuthorizationKey,
    studioImageGrantKey: options?.studioImageGrantKey,
    ledgerRoot,
    hmacKey: 'command-test-secret',
    keyId: 'command-test-key',
    calibrationStore,
    network,
    compiler: options?.compiler,
    renderer: options?.renderer,
    compilerVersion: options?.compilerVersion,
    rendererVersion: options?.rendererVersion,
    synthesizer: options?.synthesizer,
    verifyReplacementGrant: options?.verifyReplacementGrant,
    imageGenerator: options?.imageGenerator,
    verifyImageGrant: options?.verifyImageGrant,
    autonomousImages: options?.autonomousImages,
    recordingCrashAt: options?.recordingCrashAt,
    now: options?.now,
    createRunId: () => 'run-command-test',
  });

  return {
    root,
    trustedRoot,
    runRoot,
    ledgerRoot,
    requestPath,
    planPath,
    declinePath,
    network,
    service,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
      if (trustedRoot !== root) await rm(trustedRoot, { recursive: true, force: true });
    },
  };
};

export const seedVerifiedTake = async (
  fixture: CommandFixture,
  plan: VideoPlan = VALID_PLAN,
  recordedResponse?: ProviderSynthesisResponse,
): Promise<void> => {
  const store = new RunStore({
    runRoot: fixture.runRoot,
    ledgerRoot: fixture.ledgerRoot,
    runId: 'run-command-test',
    hmacKey: 'command-test-secret',
    keyId: 'command-test-key',
  });
  const checkpoint = await store.inspect();
  const response = recordedResponse ?? recordedResponseFor(plan);
  const { manifest, artifacts } = createRunTake({
    beats: plan.beats,
    voice: REQUEST.production.voice,
    response,
    recordedAt: '2026-08-13T10:00:00.000Z',
  });
  const fold = foldRunTake(manifest, artifacts, plan.beats);
  const previous = checkpoint.bindings;
  await store.commit({
    expectedRevision: checkpoint.revision,
    command: 'run.record',
    outcome: 'succeeded',
    stage: 'recorded',
    quota: { newTakesDelta: 1 },
    artifacts: [
      {
        kind: 'take_manifest',
        path: RUN_PATHS.takeManifest(manifest.takeSha256),
        bytes: canonicalJson(manifest as unknown as JsonValue),
      },
      {
        kind: 'take_audio',
        path: RUN_PATHS.takeAudio(manifest.takeSha256),
        bytes: artifacts.audio,
      },
      {
        kind: 'take_alignment',
        path: RUN_PATHS.takeAlignment(manifest.takeSha256),
        bytes: canonicalJson(artifacts.alignment as unknown as JsonValue),
      },
      {
        kind: 'timed_beat_fold',
        path: RUN_PATHS.timedBeatFold(manifest.takeSha256, fold.beatShapeSha256),
        bytes: canonicalJson(fold as unknown as JsonValue),
      },
    ],
    bindings: ([takeManifest, audio, takeAlignment, timedBeatFold]) => {
      if (!takeManifest || !audio || !takeAlignment || !timedBeatFold) {
        throw new Error('Take artifacts were not published.');
      }
      return {
        ...previous,
        take: {
          recordingInputSha256: manifest.recordingInputSha256,
          takeId: manifest.takeId,
          takeSha256: manifest.takeSha256,
          beatShapeSha256: fold.beatShapeSha256,
          manifest: takeManifest,
          audio,
          alignment: takeAlignment,
          fold: timedBeatFold,
          freshness: { state: 'fresh', reasons: [] },
        },
      };
    },
    data: { takeId: manifest.takeId },
  });
};
