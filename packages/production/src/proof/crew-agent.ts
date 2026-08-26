/**
 * The driver that reaches the Python crew from the proof harness.
 *
 * It is TypeScript and it lives here rather than with the crew, because a driver belongs to the
 * harness: what it knows is how to start an agent and what to report about the one it started,
 * and both of those are the harness's business. The crew knows none of it.
 *
 * **The crew spawns its own commands, and that is why this file is short.** The harness's audit
 * sits on the IPC host rather than on the `invoke` it hands a driver, so every `vox.exe` the
 * crew starts for itself is recorded as an agent command with no cooperation from either side.
 * A driver that had to relay commands would be a second implementation of the command surface,
 * and the crew would be proving the relay rather than the interface.
 *
 * **Its isolation is not measured, and the sheet says so.** The crew runs as this user, in a
 * plain subprocess, with no sandbox backend: `RestrictedRunner` is a SAFER constrained token
 * that loads one managed assembly, and the elevated backend belongs to Codex. So this driver
 * returns `sandboxEvidence: null` and the isolation assertions score `not-evidenced` — the
 * honest word for a boundary nothing was pointed at. Code-blindness is convention for crew
 * runs, and the project may not claim it for them (review decision 1).
 */

import { execFile, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { scrubAgentEnvironment } from './agent-environment';
import type { AgentDriver } from './harness';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../..');

/** Where `pip install -e` put the crew, which is the interpreter that can import it. */
const crewInterpreter = resolve(repositoryRoot, 'services/agents/.venv/Scripts/python.exe');

/** The bundle the crew leaves, named relative to the work root the crew is handed. */
export const CREW_EVIDENCE = 'crew-evidence';

/**
 * The plan file the crew is handed on the deterministic path, and nothing else reads it.
 *
 * The harness scores the plan the Run is bound to (`readBoundPlan`), so this name is now a
 * detail between this driver and the crew rather than a contract the harness depends on. That
 * is what makes the live path possible: a crew whose model authors the plan submits it from
 * wherever it kept it and leaves nothing here, and the harness scores it all the same.
 */
export const CREW_PLAN = 'plan.json';

export const crewProofArguments = (input: {
  workRoot: string;
  evidence: string;
  plan?: string;
  model?: string;
}): string[] => [
  '-m',
  'vox_crew',
  '--work-root',
  input.workRoot,
  '--evidence',
  input.evidence,
  ...(input.plan === undefined ? [] : ['--plan', input.plan]),
  // Absent unless a run chose one, so the crew's own pinned default is the single place the
  // model name lives. The crew refuses the two together: a handed plan reaches no model.
  ...(input.model === undefined ? [] : ['--model', input.model]),
];

/**
 * The crew is spawned with the harness's environment scrubbed of everything on production's
 * side of ADR-0007, then handed back the one capability it is meant to hold — the authenticated
 * pipe — and confined to the work root for anything temporary it writes.
 *
 * `PATH` keeps its inherited value rather than being narrowed to the system directories the
 * Codex driver uses: the crew is started by absolute interpreter path and needs whatever that
 * interpreter needs, and narrowing it here would be isolation theatre in a run that evidences
 * no isolation at all.
 */
export const crewProofEnvironment = (
  source: NodeJS.ProcessEnv,
  launcherEnvironment: { VOX_PIPE_NAME: string; VOX_IPC_TOKEN: string },
  workRoot: string,
): NodeJS.ProcessEnv => ({
  ...scrubAgentEnvironment(source),
  ...launcherEnvironment,
  PATH: [workRoot, source.PATH ?? ''].filter(Boolean).join(delimiter),
  TEMP: workRoot,
  TMP: workRoot,
  // The envelopes are UTF-8 and stdout is the record of them, so the interpreter is not left
  // to pick an encoding from the console it was started under.
  PYTHONIOENCODING: 'utf-8',
});

/**
 * The agent identity the harness records for a crew run: the runtime, and the model when this
 * run chose one. An unnamed model is the crew's pinned default, and the crew's own bundle is
 * where that name is written down — the harness never guesses at it.
 */
export const crewAgentName = (plan: unknown, model?: string): string =>
  plan !== undefined
    ? 'vox-crew/handed-plan'
    : `vox-crew/adk${model === undefined ? '' : `:${model}`}`;

/**
 * What a run may claim about who wrote the plan. A handed plan is scripted however much of the
 * rest of the crew ran, because `agent.unscripted-generalist` is an assertion about authorship
 * and nothing else — and it is the assertion the deterministic run is expected to fail.
 */
export const crewAuthorship = (
  plan: unknown,
): { authorship: 'fixture-scripted' | 'fresh-generalist'; unscripted: boolean } =>
  plan === undefined
    ? { authorship: 'fresh-generalist', unscripted: true }
    : { authorship: 'fixture-scripted', unscripted: false };

type CrewResult = { exitCode: number; stdout: string; stderr: string };

const runCrew = (
  executable: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<CrewResult> =>
  new Promise<CrewResult>((settle, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('PROOF_CREW_AGENT_TIMEOUT'));
    }, options.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
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
      settle({ exitCode: code ?? 1, stdout, stderr });
    });
  });

/**
 * The crew's own transcript, read back out of the bundle it wrote.
 *
 * The harness's `agent-transcript.jsonl` is what an auditor reads to see what the agent did, and
 * for the crew that account already exists: `evidence.py` assembles it from the envelopes the
 * convergence saw. Copying it across means the harness bundle carries the crew's real account
 * rather than a driver's summary of one, and the two bundles say the same thing about the same
 * Run because they were written from the same source.
 */
const crewTranscript = async (bundleRoot: string): Promise<unknown[]> => {
  const raw = await readFile(join(bundleRoot, 'agent-transcript.jsonl'), 'utf8').catch(() => null);
  if (raw === null) return [];
  return raw
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as unknown);
};

export const createCrewAgentDriver =
  (
    options: {
      /**
       * The plan to hand the crew. Omit it and the crew authors one through its model, which
       * needs that runtime's credential in this process's environment and is neither free nor
       * deterministic.
       */
      plan?: unknown;
      /**
       * The model the crew should author on, when this run wants something other than the
       * crew's pinned default. Meaningless with `plan` — the crew refuses the pair — and left
       * unset for the deterministic run, which reaches no model at all.
       */
      model?: string;
      interpreter?: string;
      evidence?: string;
      timeoutMs?: number;
    } = {},
  ): AgentDriver =>
  async ({ workRoot, transcript, launcherEnvironment }) => {
    const interpreter = options.interpreter ?? process.env.VOX_PROOF_CREW_PYTHON ?? crewInterpreter;
    const evidence = options.evidence ?? CREW_EVIDENCE;
    if (options.plan !== undefined) {
      await writeFile(
        join(workRoot, CREW_PLAN),
        `${JSON.stringify(options.plan, null, 2)}\n`,
        'utf8',
      );
    }
    const version = await execFileAsync(interpreter, ['--version'], { windowsHide: true });
    const started = await runCrew(
      interpreter,
      crewProofArguments({
        workRoot,
        evidence,
        plan: options.plan === undefined ? undefined : CREW_PLAN,
        model: options.model,
      }),
      {
        cwd: workRoot,
        env: crewProofEnvironment(process.env, launcherEnvironment, workRoot),
        timeoutMs: options.timeoutMs ?? 30 * 60_000,
      },
    );
    // Everything the crew said about the run goes to stderr, and it is the only account of a
    // failure that exists before the bundle is written. It travels whatever the exit code was.
    if (started.stderr.trim() !== '') {
      transcript.push({ actor: 'crew', kind: 'report', text: started.stderr.trim() });
    }
    transcript.push(...(await crewTranscript(join(workRoot, evidence))));
    if (started.exitCode !== 0) {
      throw new Error(`PROOF_CREW_AGENT_FAILED:${started.exitCode}:${started.stderr.trim()}`);
    }
    return {
      ...crewAuthorship(options.plan),
      humanHints: 0,
      // What the bundle records as the agent. A named model is part of that identity: two
      // showcase runs on different models are different runs, and a bundle that called them
      // both `vox-crew/adk` could not say which one authored the plan it carries.
      model: crewAgentName(options.plan, options.model),
      modelVersion: version.stdout.trim(),
      transcriptComplete: transcript.length > 0,
      // Self-reported, and the sheet treats it as such: `network.agent-direct-denied` reads
      // the sandbox, which is null here, so this never stands in as evidence. It is `true` on
      // the handed-plan path because that path opens no socket at all — the crew's own suite
      // fails any test that reaches for one — and `false` on the live path, which reaches a
      // model by design.
      directNetworkDenied: options.plan !== undefined,
      directNetworkEvents: [],
      sandboxEvidence: null,
      evidenceRoot: evidence,
    };
  };

/**
 * The crew's bundle, verified by the crew's verifier.
 *
 * `verifyProofBundle` cannot answer for it and this is not a defect in either: a proof bundle
 * carries `main-run/run.json`, and the Run checkpoint is not among the artifact kinds the
 * service publishes, so no descriptor names it and the crew may not read it. `vox_crew.evidence`
 * holds the crew-side equivalent — digests recomputed, the verdict re-derived from the
 * assertions meant to support it, every named piece of evidence looked for among the files
 * present — under the same failure codes. Asking it, rather than reimplementing it here, is
 * what keeps one verifier rather than two that agree until they don't.
 *
 * Returns the machine verdict the bundle re-derives, and throws whatever the verifier throws.
 */
export const verifyCrewBundle = async (
  bundleRoot: string,
  interpreter: string = process.env.VOX_PROOF_CREW_PYTHON ?? crewInterpreter,
): Promise<string> => {
  const verified = await execFileAsync(
    interpreter,
    [
      '-c',
      'import sys;from vox_crew.evidence import read_bundle,verify;' +
        'sys.stdout.write(verify(read_bundle(sys.argv[1])))',
      bundleRoot,
    ],
    { windowsHide: true },
  );
  return verified.stdout.trim();
};
