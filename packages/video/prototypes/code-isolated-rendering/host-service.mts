import { mkdtemp, readFile } from 'node:fs/promises';
/**
 * PROTOTYPE ONLY — production-side half of the code-isolated-rendering experiment.
 *
 * This process runs in the repository-owning environment. The agent container receives
 * neither this file nor a filesystem mount that can reach it.
 */
import { type ServerResponse, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { validateVideoPlan } from '../../src/catalog/validate';
import type { VideoPlan } from '../../src/catalog/validate';
import { compile } from '../../src/compile';
import type { TimedBeat } from '../../src/core/types';

const token = process.env.VOX_PROTOTYPE_TOKEN;
const port = Number(process.env.VOX_PROTOTYPE_PORT ?? '43177');

if (!token) throw new Error('VOX_PROTOTYPE_TOKEN is required');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('VOX_PROTOTYPE_PORT must be a valid TCP port');
}

const renderDir = await mkdtemp(join(tmpdir(), 'vox-code-isolation-render-'));
const serveUrl = await bundle({
  entryPoint: fileURLToPath(new URL('../../src/remotion-entry.ts', import.meta.url)),
  outDir: join(renderDir, 'bundle'),
});

type ProductionRequest = { plan: VideoPlan; beats?: TimedBeat[] };

const sendJson = (response: ServerResponse, status: number, value: unknown): void => {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(bytes.byteLength),
  });
  response.end(bytes);
};

const readJson = async (request: AsyncIterable<Uint8Array>): Promise<ProductionRequest> => {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.byteLength;
    if (length > 2_000_000) throw new Error('request is larger than 2 MB');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as ProductionRequest;
};

const requireCompileInput = (body: ProductionRequest): { plan: VideoPlan; beats: TimedBeat[] } => {
  if (!Array.isArray(body.beats)) throw new Error('beats are required for compile and render');
  return { plan: body.plan, beats: body.beats };
};

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/health' && request.method === 'GET') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.headers.authorization !== `Bearer ${token}`) {
      sendJson(response, 401, { ok: false, error: 'unauthorised' });
      return;
    }

    const body = await readJson(request);
    if (request.url === '/validate' && request.method === 'POST') {
      sendJson(response, 200, validateVideoPlan(body.plan));
      return;
    }

    if (request.url === '/compile' && request.method === 'POST') {
      const result = compile(requireCompileInput(body));
      sendJson(response, result.ok ? 200 : 422, result);
      return;
    }

    if (request.url === '/render' && request.method === 'POST') {
      const result = compile(requireCompileInput(body));
      if (!result.ok) {
        sendJson(response, 422, result);
        return;
      }

      const inputProps = { document: result.document };
      const composition = await selectComposition({
        serveUrl,
        id: 'compiled-document',
        inputProps,
      });
      const output = join(renderDir, `preview-${Date.now()}.mp4`);
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        codec: 'h264',
        outputLocation: output,
        logLevel: 'error',
      });
      const bytes = await readFile(output);
      response.writeHead(200, {
        'content-type': 'video/mp4',
        'content-length': String(bytes.byteLength),
      });
      response.end(bytes);
      return;
    }

    sendJson(response, 404, { ok: false, error: 'not found' });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.info(`READY http://0.0.0.0:${port}`);
});
