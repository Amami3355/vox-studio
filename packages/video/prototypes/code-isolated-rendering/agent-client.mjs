/**
 * PROTOTYPE ONLY — readable transport in the isolated agent environment.
 * Production validation, compilation and rendering live behind the HTTP boundary.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const [command, planPath, beatsPathOrOutput, maybeOutput] = process.argv.slice(2);
const baseUrl = process.env.VOX_PROTOTYPE_URL;
const token = process.env.VOX_PROTOTYPE_TOKEN;

if (!baseUrl || !token) {
  throw new Error('VOX_PROTOTYPE_URL and VOX_PROTOTYPE_TOKEN are required');
}
if (!['validate', 'compile', 'render'].includes(command)) {
  throw new Error('usage: node agent-client.mjs <validate|compile|render> <plan> [beats] <out>');
}

const needsBeats = command !== 'validate';
const outputPath = needsBeats ? maybeOutput : beatsPathOrOutput;
if (!planPath || !outputPath || (needsBeats && !beatsPathOrOutput)) {
  throw new Error('missing input or output path');
}

const plan = JSON.parse(await readFile(planPath, 'utf8'));
const beats = needsBeats ? JSON.parse(await readFile(beatsPathOrOutput, 'utf8')) : undefined;
const response = await fetch(`${baseUrl}/${command}`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ plan, ...(beats ? { beats } : {}) }),
});

await mkdir(dirname(outputPath), { recursive: true });
if (command === 'render' && response.ok) {
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
} else {
  const body = await response.text();
  await writeFile(outputPath, body);
  if (!response.ok) throw new Error(`production service returned ${response.status}: ${body}`);
}

console.info(JSON.stringify({ command, status: response.status, output: outputPath }));
