/**
 * The isolated proof agent inherits the harness process environment so that Windows and
 * whichever agent runtime is driving keep working. ADR-0007 keeps production credentials
 * outside everything the agent can read, and an environment variable is as readable as a
 * file, so the inherited environment is scrubbed before the agent is spawned and the result
 * is probed inside the sandbox rather than assumed.
 */

import { join, resolve } from 'node:path';

/** Production secrets that must never reach the agent, whatever else the machine defines. */
export const PRODUCTION_SECRET_VARIABLES = [
  'ELEVENLABS_API_KEY',
  'VOX_GRANT_KEY',
  'VOX_RUN_HMAC_KEY',
] as const;

/**
 * Anything credential-shaped goes too: the agent needs none of it, and the proof must not
 * depend on this machine happening to define only the secrets we thought of.
 */
const secretNamePattern =
  /(?:^|_)(?:API_?KEY|KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?)(?:_|$)/i;

/**
 * The agent's own runtime is not part of the production boundary, and an agent that cannot
 * reach its model cannot author anything at all. So one escape hatch, named prefix by prefix.
 *
 * `CODEX_`/`OPENAI_` were here first: the Codex CLI keeps its credentials in `auth.json`, and
 * the hatch was kept open for a release that reads its own key from the environment instead.
 * The crew is that case, not a hypothetical one — it holds a Google model key in the
 * environment and nowhere else, so `GOOGLE_`/`GEMINI_` join them. That admits
 * `GOOGLE_APPLICATION_CREDENTIALS` too, deliberately: it is the same credential by another
 * route, and admitting the key while stripping the service-account path would only produce a
 * crew that fails halfway through its first turn.
 *
 * What this hatch does *not* admit is a production secret wearing a runtime prefix. Both
 * `PRODUCTION_SECRET_VARIABLES` and the value-alias sweep below run regardless of name, so a
 * machine that exports `ELEVENLABS_API_KEY`'s value as `GOOGLE_API_KEY` still loses it.
 */
const agentRuntimePattern = /^(?:CODEX|OPENAI|GOOGLE|GEMINI)_/i;

const isSecretName = (name: string): boolean =>
  PRODUCTION_SECRET_VARIABLES.includes(name as (typeof PRODUCTION_SECRET_VARIABLES)[number]) ||
  (secretNamePattern.test(name) && !agentRuntimePattern.test(name));

/**
 * Removes credential-shaped variables, then removes any surviving variable that merely
 * *aliases* a production secret's value under an innocent name.
 */
export const scrubAgentEnvironment = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const secretValues = new Set(
    PRODUCTION_SECRET_VARIABLES.map((name) => source[name]).filter(
      (value): value is string => typeof value === 'string' && value.trim() !== '',
    ),
  );
  const scrubbed: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    if (isSecretName(name)) continue;
    if (typeof value === 'string' && secretValues.has(value)) continue;
    scrubbed[name] = value;
  }
  return scrubbed;
};

/**
 * Credential stores on this machine that the agent must not be able to read. Pure so the
 * candidate list is testable; the caller keeps only the ones that actually exist, because a
 * probe pointed at an absent file reports "denied" for the wrong reason and is worse than no
 * probe at all.
 *
 * Both runtimes are listed rather than the one that happens to be driving: the boundary is
 * about credential stores in general, and a probe that only knows about the runtime it was
 * written for stops being falsifiable the moment a different one drives the proof.
 */
export const credentialStoreCandidates = (
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
): string[] => {
  const candidates = [
    // Google application default credentials, and a service-account key when one is named.
    environment.GOOGLE_APPLICATION_CREDENTIALS,
    join(
      environment.CLOUDSDK_CONFIG ?? join(environment.APPDATA ?? homeDirectory, 'gcloud'),
      'application_default_credentials.json',
    ),
    // The Codex CLI's own store, which the frozen paid proofs probed.
    join(environment.CODEX_HOME ?? join(homeDirectory, '.codex'), 'auth.json'),
  ].filter((path): path is string => typeof path === 'string' && path.trim() !== '');
  return [...new Set(candidates.map((path) => resolve(path)))];
};

/**
 * Whether one credential-store probe proves denial. A probe that timed out proves nothing, and
 * a probe that exited zero read the file — which is the breach this assertion exists to catch.
 */
export const credentialStoreDenied = (probe: {
  exitCode: number;
  timedOut: boolean;
}): boolean => probe.exitCode !== 0 && !probe.timedOut;

/**
 * Names the variables a scrubbed environment should no longer define. Reported as names only
 * so that a failure never writes a secret value into the evidence bundle.
 */
export const remainingSecretVariables = (environment: NodeJS.ProcessEnv): string[] =>
  Object.keys(environment).filter(isSecretName).sort();
