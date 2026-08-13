import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

const forbiddenExtensions = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.map',
  '.pdb',
  '.zip',
  '.jar',
  '.asar',
]);

const forbiddenMarkers = [
  'Collected while the sections are built and gated once at the end',
  'packages/video/src',
  'packages\\video\\src',
  'packages/production',
  'packages\\production',
  'sourceMappingURL',
  'sourcesContent',
  'reportDegradedAsset',
  'ProductionCommandService',
  'node_modules',
  'ELEVENLABS_API_KEY',
  'VOX_GRANT_KEY',
  'VOX_RUN_HMAC_KEY',
  'System.Net',
  'HttpClient',
  'WebClient',
  'TcpClient',
] as const;

const walk = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Distribution contains a link: ${entry.name}`);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
};

export const verifyAgentDistribution = async (root: string): Promise<{ files: string[] }> => {
  const files = await walk(resolve(root));
  if (files.length !== 1 || basename(files[0] as string).toLowerCase() !== 'vox.exe') {
    throw new Error('Agent distribution allowlist is exactly one file named vox.exe.');
  }

  for (const path of files) {
    const extension = extname(path).toLowerCase();
    if (forbiddenExtensions.has(extension)) {
      throw new Error(`Forbidden distribution extension: ${extension}`);
    }
    const bytes = await readFile(path);
    if (bytes.subarray(0, 2).toString('ascii') !== 'MZ') {
      throw new Error('vox.exe is not a Windows executable.');
    }
    // Embedded ZIP/ASAR payloads would create another readable filesystem after extraction.
    if (bytes.indexOf(Buffer.from('PK\x03\x04', 'latin1')) !== -1) {
      throw new Error('Embedded archive detected in the launcher.');
    }
    const views = [bytes.toString('latin1'), bytes.toString('utf16le')];
    for (const marker of forbiddenMarkers) {
      if (views.some((view) => view.includes(marker))) {
        throw new Error(`Forbidden implementation marker in agent distribution: ${marker}`);
      }
    }
    const repository = resolve(import.meta.dirname, '../../..');
    if (views.some((view) => view.toLowerCase().includes(repository.toLowerCase()))) {
      throw new Error('Repository path is embedded in the agent distribution.');
    }
  }
  return { files: files.sort() };
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const root = process.argv[2] ?? resolve(import.meta.dirname, '../dist/agent');
  const result = await verifyAgentDistribution(root);
  process.stdout.write(`${JSON.stringify({ ok: true, readableFiles: result.files })}\n`);
}
