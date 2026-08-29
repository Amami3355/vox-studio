/**
 * Refuses a service start that would fail later, and names the actual reason.
 *
 * The variable names are read out of `src/ipc/service-host.ts` rather than listed here. A tenth
 * variable added to the host is caught on the next run of this check; a list copied into a skill
 * is a manifest, and a hand-maintained manifest diverges from the code within days.
 */

import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSocketTimeoutMs } from '../../../../packages/production/src/ipc/socket-timeout';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const fromRoot = (path: string): string => relative(repositoryRoot, path);
const hostPath = resolve(repositoryRoot, 'packages/production/src/ipc/service-host.ts');
const launcherPath = resolve(repositoryRoot, 'packages/production/launcher/Program.cs');
const bridgePath = resolve(repositoryRoot, 'packages/production/dist/service/vox-pipe-bridge.exe');

/**
 * Both failure modes print this, and it is also what a genuinely absent service prints. Naming
 * the variable is the only thing that separates them.
 */
const UNAVAILABLE = '"vox: IPC configuration is unavailable." and exit 2';

const source = await readFile(hostPath, 'utf8');
const required = [...source.matchAll(/required\('([A-Z_]+)'\)/g)].map(
  (match) => match[1] as string,
);
if (required.length === 0) {
  process.stderr.write(`No required(...) calls in ${hostPath}. Has the host moved?\n`);
  process.exit(2);
}

const problems: string[] = [];
const status = (ok: boolean, text: string) => `${ok ? '  ok  ' : ' MISS '} ${text}`;

process.stdout.write(`Required by ${fromRoot(hostPath)}:\n`);
for (const name of required) {
  const present = (process.env[name] ?? '') !== '';
  process.stdout.write(`${status(present, name)}\n`);
  if (!present) {
    problems.push(
      `${name} is unset. The host throws: Missing trusted service configuration: ${name}`,
    );
  }
}

/**
 * Optional variables are read straight from `process.env`, so `required(...)` does not see them
 * and neither did this check until one of them acquired a start-up guard. A malformed value is a
 * hard start failure, which is exactly the class of thing this script exists to catch first.
 * Validators come from the host's own module rather than restating its rule.
 */
const optionalValidators: Record<string, (raw: string) => string> = {
  VOX_IPC_SOCKET_TIMEOUT_MS: (raw) => `${resolveSocketTimeoutMs(raw)} ms`,
};
const optional = [...new Set([...source.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]))];
if (optional.length > 0) {
  process.stdout.write('\nOptional, but validated at start-up:\n');
  for (const name of optional) {
    const raw = process.env[name as string];
    if (raw === undefined || raw.trim() === '') {
      process.stdout.write(`${status(true, `${name} unset — the host default applies`)}\n`);
      continue;
    }
    const validate = optionalValidators[name as string];
    if (validate === undefined) {
      process.stdout.write(`${status(true, `${name}=${raw}`)}\n`);
      continue;
    }
    try {
      process.stdout.write(`${status(true, `${name}=${raw} resolves to ${validate(raw)}`)}\n`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      process.stdout.write(`${status(false, `${name}=${raw} is rejected`)}\n`);
      problems.push(`${name}="${raw}" fails the host's own check: ${reason}`);
    }
  }
}

/**
 * The two-sided naming. `service-host.ts` derives the name from the path; the launcher is given
 * the name directly and never sees the path. Getting this wrong is the failure this whole check
 * exists for, because the launcher's message points at the service rather than at the variable.
 */
const pipePath = process.env.VOX_PIPE_PATH ?? '';
const pipeName = process.env.VOX_PIPE_NAME ?? '';
const prefix = '\\\\.\\pipe\\';
process.stdout.write('\nPipe naming (host reads VOX_PIPE_PATH, launcher reads VOX_PIPE_NAME):\n');
if (pipePath !== '' && !pipePath.startsWith(prefix)) {
  problems.push(`VOX_PIPE_PATH must start with ${prefix} — the host rejects the path as invalid.`);
  process.stdout.write(`${status(false, `VOX_PIPE_PATH=${pipePath} is missing the prefix`)}\n`);
} else if (pipePath !== '') {
  const derived = pipePath.slice(prefix.length);
  process.stdout.write(`${status(true, `VOX_PIPE_PATH=${pipePath}`)}\n`);
  process.stdout.write(`        the launcher's VOX_PIPE_NAME must therefore be: ${derived}\n`);
  if (pipeName === '') {
    process.stdout.write(`${status(false, 'VOX_PIPE_NAME is unset in this shell')}\n`);
    process.stdout.write('        (fine for the service shell; the launcher shell needs it)\n');
  } else if (pipeName !== derived) {
    problems.push(
      `VOX_PIPE_NAME="${pipeName}" does not match VOX_PIPE_PATH. The launcher prints ${UNAVAILABLE}.`,
    );
    process.stdout.write(`${status(false, `VOX_PIPE_NAME=${pipeName} does not match`)}\n`);
  } else {
    process.stdout.write(`${status(true, `VOX_PIPE_NAME=${pipeName}`)}\n`);
  }
}

/** `Program.cs` rejects a token under 32 UTF-8 bytes with the same misleading message. */
const token = process.env.VOX_IPC_TOKEN ?? '';
if (token !== '') {
  const bytes = Buffer.byteLength(token, 'utf8');
  const ok = bytes >= 32;
  const floor = `${fromRoot(launcherPath)} requires >= 32`;
  process.stdout.write(`${status(ok, `VOX_IPC_TOKEN is ${bytes} UTF-8 bytes (${floor})`)}\n`);
  if (!ok) {
    problems.push(
      `VOX_IPC_TOKEN is ${bytes} UTF-8 bytes. Under 32 the launcher prints ${UNAVAILABLE}, the same as a wrong pipe name.`,
    );
  }
}

/** `dist/` is gitignored, so a clean checkout has no bridge until the distribution is built. */
process.stdout.write('\nBuilt artifacts:\n');
const bridge = await readFile(bridgePath).then(
  () => true,
  () => false,
);
process.stdout.write(`${status(bridge, 'dist/service/vox-pipe-bridge.exe')}\n`);
if (!bridge) {
  problems.push(
    'The pipe bridge is not built. Run: pnpm --filter @vox/production build:agent-distribution ' +
      '(dist/ is gitignored, so a clean checkout never has it).',
  );
}

/** How you tell a service that is down from one you are addressing by the wrong name. */
process.stdout.write('\nNamed pipes currently open (PowerShell):\n');
process.stdout.write('  [System.IO.Directory]::GetFiles("\\\\.\\pipe\\") | Select-String vox\n');

if (problems.length > 0) {
  process.stdout.write(`\n${problems.length} problem(s):\n`);
  for (const problem of problems) process.stdout.write(`  - ${problem}\n`);
  process.exit(1);
}
process.stdout.write('\nEnvironment is complete.\n');
