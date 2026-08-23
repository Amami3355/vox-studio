import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { codexProofSandboxArguments } from '../src/proof/codex-agent';

const parent = 'C:\\vox-proof-workroots';

/**
 * Proves the elevated Windows sandbox account can be created and can write, by having it write
 * one marker file. Windows may request administrator approval the first time. It is a readiness
 * check rather than a provisioning step: nothing here is left behind on success.
 */
export const ensureElevatedSandbox = async (): Promise<void> => {
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'vox-codex-sandbox-'));
  const marker = join(root, 'ready.txt');
  const codex = process.env.VOX_PROOF_CODEX_BIN ?? 'codex.exe';
  try {
    const exitCode = await new Promise<number>((resolvePromise, reject) => {
      const child = spawn(
        codex,
        codexProofSandboxArguments(root, ['cmd.exe', '/d', '/c', 'type nul > ready.txt']),
        { cwd: root, stdio: 'inherit', windowsHide: false },
      );
      child.once('error', reject);
      child.once('close', (code) => resolvePromise(code ?? 1));
    });
    if (exitCode !== 0) throw new Error(`CODEX_SANDBOX_SETUP_FAILED:${exitCode}`);
    await access(marker);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.stdout.write(
    'Windows may request administrator approval for Codex Windows Sandbox Setup.\n',
  );
  await ensureElevatedSandbox();
  process.stdout.write('CODEX_ELEVATED_SANDBOX_READY\n');
}
