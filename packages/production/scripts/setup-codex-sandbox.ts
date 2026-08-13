import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexProofSandboxArguments } from '../src/proof/codex-agent';

const root = await mkdtemp(join(tmpdir(), 'vox-codex-sandbox-'));
const marker = join(root, 'ready.txt');
const codex = process.env.VOX_PROOF_CODEX_BIN ?? 'codex.exe';

try {
  process.stdout.write(
    'Windows may request administrator approval for Codex Windows Sandbox Setup.\n',
  );
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
  process.stdout.write('CODEX_ELEVATED_SANDBOX_READY\n');
} finally {
  await rm(root, { recursive: true, force: true });
}
