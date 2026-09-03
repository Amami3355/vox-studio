import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanImageFiles } from '../src/proof/image-scan';

/**
 * ADR-0018 decision 8 asks for "the leak scan, run over the image's readable layers". Executing
 * that literally is impossible, and the reason is worth stating where the scan lives.
 *
 * `scanReadableFiles` — the agent-distribution scan — forbids the `.ts` extension and the marker
 * `ProductionCommandService`, because it answers *may the agent read this?* and the agent may read
 * neither. **The image is the production runtime**: it is made of `.ts` files and it contains that
 * class by construction. Running that scan over image layers would fail on nearly every file, and
 * a gate that must be suppressed to pass is not a gate.
 *
 * So the image gets the scan an image can honestly carry. The threat is not that the image holds
 * production source — it is *supposed* to — but that it holds **secret material** or **the agent's
 * own distribution**. Those are the two this asserts, and ADR-0018 is corrected rather than left
 * saying something that cannot be run.
 */
let root: string | null = null;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

const imageWith = async (files: Record<string, string>): Promise<string> => {
  root = await mkdtemp(join(tmpdir(), 'vox-image-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return root;
};

describe('scanning the image for what must not be in it', () => {
  it('passes an image that is only production source', async () => {
    const image = await imageWith({
      'packages/production/src/commands/service.ts': 'export class ProductionCommandService {}',
      'packages/video/src/remotion-entry.ts': 'export const entry = 1;',
    });

    const scan = await scanImageFiles(image);

    expect(scan.pass).toBe(true);
    expect(scan.violations).toEqual([]);
    // A scan that walked nothing would pass for the wrong reason.
    expect(scan.scanned.length).toBe(2);
  });

  it('refuses a baked secret value', async () => {
    const image = await imageWith({
      '.env': 'ELEVENLABS_API_KEY=sk-real-looking-value\n',
    });

    const scan = await scanImageFiles(image);

    expect(scan.pass).toBe(false);
    expect(scan.violations.join(' ')).toMatch(/env-file/);
  });

  it.each([
    ['ELEVENLABS_API_KEY', 'ELEVENLABS_API_KEY=sk-abcdefghijklmnop'],
    ['VOX_GRANT_KEY', 'VOX_GRANT_KEY=0123456789abcdef0123'],
    ['VOX_RUN_HMAC_KEY', 'VOX_RUN_HMAC_KEY=0123456789abcdef0123'],
    ['VOX_NETWORK_TOKEN', 'VOX_NETWORK_TOKEN=0123456789abcdef0123'],
    ['a quoted value', 'const c = { VOX_GRANT_KEY: "0123456789abcdef0123" };'],
  ])('refuses %s assigned a value in any layer', async (_name, line) => {
    const image = await imageWith({ 'deploy/notes.txt': line });

    const scan = await scanImageFiles(image);

    expect(scan.pass).toBe(false);
    expect(scan.violations.join(' ')).toMatch(/assigned-secret/);
  });

  /**
   * The first version of this scan reported every one of these, and the first real run over the
   * image surfaced them. **They are source code doing its job** — the proof harness forwards a
   * token to a process it spawns, and a type annotation is not a value. A scan that reports them
   * is one that gets switched off, so each shape is pinned here rather than left to be rediscovered.
   */
  it.each([
    ['an identifier', 'env: { VOX_IPC_TOKEN: ipcSecret }'],
    ['a type annotation', 'launcherEnvironment: { VOX_IPC_TOKEN: string }'],
    ['a short fixture value', "const env = { VOX_GRANT_KEY: 'grant-key' };"],
    ['shell interpolation', 'VOX_NETWORK_TOKEN=$SERVICE_TOKEN'],
    ['a documented name', 'Set VOX_RUN_HMAC_KEY from Secret Manager.'],
    // Ticket 03's wizard, verbatim. A negated character class matches newlines, so the value here
    // once ran from the quote on this line to a quote several lines below.
    [
      'a name inside a quoted prompt spanning lines',
      'capture_secret ELEVENLABS_API_KEY "ELEVENLABS_API_KEY:"\nstore_secret ELEVENLABS_API_KEY "$SA"\n',
    ],
  ])('permits %s, which is not a baked secret', async (_name, line) => {
    const image = await imageWith({ 'packages/production/src/proof/harness.ts': line });

    const scan = await scanImageFiles(image);

    expect(scan.violations).toEqual([]);
  });

  it('skips node_modules, which is third-party and installed from the lockfile', async () => {
    const image = await imageWith({
      'node_modules/pkg/.env': 'ELEVENLABS_API_KEY=sk-abcdefghijklmnop',
      'src/app.ts': 'export const a = 1;',
    });

    const scan = await scanImageFiles(image);

    expect(scan.pass).toBe(true);
    expect(scan.scanned).toEqual(['src/app.ts']);
  });

  /**
   * Naming the variable is not the offence — the Dockerfile and the runbook both must. Assigning
   * it one is. This keeps the scan from flagging its own documentation, which is the failure mode
   * that gets a gate switched off.
   */
  it('permits a secret name that is documented rather than assigned', async () => {
    const image = await imageWith({
      'deploy/README.md': 'Set ELEVENLABS_API_KEY from Secret Manager at deploy time.',
      Dockerfile: 'ENV VOX_BROWSER_EXECUTABLE=/app/browser\n',
    });

    const scan = await scanImageFiles(image);

    expect(scan.pass).toBe(true);
  });

  it.each(['credentials.json', 'service-account.json', 'key.pem', 'id_rsa'])(
    'refuses a credential file named %s',
    async (name) => {
      const image = await imageWith({ [`deploy/${name}`]: 'anything' });

      const scan = await scanImageFiles(image);

      expect(scan.pass).toBe(false);
      expect(scan.violations.join(' ')).toMatch(/credential-file/);
    },
  );

  /**
   * The agent's distribution is the one file set that genuinely must not travel in this image:
   * the trusted service and the agent are different trust domains, and shipping one inside the
   * other is the code-blindness regression containerisation could quietly cause.
   */
  it('refuses the agent distribution travelling inside the service image', async () => {
    const image = await imageWith({
      'packages/production/dist/agent/vox.exe': 'MZ binary',
    });

    const scan = await scanImageFiles(image);

    expect(scan.pass).toBe(false);
    expect(scan.violations.join(' ')).toMatch(/agent-distribution/);
  });
});
