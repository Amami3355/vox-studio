import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { handleContractIndex, handleContractShow } from '../contracts/handlers';
import {
  type CommandId,
  PROTOCOL_VERSION,
  contractCategorySchema,
  resultEnvelopeSchema,
} from '../contracts/schemas';
import type { CommandExecution, ProductionCommandService } from './service';

export type DispatchResult = { exitCode: 0 | 1 | 2; stdout: string; stderr: string };

const asStdout = (envelope: unknown): string => `${JSON.stringify(envelope)}\n`;

const malformed = (command: CommandId | null, message: string): DispatchResult => ({
  exitCode: 2,
  stdout: asStdout(
    resultEnvelopeSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      command,
      outcome: 'failed',
      run: null,
      data: null,
      artifacts: [],
      error: { code: 'INVALID_INVOCATION', message, details: null },
      next: [
        {
          command: 'contract.index',
          args: [],
          reason: 'Discover the public Production contract.',
        },
      ],
    }),
  ),
  stderr: '',
});

const flags = (argv: string[]): Map<string, string> | null => {
  if (argv.length % 2 !== 0) return null;
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined || parsed.has(name)) return null;
    parsed.set(name, value);
  }
  return parsed;
};

const exactFlags = (
  argv: string[],
  required: string[],
  optional: string[] = [],
): Map<string, string> | null => {
  const parsed = flags(argv);
  if (!parsed) return null;
  const allowed = new Set([...required, ...optional]);
  if (required.some((flag) => !parsed.has(flag))) return null;
  if ([...parsed.keys()].some((flag) => !allowed.has(flag))) return null;
  return parsed;
};

const absolute = (cwd: string, value: string): string => resolve(cwd, value);

export const dispatchProductionArgv = async (
  service: ProductionCommandService,
  cwd: string,
  argv: string[],
): Promise<DispatchResult> => {
  if (argv[0] !== 'production') {
    return malformed(null, 'Expected the production command group.');
  }
  if (argv[1] === 'contract' && argv[2] === 'index' && argv.length === 3) {
    return { exitCode: 0, stdout: asStdout(handleContractIndex()), stderr: '' };
  }
  if (argv[1] === 'contract' && argv[2] === 'show' && argv.length === 4) {
    const category = contractCategorySchema.safeParse(argv[3]);
    if (!category.success) return malformed('contract.show', 'Unknown contract category.');
    return { exitCode: 0, stdout: asStdout(handleContractShow(category.data)), stderr: '' };
  }
  if (argv[1] !== 'run' || !argv[2]) return malformed(null, 'Unknown production command.');

  const verb = argv[2];
  const rest = argv.slice(3);
  const command = `run.${verb}` as CommandId;
  let execution: CommandExecution;
  switch (verb) {
    case 'progress': {
      const parsed = exactFlags(rest, ['--run']);
      if (!parsed) return malformed('run.progress', 'run progress requires --run.');
      execution = await service.progress({ runRoot: absolute(cwd, parsed.get('--run') as string) });
      break;
    }
    case 'init': {
      const parsed = exactFlags(rest, ['--request', '--out']);
      if (!parsed) return malformed('run.init', 'run init requires --request and --out.');
      execution = await service.init({
        requestPath: absolute(cwd, parsed.get('--request') as string),
        out: absolute(cwd, parsed.get('--out') as string),
      });
      break;
    }
    case 'status': {
      const parsed = exactFlags(rest, ['--run']);
      if (!parsed) return malformed('run.status', 'run status requires --run.');
      execution = await service.status({ runRoot: absolute(cwd, parsed.get('--run') as string) });
      break;
    }
    case 'authorize': {
      const parsed = exactFlags(rest, ['--run', '--authorization']);
      if (!parsed)
        return malformed('run.authorize', 'run authorize requires --run and --authorization.');
      execution = await service.authorize({
        runRoot: absolute(cwd, parsed.get('--run') as string),
        authorization: JSON.parse(
          await readFile(absolute(cwd, parsed.get('--authorization') as string), 'utf8'),
        ),
      });
      break;
    }
    case 'decline': {
      const parsed = exactFlags(rest, ['--run', '--decision']);
      if (!parsed) return malformed('run.decline', 'run decline requires --run and --decision.');
      execution = await service.decline({
        runRoot: absolute(cwd, parsed.get('--run') as string),
        decisionPath: absolute(cwd, parsed.get('--decision') as string),
      });
      break;
    }
    case 'validate': {
      const parsed = exactFlags(rest, ['--run', '--plan']);
      if (!parsed) return malformed('run.validate', 'run validate requires --run and --plan.');
      execution = await service.validate({
        runRoot: absolute(cwd, parsed.get('--run') as string),
        planPath: absolute(cwd, parsed.get('--plan') as string),
      });
      break;
    }
    case 'preflight':
    case 'compile':
    case 'render': {
      const parsed = exactFlags(rest, ['--run']);
      if (!parsed) return malformed(command, `run ${verb} requires --run.`);
      const runRoot = absolute(cwd, parsed.get('--run') as string);
      execution = await service[verb]({ runRoot });
      break;
    }
    case 'record': {
      const parsed = exactFlags(rest, ['--run'], ['--replacement-authorisation']);
      if (!parsed) {
        return malformed(
          'run.record',
          'run record requires --run and accepts --replacement-authorisation.',
        );
      }
      const authorisation = parsed.get('--replacement-authorisation');
      execution = await service.record({
        runRoot: absolute(cwd, parsed.get('--run') as string),
        ...(authorisation ? { replacementAuthorisationPath: absolute(cwd, authorisation) } : {}),
      });
      break;
    }
    case 'image-start': {
      const parsed = exactFlags(rest, ['--run', '--request'], ['--authorisation']);
      if (!parsed) {
        return malformed(
          'run.image.start',
          'run image-start requires --run and --request and accepts --authorisation.',
        );
      }
      // `authorisation` is the flag's spelling and `authorization` the wire field's, so the
      // path and the parsed grant differed here by one letter in one scope. Named for what
      // each one is instead.
      const grantPath = parsed.get('--authorisation');
      let request: unknown;
      let grant: unknown;
      try {
        request = JSON.parse(
          await readFile(absolute(cwd, parsed.get('--request') as string), 'utf8'),
        );
        grant = grantPath
          ? JSON.parse(await readFile(absolute(cwd, grantPath), 'utf8'))
          : undefined;
      } catch {
        return malformed(
          'run.image.start',
          'run image-start requires readable JSON request and authorisation files.',
        );
      }
      execution = await service.imageStart({
        runRoot: absolute(cwd, parsed.get('--run') as string),
        request,
        ...(grantPath ? { authorization: grant } : {}),
      });
      break;
    }
    case 'image-status': {
      const parsed = exactFlags(rest, ['--run', '--job']);
      if (!parsed)
        return malformed('run.image.status', 'run image-status requires --run and --job.');
      execution = await service.imageStatus({
        runRoot: absolute(cwd, parsed.get('--run') as string),
        jobId: parsed.get('--job') as string,
      });
      break;
    }
    case 'image-accept':
    case 'image-reject': {
      const commandId = verb === 'image-accept' ? 'run.image.accept' : 'run.image.reject';
      const parsed = exactFlags(rest, ['--run', '--decision']);
      if (!parsed) return malformed(commandId, `run ${verb} requires --run and --decision.`);
      let decision: unknown;
      try {
        decision = JSON.parse(
          await readFile(absolute(cwd, parsed.get('--decision') as string), 'utf8'),
        );
      } catch {
        return malformed(commandId, `run ${verb} requires a readable JSON decision file.`);
      }
      const runRoot = absolute(cwd, parsed.get('--run') as string);
      execution =
        verb === 'image-accept'
          ? await service.imageAccept({ runRoot, decision })
          : await service.imageReject({ runRoot, decision });
      break;
    }
    default:
      return malformed(null, 'Unknown run command.');
  }
  return { exitCode: execution.exitCode, stdout: asStdout(execution.envelope), stderr: '' };
};
