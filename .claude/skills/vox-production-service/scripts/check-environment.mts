/**
 * Refuses a service start that would fail later, and names the actual reason.
 *
 * The required variable names are read out of `src/ipc/service-host.ts` rather than listed here.
 * A tenth variable added to the host is caught on the next run of this check; a list copied into
 * a skill is a manifest, and a manifest manuel diverge du code en trois jours.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const hostPath = resolve(repositoryRoot, 'packages/production/src/ipc/service-host.ts');
const launcherPath = resolve(repositoryRoot, 'packages/production/launcher/Program.cs');
const bridgePath = resolve(repositoryRoot, 'packages/production/dist/service/vox-pipe-bridge.exe');

const source = await readFile(hostPath, 'utf8');
const required = [...source.matchAll(/required\('([A-Z_]+)'\)/g)].map((match) => match[1] as string);
if (required.length === 0) {
  process.stderr.write(`No required(...) calls in ${hostPath}. Has the host moved?\n`);
  process.exit(2);
}

const problems: string[] = [];
const line = (ok: boolean, text: string) => `${ok ? '  ok  ' : ' MISS '} ${text}`;

process.stdout.write(`Required by ${hostPath.slice(repositoryRoot.length + 1)}:\n`);
for (const name of required) {
  const present = (process.env[name] ?? '') !== '';
  process.stdout.write(`${line(present, name)}\n`);
  if (!present) problems.push(`${name} is unset. The host throws: Missing trusted service configuration: ${name}`);
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
  problems.push(`VOX_PIPE_PATH must start with ${prefix} — the host throws "Production IPC pipe path is invalid."`);
  process.stdout.write(`${line(false, `VOX_PIPE_PATH=${pipePath} is missing the ${prefix} prefix`)}\n`);
} else if (pipePath !== '') {
  const derived = pipePath.slice(prefix.length);
  process.stdout.write(`${line(true, `VOX_PIPE_PATH=${pipePath}`)}\n`);
  process.stdout.write(`        the launcher's VOX_PIPE_NAME must therefore be: ${derived}\n`);
  if (pipeName === '') {
    process.stdout.write(`${line(false, 'VOX_PIPE_NAME is unset in this shell')}\n`);
    process.stdout.write('        (fine for the service shell; the launcher shell needs it)\n');
  } else if (pipeName !== derived) {
    problems.push(
      `VOX_PIPE_NAME="${pipeName}" does not match VOX_PIPE_PATH. The launcher will print ` +
        '"vox: IPC configuration is unavailable." and exit 2, which reads as a missing service and is not.',
    );
    process.stdout.write(`${line(false, `VOX_PIPE_NAME=${pipeName} does not match`)}\n`);
  } else {
    process.stdout.write(`${line(true, `VOX_PIPE_NAME=${pipeName}`)}\n`);
  }
}

/** `Program.cs` rejects a token under 32 UTF-8 bytes with the same misleading message. */
const token = process.env.VOX_IPC_TOKEN ?? '';
if (token !== '') {
  const bytes = Buffer.byteLength(token, 'utf8');
  const ok = bytes >= 32;
  process.stdout.write(`${line(ok, `VOX_IPC_TOKEN is ${bytes} UTF-8 bytes (${launcherPath.slice(repositoryRoot.length + 1)} requires >= 32)`)}\n`);
  if (!ok) {
    problems.push(
      `VOX_IPC_TOKEN is ${bytes} UTF-8 bytes. Under 32 the launcher prints the same ` +
        '"vox: IPC configuration is unavailable." as a wrong pipe name.',
    );
  }
}

/** `dist/` is gitignored, so a clean checkout has no bridge until the distribution is built. */
process.stdout.write('\nBuilt artifacts:\n');
const bridge = await readFile(bridgePath).then(
  () => true,
  () => false,
);
process.stdout.write(`${line(bridge, 'dist/service/vox-pipe-bridge.exe')}\n`);
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
