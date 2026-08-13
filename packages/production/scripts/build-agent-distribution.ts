import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { verifyAgentDistribution } from './verify-agent-distribution';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, '..');
const target = resolve(packageRoot, 'dist/agent');
const serviceTarget = resolve(packageRoot, 'dist/service');
const csc =
  process.env.VOX_CSC_PATH ?? 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const stagingParent = await mkdtemp(resolve(tmpdir(), 'vox-agent-distribution-'));
const staging = resolve(stagingParent, 'agent');
const serviceStaging = resolve(stagingParent, 'service');

try {
  await mkdir(staging);
  await mkdir(serviceStaging);
  await execFileAsync(csc, [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    `/out:${resolve(staging, 'vox.exe')}`,
    '/reference:System.Web.Extensions.dll',
    resolve(packageRoot, 'launcher/Program.cs'),
  ]);
  await execFileAsync(csc, [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    `/out:${resolve(serviceStaging, 'vox-pipe-acl.exe')}`,
    resolve(packageRoot, 'service/PipeAcl.cs'),
  ]);
  await execFileAsync(csc, [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/debug-',
    `/out:${resolve(serviceStaging, 'vox-pipe-bridge.exe')}`,
    resolve(packageRoot, 'service/PipeBridge.cs'),
  ]);
  await verifyAgentDistribution(staging);
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await rm(serviceTarget, { recursive: true, force: true });
  await rename(staging, target);
  await rename(serviceStaging, serviceTarget);
  process.stdout.write(
    'Built allowlisted agent distribution and trusted pipe helpers: dist/agent/vox.exe\n',
  );
} finally {
  await rm(stagingParent, { recursive: true, force: true });
}
