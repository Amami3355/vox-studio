/** PROTOTYPE ONLY — run inside the isolated agent container. */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? '/agent';
const files = [];
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
};
await walk(root);

const forbiddenNames = files.filter((path) => /\.(?:ts|tsx|map)$/i.test(path));
const markers = [
  ['Collected while the sections are built', 'and gated once at the end'].join(' '),
  ['packages', 'video', 'src'].join('/'),
  ['source', 'MappingURL'].join(''),
  ['report', 'DegradedAsset'].join(''),
];
const hits = [];
for (const path of files) {
  const contents = (await readFile(path)).toString('latin1');
  for (const marker of markers) {
    if (contents.includes(marker)) hits.push({ path, marker });
  }
}

let sourceReachable = true;
try {
  await readdir(join('/workspace', 'packages', 'video', 'src'));
} catch (error) {
  if (error?.code === 'ENOENT') sourceReachable = false;
  else throw error;
}

const result = {
  ok: forbiddenNames.length === 0 && hits.length === 0 && !sourceReachable,
  readableFiles: files.sort(),
  forbiddenNames,
  markerHits: hits,
  repositorySourceReachable: sourceReachable,
};
console.info(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
