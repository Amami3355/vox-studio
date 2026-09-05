// The container's own smoke check, run from inside it.
//
// Run through tsx rather than node: this script imports TypeScript modules — the signing text it
// signs with, and the network adapter it asserts.
//
// This is the "builds, boots, and rejects a malformed request, reaching no model or network"
// assertion from cloud-phase ticket 01's testing decisions, applied to this service. It runs
// inside the container because the host binds loopback only — there is no port to publish, and
// that is the point rather than an inconvenience.
//
//   docker cp deploy/container-smoke.mjs <container>:/tmp/smoke.mjs
//   docker exec <container> /app/packages/production/node_modules/.bin/tsx /tmp/smoke.mjs
//
// Exit 0 means every case below behaved. Any other exit is a failure and prints which.
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { connect } from 'node:net';
/**
 * **The signing text is imported, not reproduced.**
 *
 * This file used to carry its own `field()` and `signingText()` under a comment promising they
 * were "kept in step with `authentication.ts`". Nothing enforced that promise, and the two had
 * already parted: the copy here serialised the payload with `JSON.stringify` where the real one
 * canonicalises it. Only a `null` payload hid it.
 *
 * A drift in a *test's* copy of the signing text is not a failing test. It is a forged-MAC check
 * and a replay check that both go green while asserting nothing — the container answers no
 * request either way, so every refusal below stays a refusal and the control is the only thing
 * that would notice. That is the exact shape this phase keeps naming, in the one file whose whole
 * job is to prove the boundary holds.
 *
 * The import is possible because this script already runs under `tsx`, which is why the adapter
 * check below can reach a `.ts` module at all.
 */
import {
  payloadRequestSigningText,
  signIpc,
} from '/app/packages/production/src/ipc/authentication.ts';

const SECRET = process.env.VOX_NETWORK_TOKEN;
const PORT = Number(process.env.VOX_NETWORK_PORT ?? 8080);

const signed = (command) => {
  const unsigned = {
    protocolVersion: 1,
    requestId: randomUUID(),
    timestampMs: Date.now(),
    command,
    runId: null,
    payload: null,
  };
  return { ...unsigned, mac: signIpc(SECRET, payloadRequestSigningText(unsigned)) };
};

const post = (body) =>
  new Promise((resolve) => {
    const encoded = Buffer.from(JSON.stringify(body), 'utf8');
    const call = request(
      {
        host: '127.0.0.1',
        port: PORT,
        method: 'POST',
        path: '/command',
        headers: { 'content-type': 'application/json', 'content-length': encoded.byteLength },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    call.on('error', (error) => resolve({ status: 0, error: error.code ?? error.message }));
    call.end(encoded);
  });

const failures = [];
const check = (name, condition, detail) => {
  if (condition) console.info(`ok   ${name}`);
  else {
    console.info(`FAIL ${name}: ${detail}`);
    failures.push(name);
  }
};

/**
 * **A refusal is not the absence of a listener, and the first version of this script could not
 * tell them apart.**
 *
 * Every refusal below arrives as a transport error, because the host destroys the socket rather
 * than answering with a status code. But so does a service that never started: `post()` returns
 * `status: 0` either way. Run against a container whose service was still binding, this script
 * reported "malformed request is refused" three times and a green line for each — a check that
 * passed while proving nothing, which is the exact failure this phase keeps naming.
 *
 * Two fixes, and both are needed. First, wait for the port and fail loudly if it never comes up.
 * Second, require a refusal to be `ECONNRESET`/`EPIPE` — the host closing an accepted connection —
 * and never `ECONNREFUSED`, which means nothing was there to refuse.
 */
const REFUSAL_CODES = new Set(['ECONNRESET', 'EPIPE', 'ECONNABORTED']);
const refused = (result) => result.status === 0 && REFUSAL_CODES.has(result.error);

const waitForPort = async (attempts = 40) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const up = await new Promise((resolve) => {
      const socket = connect({ host: '127.0.0.1', port: PORT, timeout: 1000 });
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => resolve(false));
    });
    if (up) return true;
    await new Promise((wake) => setTimeout(wake, 250));
  }
  return false;
};

const ready = await waitForPort();
check('the service is listening before anything is asserted', ready, `nothing on port ${PORT}`);
if (!ready) {
  console.info('\nrefusing to report on a service that never started');
  process.exit(1);
}

// A malformed body is refused by dropping the socket, not by a status code: a reason is an oracle.
const malformed = await post({ command: 'contract.index' });
check('malformed request is refused', refused(malformed), JSON.stringify(malformed));

// A forged MAC is refused the same way, and indistinguishably.
const forged = { ...signed('contract.index'), mac: '0'.repeat(64) };
const bad = await post(forged);
check('forged mac is refused', refused(bad), JSON.stringify(bad));

// A signed request is answered. This is the control: without it the two refusals above would
// pass against a service that was simply broken.
const good = await post(signed('contract.index'));
check('signed request is answered', good.status === 200, JSON.stringify(good).slice(0, 200));

// The response is the envelope the argv transport produces, so the container is serving the same
// surface rather than something that merely returns 200.
let envelope = null;
if (good.status === 200) {
  const parsed = JSON.parse(good.text);
  envelope = JSON.parse(Buffer.from(parsed.stdoutBase64, 'base64').toString('utf8'));
}
check(
  'the answer is a succeeded contract.index envelope',
  envelope?.command === 'contract.index' && envelope?.outcome === 'succeeded',
  JSON.stringify(envelope).slice(0, 200),
);

// A replayed request id is refused, which is the in-process replay cache doing its job. One
// container is one cache — see ADR-0018 decision 8 on why that means one instance.
const once = signed('contract.index');
await post(once);
const replayed = await post(once);
check('replayed request id is refused', refused(replayed), JSON.stringify(replayed));

// ---------------------------------------------------------------------------------------------
// The denying network adapter, asserted with the network *available*.
//
// ADR-0018 decision 8: "A non-`record` command attempting egress and being refused **by the
// adapter**, demonstrated independently of the egress rule. A test that passes only because the
// network was unavailable has not tested the adapter."
//
// So the control comes first. If the container cannot reach the network at all, the refusal below
// proves nothing and this script says so rather than reporting a pass.
const reachable = await new Promise((resolve) => {
  const socket = connect({ host: '8.8.8.8', port: 53, timeout: 4000 });
  socket.on('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.on('timeout', () => {
    socket.destroy();
    resolve(false);
  });
  socket.on('error', () => resolve(false));
});
check(
  'CONTROL: the container can reach the network, so the refusal below is the adapter',
  reachable,
  'no egress from this container — the adapter assertion would be vacuous',
);

const { deniedNetworkAdapter } = await import(
  '/app/packages/production/src/ipc/service-configuration.ts'
);
const refusal = await deniedNetworkAdapter.request().then(
  () => null,
  (error) => error,
);
check(
  'the service network adapter refuses, with egress available',
  refusal instanceof Error && refusal.message === 'NETWORK_POLICY_DENIED',
  String(refusal),
);

// **What the two checks above do not prove, said here rather than left to be assumed.**
//
// This asserts the adapter *object*, imported into this process, with egress demonstrably
// available. It does not dispatch a command through the listening service, so it is not evidence
// that the running host was constructed with this adapter rather than another — that wiring is
// asserted in-process by `packages/production/tests/cloud-host.test.ts`, against the same assembly
// the container runs.
//
// ADR-0018 decision 8's criterion is a *non-`record` command* attempting egress and being refused.
// Read strictly, this is narrower than that, and the checklist in deploy/README.md records it as
// evidence toward the item rather than as the item. A green line here is not a conformance run.

console.info(failures.length === 0 ? '\nall checks passed' : `\n${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
