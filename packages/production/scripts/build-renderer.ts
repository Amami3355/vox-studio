import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';

// The Docker source layer is the cache key: every source/dependency change rebuilds
// this bundle. No Run media is baked into the image.
const empty = await mkdtemp(join(tmpdir(), 'vox-render-public-'));
const root = fileURLToPath(new URL('../../../', import.meta.url));
try {
  const output = resolve(process.argv[2] ?? '.render-bundle');
  await mkdir(output, { recursive: true });
  await bundle({
    entryPoint: resolve(root, 'packages/video/src/remotion-entry.ts'),
    outDir: output,
    publicDir: empty,
    symlinkPublicDir: false,
  });
} finally {
  await rm(empty, { recursive: true, force: true });
}
