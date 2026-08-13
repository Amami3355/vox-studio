/**
 * The isolated proof agent inherits the harness process environment so that Windows and the
 * Codex runtime keep working. ADR-0007 keeps production credentials outside everything the
 * agent can read, and an environment variable is as readable as a file, so the inherited
 * environment is scrubbed before the agent is spawned and the result is probed inside the
 * sandbox rather than assumed.
 */

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
 * The Codex CLI is the agent's own runtime, not part of the production boundary. Its
 * credentials live in `auth.json`, but keep the escape hatch so a future release that reads
 * its own key from the environment does not silently lose its ability to run.
 */
const agentRuntimePattern = /^(?:CODEX|OPENAI)_/i;

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
 * Names the variables a scrubbed environment should no longer define. Reported as names only
 * so that a failure never writes a secret value into the evidence bundle.
 */
export const remainingSecretVariables = (environment: NodeJS.ProcessEnv): string[] =>
  Object.keys(environment).filter(isSecretName).sort();
