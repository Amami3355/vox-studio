/**
 * One command that turns a clean checkout into a work root an agent can be pointed at.
 *
 * It was several steps, and their names belonged to one specific agent runtime. The steps are the
 * same for any crew, so the command is not named after one: what varies is which sandbox, if any,
 * needs proving ready, and that is a flag.
 *
 * Everything it does is verified, and it refuses rather than half-completing. A work root that is
 * nearly right is worse than one that failed loudly, because nothing notices until the leak scan
 * or the initial-inventory assertion, long after the run that produced it.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { productionRequestSchema } from '../src/contracts/schemas';
import { sha256 } from '../src/proof/evidence';
import { PROOF_SCENARIO_KEYS, isProofScenarioKey, proofScenario } from '../src/proof/scenarios';
import { assembleWorkRoot } from '../src/proof/workroot';
import { buildAgentDistribution } from './build-agent-distribution';
import { ensureElevatedSandbox } from './setup-codex-sandbox';

const execFileAsync = promisify(execFile);

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const present = (name: string): boolean => process.argv.includes(`--${name}`);

const usage = `bootstrap:workroot [--out <directory>] [--scenario ${PROOF_SCENARIO_KEYS.join('|')}] [--request <file>] [--sandbox none|codex] [--force]`;

const out = resolve(flag('out') ?? 'C:\\vox-proof-workroots\\crew');
const requestPath = flag('request');
const sandbox = flag('sandbox') ?? 'none';
if (sandbox !== 'none' && sandbox !== 'codex') throw new TypeError(usage);

const scenarioKey = flag('scenario') ?? 'short';
if (!isProofScenarioKey(scenarioKey)) throw new TypeError(usage);
if (requestPath !== undefined && flag('scenario') !== undefined) {
  throw new TypeError('Pass either --request or --scenario, not both.');
}

/**
 * Parsed before anything is built. A request the service would reject is a bootstrap that should
 * fail now, not a work root that looks ready and fails at `run init`.
 */
const request = productionRequestSchema.parse(
  requestPath === undefined
    ? proofScenario(scenarioKey).request
    : JSON.parse(await readFile(resolve(requestPath), 'utf8')),
);

const steps: string[] = [];

if (sandbox === 'codex') {
  process.stdout.write('Windows may request administrator approval for sandbox setup.\n');
  await ensureElevatedSandbox();
  steps.push('sandbox:ready');
}

// Built and verified here rather than assumed, so a launcher that fails the distribution
// allowlist fails the bootstrap instead of being copied into a work root.
const { launcherPath, launcherSha256 } = await buildAgentDistribution();
steps.push('distribution:verified');

const result = await assembleWorkRoot({
  workRoot: out,
  launcherPath,
  request,
  force: present('force'),
});
steps.push(`workroot:${result.action}`);

// The work root is read by a separate local account — the restricted runner today, an elevated
// sandbox account for Codex — and one it cannot traverse is not ready.
await execFileAsync('icacls.exe', [
  result.workRoot,
  '/grant',
  '*S-1-5-32-545:(OI)(CI)(F)',
  '*S-1-5-12:(OI)(CI)(F)',
  '/inheritance:e',
]);
steps.push('access:granted');

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    workRoot: result.workRoot,
    action: result.action,
    files: result.files,
    scenario: requestPath === undefined ? scenarioKey : null,
    briefId: request.brief.id,
    launcherSha256,
    requestSha256: sha256(await readFile(resolve(result.workRoot, 'request.json'))),
    sandbox,
    steps,
  })}\n`,
);
