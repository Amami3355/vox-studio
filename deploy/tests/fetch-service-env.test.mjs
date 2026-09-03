// Runs `deploy/fetch-service-env.sh` end-to-end against a fake metadata server and a fake Secret
// Manager, so the script's first execution is not on the production VM with five real credentials.
//
// It is a plain node script rather than a vitest file on purpose: it needs to run as root inside a
// Linux container, and `vitest` excludes nothing here but also cannot give it that. The deploy
// wizard is not on the unit-test path either — this is the harness for both.
//
// Run it from the repo root inside a container that has bash, curl and base64:
//   docker run --rm -v "${PWD}:/work" -w /work --entrypoint node vox-production:latest \
//     deploy/tests/fetch-service-env.test.mjs
//
// Every case below is a case the script must REFUSE, plus the one it must accept. A harness that
// only proves the happy path would tell us nothing about the failure modes that matter: a secret
// the identity cannot read, and a value `--env-file` cannot carry.

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'studio-prod-7f3a';
const SA = 'vox-production@studio-prod-7f3a.iam.gserviceaccount.com';
const TOKEN = 'ya29.a0AfB_fake-token-value_-0123456789';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
};

/** Starts both fakes on one port; the script reaches them through its two base-URL overrides. */
function startFakes(secrets) {
  const server = createServer((req, res) => {
    const url = req.url ?? '';

    // ── the metadata server ──────────────────────────────────────────────────────────────────
    if (url.startsWith('/computeMetadata/v1/')) {
      // The header is not decorative: the real server refuses a request without it, and a script
      // that forgot it would work against a lax fake and fail on the VM. So the fake refuses too.
      if (req.headers['metadata-flavor'] !== 'Google') {
        res.writeHead(403).end('Metadata-Flavor header required');
        return;
      }
      const path = url.slice('/computeMetadata/v1/'.length);
      if (path === 'project/project-id') return void res.writeHead(200).end(PROJECT);
      if (path === 'instance/service-accounts/default/email') return void res.writeHead(200).end(SA);
      if (path === 'instance/service-accounts/default/token') {
        return void res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ access_token: TOKEN, expires_in: 3599, token_type: 'Bearer' }));
      }
      return void res.writeHead(404).end('not found');
    }

    // ── Secret Manager ───────────────────────────────────────────────────────────────────────
    const match = url.match(/^\/v1\/projects\/([^/]+)\/secrets\/([^/]+)\/versions\/latest:access$/);
    if (match) {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.writeHead(401).end(JSON.stringify({ error: { code: 401, status: 'UNAUTHENTICATED' } }));
        return;
      }
      const [, project, name] = match;
      if (project !== PROJECT) return void res.writeHead(404).end('wrong project');
      const entry = secrets[name];
      if (entry === undefined) {
        // Exactly what a secret the identity cannot read looks like from here.
        return void res
          .writeHead(403, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED' } }));
      }
      return void res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          name: `projects/${PROJECT}/secrets/${name}/versions/1`,
          payload: { data: Buffer.from(entry, 'utf8').toString('base64'), dataCrc32c: '123' },
        }),
      );
    }
    res.writeHead(404).end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// Overridable so the harness can be pointed at a deliberately broken copy of the script and watched
// going red. A harness whose failures nobody has seen is the thing it exists to catch.
const SCRIPT = process.env.VOX_FETCH_SCRIPT ?? 'deploy/fetch-service-env.sh';

function runScript({ port, target, names }) {
  return new Promise((resolve) => {
    execFile(
      'bash',
      [SCRIPT, ...names],
      {
        env: {
          ...process.env,
          VOX_METADATA_BASE: `http://127.0.0.1:${port}/computeMetadata/v1`,
          VOX_SECRET_API_BASE: `http://127.0.0.1:${port}`,
          VOX_SERVICE_ENV_PATH: target,
        },
      },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }),
    );
  });
}

const NAMES = ['ELEVENLABS_API_KEY', 'VOX_GRANT_KEY', 'VOX_RUN_HMAC_KEY', 'VOX_RUN_KEY_ID', 'VOX_NETWORK_TOKEN'];
const GOOD = {
  ELEVENLABS_API_KEY: 'sk_elevenlabs_fake_0123456789abcdef',
  VOX_GRANT_KEY: 'a'.repeat(64),
  VOX_RUN_HMAC_KEY: 'b'.repeat(64),
  VOX_RUN_KEY_ID: 'vox-cloud-key-v1',
  VOX_NETWORK_TOKEN: 'c'.repeat(64),
};

const main = async () => {
  if (process.getuid?.() !== 0) {
    console.error('This harness must run as root: the script refuses to run as anyone else.');
    console.error('Run it inside a container — see the header of this file.');
    process.exit(2);
  }

  const dir = await mkdtemp(join(tmpdir(), 'vox-env-'));

  // ── 1: the happy path ──────────────────────────────────────────────────────────────────────
  console.log('\nall five readable:');
  {
    const { server, port } = await startFakes(GOOD);
    const target = join(dir, 'ok.env');
    const r = await runScript({ port, target, names: NAMES });
    server.close();
    check('exits 0', r.code === 0, r.stderr.trim());
    const body = await readFile(target, 'utf8');
    for (const n of NAMES) check(`${n} written`, body.includes(`${n}=${GOOD[n]}`));
    check('volume settings written', body.includes('VOX_VOLUME_ROOT=/var/lib/vox'));
    check('calibration path written', body.includes('VOX_CALIBRATION_PATH=/var/lib/vox/calibration.json'));
    const mode = (await stat(target)).mode & 0o777;
    check('mode is 0600', mode === 0o600, `got 0${mode.toString(8)}`);
    check('no secret value in stdout', !NAMES.some((n) => r.stdout.includes(GOOD[n])));
  }

  // ── 2: one secret unreadable ───────────────────────────────────────────────────────────────
  // The case that matters most: a partial file is worse than none, because the unit would start and
  // the service would fail on a missing variable behind a tunnel.
  console.log('\none secret not readable by the identity:');
  {
    const { VOX_NETWORK_TOKEN: _omitted, ...withoutOne } = GOOD;
    const { server, port } = await startFakes(withoutOne);
    const target = join(dir, 'partial.env');
    const r = await runScript({ port, target, names: NAMES });
    server.close();
    check('exits non-zero', r.code !== 0, `exit ${r.code}`);
    check('names the missing secret', r.stderr.includes('VOX_NETWORK_TOKEN'), r.stderr.trim());
    check('refuses to write a partial file', await stat(target).then(() => false, () => true));
  }

  // ── 3: a value --env-file cannot carry ─────────────────────────────────────────────────────
  console.log('\na secret value containing a newline:');
  {
    const { server, port } = await startFakes({ ...GOOD, VOX_GRANT_KEY: 'line-one\nline-two' });
    const target = join(dir, 'newline.env');
    const r = await runScript({ port, target, names: NAMES });
    server.close();
    check('exits non-zero', r.code !== 0, `exit ${r.code}`);
    check('says why', r.stderr.includes('newline'), r.stderr.trim());
    check('writes nothing', await stat(target).then(() => false, () => true));
  }

  // ── 4: an empty value ──────────────────────────────────────────────────────────────────────
  console.log('\na secret that decodes to nothing:');
  {
    const { server, port } = await startFakes({ ...GOOD, VOX_RUN_KEY_ID: '' });
    const target = join(dir, 'empty.env');
    const r = await runScript({ port, target, names: NAMES });
    server.close();
    check('exits non-zero', r.code !== 0, `exit ${r.code}`);
    check('writes nothing', await stat(target).then(() => false, () => true));
  }

  // ── 5: an existing file is not destroyed by a failed run ───────────────────────────────────
  // The staging-and-move is only worth having if this holds.
  console.log('\na failed run leaves the previous file intact:');
  {
    const target = join(dir, 'preserve.env');
    const first = await startFakes(GOOD);
    await runScript({ port: first.port, target, names: NAMES });
    first.server.close();
    const before = await readFile(target, 'utf8');

    const { VOX_GRANT_KEY: _gone, ...broken } = GOOD;
    const second = await startFakes(broken);
    const r = await runScript({ port: second.port, target, names: NAMES });
    second.server.close();
    check('the second run fails', r.code !== 0);
    check('the first run\'s file is untouched', (await readFile(target, 'utf8')) === before);
  }

  console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
};

await main();
