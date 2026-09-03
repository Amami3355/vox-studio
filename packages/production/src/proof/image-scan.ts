import { readFile, readdir } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import type { LeakScan } from './evidence';

/**
 * The leak scan the *image* can carry, as distinct from the one the agent distribution carries.
 *
 * **Why this is not `scanReadableFiles`.** That scan answers *may the agent read this?* and so
 * forbids the `.ts` extension, the marker `ProductionCommandService`, and any repository path. The
 * image is the production runtime: it is made of `.ts` files, it contains that class, and it is
 * built at `/app`. Running that scan over image layers would fail on nearly every file — not
 * because the image leaks anything, but because the two artifacts have opposite contents by
 * design. A gate that has to be suppressed to pass teaches everyone to suppress it.
 *
 * ADR-0018 decision 8 was written as "the leak scan, run over the image's readable layers", which
 * cannot be executed as stated. It is corrected there, and this is what replaces it: an image must
 * carry **no secret material** and **no agent distribution**. Both are real, both are things a
 * careless `COPY . .` actually produces, and both can fail.
 */

/**
 * Files whose presence is the finding, regardless of content. Matched on basename because the
 * offence is the artifact, not where someone put it.
 */
const CREDENTIAL_FILENAMES = new Set([
  'credentials.json',
  'service-account.json',
  'service_account.json',
  'id_rsa',
  'id_ed25519',
  '.npmrc',
  '.netrc',
]);

const CREDENTIAL_EXTENSIONS = ['.pem', '.p12', '.pfx', '.key'];

/**
 * The secret-bearing variables. **Naming one is permitted and necessary** — the Dockerfile, the
 * cloud-init unit and the runbook all must name them. *Assigning* one a value is the finding, so
 * the pattern requires an `=` and something substantial after it.
 *
 * `VOX_BROWSER_EXECUTABLE` is deliberately absent: it is a path, not a secret, and the image is
 * supposed to set it.
 */
const SECRET_NAMES = [
  'ELEVENLABS_API_KEY',
  'VOX_GRANT_KEY',
  'VOX_RUN_HMAC_KEY',
  'VOX_NETWORK_TOKEN',
  'VOX_IPC_TOKEN',
] as const;

/**
 * The minimum length of something worth calling a secret. Short fake values in fixtures —
 * `'grant-key'`, `'eleven-key'` — are not credentials and flagging them is how a scan gets
 * switched off.
 */
const SECRET_MIN_LENGTH = 12;

/**
 * Two shapes, deliberately different, because the first version of this scan conflated them and
 * reported `VOX_IPC_TOKEN: ipcSecret` in `harness.ts` as a baked secret. **It is an assignment to
 * an identifier**, which is source code doing its job — the proof harness forwarding a token to a
 * process it spawns. A scan that reports that is a scan nobody runs.
 *
 * - **`NAME=value`** — shell, dotenv, `ENV` in a Dockerfile. There are no identifiers in those
 *   files, so an unquoted value counts. `$VAR` and `${VAR}` are interpolation, not a value.
 * - **`NAME: value`** — YAML and JavaScript object literals share this shape, and only one of them
 *   can hold a secret. So the value must be **quoted** to count. `VOX_IPC_TOKEN: ipcSecret` and
 *   `VOX_IPC_TOKEN: string` are then correctly silent, and `VOX_IPC_TOKEN: "sk-live-…"` is not.
 */
const assignedSecretPatterns = (name: string): RegExp[] => [
  new RegExp(`${name}\\s*=\\s*["']?(?![$])[^\\s"'#]{${SECRET_MIN_LENGTH},}`),
  // `[^"']` matches newlines — a negated class is not `.` — so an earlier version of this pattern
  // ran from a quote on one line to a quote several lines later, and reported ticket 03's
  // provisioning wizard as holding a baked secret because it passes secret *names* as quoted
  // prompt strings. A value is on one line; the class now says so.
  //
  // The example is described rather than quoted here on purpose: this file is scanned like every
  // other, and a comment containing the offending byte sequence would flag itself. It did.
  new RegExp(`${name}\\s*:\\s*["'](?![$])[^"'\\r\\n]{${SECRET_MIN_LENGTH},}["']`),
];

/**
 * Skipped by default.
 *
 * `node_modules` is installed from the committed lockfile inside the image — it is third-party
 * code, it is not what a careless `COPY . .` leaks, and reading every byte of a gigabyte of it
 * turns this scan into something nobody runs. The leak surface is the repository's own content.
 * Named here rather than left implicit, because a scan's exclusions are part of what it claims.
 */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.pnpm-store']);

const walk = async (root: string, skip: Set<string>): Promise<string[]> => {
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue;
      paths.push(...(await walk(path, skip)));
    } else if (entry.isFile()) paths.push(path);
  }
  return paths.sort();
};

export const scanImageFiles = async (
  root: string,
  { skip = SKIPPED_DIRECTORIES }: { skip?: Set<string> } = {},
): Promise<LeakScan> => {
  const absolute = resolve(root);
  const files = await walk(absolute, skip);
  const violations: string[] = [];

  for (const path of files) {
    const item = relative(absolute, path).replaceAll('\\', '/');
    const name = basename(path).toLowerCase();

    // An environment file in an image is a baked secret whether or not it currently holds one:
    // it is the mechanism by which one arrives, and the runtime binds the environment instead.
    if (name === '.env' || name.startsWith('.env.')) {
      violations.push(`${item}:env-file`);
    }
    if (CREDENTIAL_FILENAMES.has(name) || CREDENTIAL_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      violations.push(`${item}:credential-file`);
    }
    // The agent and the trusted service are different trust domains. The agent's distribution
    // travelling inside the service image is the code-blindness regression containerisation
    // could quietly cause, so it is named rather than inferred.
    if (/(^|\/)dist\/agent\//.test(item)) {
      violations.push(`${item}:agent-distribution`);
    }

    const text = (await readFile(path)).toString('latin1');
    for (const secret of SECRET_NAMES) {
      if (assignedSecretPatterns(secret).some((pattern) => pattern.test(text))) {
        violations.push(`${item}:assigned-secret:${secret}`);
      }
    }
  }

  return {
    pass: violations.length === 0,
    scanned: files.map((path) => relative(absolute, path).replaceAll('\\', '/')),
    violations,
  };
};
