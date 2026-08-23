import { execFile, spawn } from 'node:child_process';
import { access, rm } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import {
  PRODUCTION_SECRET_VARIABLES,
  credentialStoreDenied,
  scrubAgentEnvironment,
} from './agent-environment';
import type { AgentDriver, AgentSandboxEvidence } from './harness';
import { NORTHBRIDGE_TASK_MESSAGE } from './northbridge';

const execFileAsync = promisify(execFile);
const proofProfile = 'vox-code-blind-proof';
const defaultModel = 'gpt-5.6-sol';

type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

const windowsSystemPath = (workRoot: string) =>
  [
    workRoot,
    'C:\\Windows\\System32',
    'C:\\Windows',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
  ].join(delimiter);

const profileDefinitionOverrides = () => [
  '-c',
  `permissions.${proofProfile}.filesystem={ ":minimal"="read", ":workspace_roots"={ "."="write" } }`,
  '-c',
  `permissions.${proofProfile}.network.enabled=false`,
  '-c',
  'windows.sandbox="elevated"',
];

export const codexProofSandboxArguments = (workRoot: string, command: string[]) => [
  'sandbox',
  '-P',
  proofProfile,
  ...profileDefinitionOverrides(),
  '-C',
  workRoot,
  ...command,
];

const permissionOverrides = () => [
  '-c',
  `default_permissions="${proofProfile}"`,
  ...profileDefinitionOverrides(),
];

const agentOverrides = () => [
  '-c',
  'approval_policy="never"',
  ...permissionOverrides(),
  '-c',
  'allow_login_shell=false',
  '-c',
  'web_search="disabled"',
  '-c',
  'features.apps=false',
  '-c',
  'features.plugins=false',
  '-c',
  'features.multi_agent=false',
  '-c',
  'analytics.enabled=false',
  '-c',
  'shell_environment_policy={ inherit="all", ignore_default_excludes=true, filters={ PATH="include", PATHEXT="include", SystemRoot="include", WINDIR="include", ComSpec="include", TEMP="include", TMP="include", VOX_PIPE_NAME="include", VOX_IPC_TOKEN="include" } }',
];

export const codexProofExecArguments = (workRoot: string, model: string, prompt: string) => [
  'exec',
  '--json',
  '--ephemeral',
  '--ignore-user-config',
  '--ignore-rules',
  '--skip-git-repo-check',
  '--strict-config',
  '--cd',
  workRoot,
  '--sandbox',
  'workspace-write',
  '--model',
  model,
  ...agentOverrides(),
  prompt,
];

const resolveCodex = async () => {
  if (process.env.VOX_PROOF_CODEX_BIN) return process.env.VOX_PROOF_CODEX_BIN;
  const located = await execFileAsync('where.exe', ['codex'], { windowsHide: true });
  const path = located.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
  if (!path) throw new Error('PROOF_CODEX_CLI_NOT_FOUND');
  return path;
};

const run = async (
  executable: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout?: number },
): Promise<ProcessResult> => {
  try {
    const result = await execFileAsync(executable, args, {
      cwd: options.cwd,
      env: options.env,
      maxBuffer: 8 * 1024 * 1024,
      timeout: options.timeout ?? 30_000,
      windowsHide: true,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr, timedOut: false };
  } catch (error) {
    const failure = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string;
    };
    return {
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? String(failure.code ?? 'unknown failure'),
      timedOut:
        failure.killed === true ||
        failure.code === 'ETIMEDOUT' ||
        typeof failure.signal === 'string',
    };
  }
};

const sandboxCommand = (
  codex: string,
  workRoot: string,
  env: NodeJS.ProcessEnv,
  command: string[],
  timeout = 30_000,
) => run(codex, codexProofSandboxArguments(workRoot, command), { cwd: workRoot, env, timeout });

/**
 * Reports one secret's presence as a word, never its value, so that a probe which catches a
 * leak cannot itself write the secret into the evidence bundle. One variable per invocation:
 * `&` chaining does not survive the sandbox argument boundary, and a probe whose later halves
 * were silently dropped would read as reassuring emptiness. `ABSENT:` is positive evidence
 * that the probe ran, which silence would not be.
 */
export const credentialsEnvironmentProbeCommand = (name: string) =>
  `if defined ${name} (echo PRESENT:${name}) else (echo ABSENT:${name})`;

const compactProbe = (result: ProcessResult) => ({
  exitCode: result.exitCode,
  stdout: result.stdout,
  stderr: result.stderr,
  timedOut: result.timedOut,
});

export const sandboxWorkRootIsUsable = (input: {
  expectedRoot: string;
  cwdProbe: ProcessResult;
  writeProbe: ProcessResult;
  markerPresent: boolean;
}): boolean =>
  input.cwdProbe.exitCode === 0 &&
  !input.cwdProbe.timedOut &&
  input.writeProbe.exitCode === 0 &&
  !input.writeProbe.timedOut &&
  input.markerPresent &&
  input.cwdProbe.stdout.trim().toLowerCase() === input.expectedRoot.toLowerCase();

const verifySandbox = async (input: {
  codex: string;
  workRoot: string;
  repositoryProbePath: string;
  serviceProbePath: string;
  /** Possibly empty: a machine with no credential store cannot evidence this boundary. */
  credentialStoreProbePaths: string[];
  environment: NodeJS.ProcessEnv;
}): Promise<AgentSandboxEvidence> => {
  await Promise.all([
    access(input.repositoryProbePath),
    access(input.serviceProbePath),
    ...input.credentialStoreProbePaths.map((path) => access(path)),
    access('C:\\Windows\\System32\\curl.exe'),
  ]);
  const marker = join(input.workRoot, '.codex-sandbox-write-probe');
  const workingDirectory = await sandboxCommand(
    input.codex,
    input.workRoot,
    input.environment,
    ['cmd.exe', '/d', '/c', 'cd'],
    5 * 60_000,
  );
  const workRoot = await sandboxCommand(
    input.codex,
    input.workRoot,
    input.environment,
    ['cmd.exe', '/d', '/c', 'type nul > .codex-sandbox-write-probe'],
    5 * 60_000,
  );
  const markerPresent = await access(marker).then(
    () => true,
    () => false,
  );
  if (
    !sandboxWorkRootIsUsable({
      expectedRoot: input.workRoot,
      cwdProbe: workingDirectory,
      writeProbe: workRoot,
      markerPresent,
    })
  ) {
    await rm(marker, { force: true });
    throw new Error(
      `PROOF_CODEX_SANDBOX_UNAVAILABLE:${JSON.stringify({
        workingDirectory: compactProbe(workingDirectory),
        write: compactProbe(workRoot),
        markerPresent,
      })}`,
    );
  }
  const probes = {
    workingDirectory,
    workRoot,
    repository: await sandboxCommand(input.codex, input.workRoot, input.environment, [
      'cmd.exe',
      '/d',
      '/c',
      `type "${input.repositoryProbePath}"`,
    ]),
    service: await sandboxCommand(input.codex, input.workRoot, input.environment, [
      'cmd.exe',
      '/d',
      '/c',
      `dir /b "${input.serviceProbePath}"`,
    ]),
    ...Object.fromEntries(
      await Promise.all(
        input.credentialStoreProbePaths.map(
          async (path) =>
            [
              `credentialStore:${path}`,
              await sandboxCommand(input.codex, input.workRoot, input.environment, [
                'cmd.exe',
                '/d',
                '/c',
                `type "${path}"`,
              ]),
            ] as const,
        ),
      ),
    ),
    network: await sandboxCommand(input.codex, input.workRoot, input.environment, [
      'curl.exe',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '3',
      'https://example.com/',
    ]),
    ...Object.fromEntries(
      await Promise.all(
        PRODUCTION_SECRET_VARIABLES.map(
          async (name) =>
            [
              `credentialsEnvironment:${name}`,
              await sandboxCommand(input.codex, input.workRoot, input.environment, [
                'cmd.exe',
                '/d',
                '/c',
                credentialsEnvironmentProbeCommand(name),
              ]),
            ] as const,
        ),
      ),
    ),
  };
  const evidence: AgentSandboxEvidence = {
    backend: 'codex-windows-elevated',
    workRootReadWrite: sandboxWorkRootIsUsable({
      expectedRoot: input.workRoot,
      cwdProbe: probes.workingDirectory,
      writeProbe: probes.workRoot,
      markerPresent,
    }),
    repositoryDenied: probes.repository.exitCode !== 0 && !probes.repository.timedOut,
    serviceDenied: probes.service.exitCode !== 0 && !probes.service.timedOut,
    // Null when this machine holds no credential store: a boundary nothing was pointed at was
    // not tested, and reporting it as denied is exactly the vacuous pass this probe exists to
    // avoid. Otherwise every store must have been refused.
    credentialsDenied:
      input.credentialStoreProbePaths.length === 0
        ? null
        : input.credentialStoreProbePaths.every((path) => {
            const result = probes[`credentialStore:${path}` as keyof typeof probes];
            return result !== undefined && credentialStoreDenied(result);
          }),
    // Fail closed: every secret needs its own probe to have actually run and said ABSENT.
    // A missing, empty or errored probe is not evidence of absence.
    credentialsEnvironmentDenied: PRODUCTION_SECRET_VARIABLES.every((name) => {
      const result = probes[`credentialsEnvironment:${name}` as keyof typeof probes];
      return (
        result !== undefined &&
        result.exitCode === 0 &&
        !result.timedOut &&
        result.stdout.includes(`ABSENT:${name}`) &&
        !result.stdout.includes('PRESENT:')
      );
    }),
    directNetworkDenied: probes.network.exitCode !== 0 && !probes.network.timedOut,
    probes: Object.fromEntries(
      Object.entries(probes).map(([name, result]) => [name, compactProbe(result)]),
    ),
  };
  await rm(marker, { force: true });
  if (
    !evidence.workRootReadWrite ||
    !evidence.repositoryDenied ||
    !evidence.serviceDenied ||
    // `false` aborts; `null` does not, because there was nothing here to measure. The run still
    // reports that gap: the assertion sheet scores an unmeasured boundary as not evidenced.
    evidence.credentialsDenied === false ||
    // Aborts before the agent can reach the one quota-bearing command, so a credential leak
    // costs nothing instead of being discovered in the assertions after the money is spent.
    !evidence.credentialsEnvironmentDenied ||
    !evidence.directNetworkDenied
  ) {
    throw new Error(`PROOF_CODEX_SANDBOX_PREFLIGHT_FAILED:${JSON.stringify(evidence)}`);
  }
  return evidence;
};

const appendJsonLines = (value: string, transcript: unknown[]) => {
  for (const line of value.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      transcript.push(JSON.parse(line));
    } catch {
      transcript.push({ type: 'codex.raw-output', text: line });
    }
  }
};

const executeCodex = async (input: {
  codex: string;
  workRoot: string;
  environment: NodeJS.ProcessEnv;
  transcript: unknown[];
  model: string;
}) => {
  const args = codexProofExecArguments(input.workRoot, input.model, NORTHBRIDGE_TASK_MESSAGE);
  return new Promise<ProcessResult>((resolvePromise, reject) => {
    const child = spawn(input.codex, args, {
      cwd: input.workRoot,
      env: input.environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let stdoutRemainder = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('PROOF_CODEX_AGENT_TIMEOUT'));
    }, 30 * 60_000);
    child.stdout.on('data', (chunk: Buffer) => {
      const combined = `${stdoutRemainder}${chunk.toString('utf8')}`;
      const lines = combined.split(/\r?\n/u);
      stdoutRemainder = lines.pop() ?? '';
      appendJsonLines(lines.join('\n'), input.transcript);
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      appendJsonLines(stdoutRemainder, input.transcript);
      resolvePromise({ exitCode: code ?? 1, stdout, stderr, timedOut: false });
    });
  });
};

const terminalEventObserved = (transcript: unknown[]) =>
  transcript.some(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      'type' in entry &&
      (entry as { type?: unknown }).type === 'turn.completed',
  );

export const createCodexAgentDriver =
  (options: { model?: string } = {}): AgentDriver =>
  async ({
    workRoot,
    transcript,
    launcherEnvironment,
    repositoryProbePath,
    serviceProbePath,
    credentialStoreProbePaths,
  }) => {
    const codex = await resolveCodex();
    // Scrub first, then re-apply the launcher capability: VOX_IPC_TOKEN is the authenticated
    // IPC handle the agent is *meant* to hold, and it must survive the credential scrub.
    const environment = {
      ...scrubAgentEnvironment(process.env),
      ...launcherEnvironment,
      PATH: windowsSystemPath(workRoot),
      TEMP: workRoot,
      TMP: workRoot,
    };
    const sandboxEvidence = await verifySandbox({
      codex,
      workRoot,
      repositoryProbePath,
      serviceProbePath,
      credentialStoreProbePaths,
      environment,
    });
    const version = await run(codex, ['--version'], { cwd: workRoot, env: environment });
    if (version.exitCode !== 0) throw new Error('PROOF_CODEX_VERSION_UNAVAILABLE');
    const model = options.model ?? process.env.VOX_PROOF_CODEX_MODEL ?? defaultModel;
    const result = await executeCodex({ codex, workRoot, environment, transcript, model });
    if (result.stderr.trim()) {
      transcript.push({ type: 'codex.stderr', text: result.stderr });
    }
    if (result.exitCode !== 0) {
      throw new Error(`PROOF_CODEX_AGENT_FAILED:${result.exitCode}`);
    }
    return {
      authorship: 'fresh-generalist',
      unscripted: true,
      humanHints: 0,
      model,
      modelVersion: version.stdout.trim(),
      transcriptComplete: terminalEventObserved(transcript),
      directNetworkDenied: sandboxEvidence.directNetworkDenied,
      directNetworkEvents: [],
      sandboxEvidence,
    };
  };
