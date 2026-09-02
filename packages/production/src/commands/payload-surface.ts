import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { ZodError } from 'zod';
import { handleContractIndex, handleContractShow } from '../contracts/handlers';
import {
  type ArtifactDescriptor,
  type CommandId,
  PROTOCOL_VERSION,
  type ResultEnvelope,
  commandIdSchema,
  contractCategorySchema,
  resultEnvelopeSchema,
} from '../contracts/schemas';
import { RUN_PATHS } from '../run-store/paths';
import type { CommandExecution, ProductionCommandService } from './service';

/** A payload as the caller authored it: an object, never a path. */
export type CommandPayload = Record<string, unknown>;

export type PayloadCommandRequest = {
  command: CommandId;
  runId?: string | null;
  payload?: CommandPayload | null;
};

/** Bytes out of a Run, with the digest this surface computed for them. */
export type RetrievedArtifact = {
  kind: string;
  sha256: string;
  bytes: Uint8Array;
};

export type ProductionPayloadSurfaceOptions = {
  service: ProductionCommandService;
  /** The directory Run directories live in. Not the ledger root, which is private. */
  runsRoot: string;
  createRunDirectory?: () => string;
};

export class ProductionSurfaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProductionSurfaceError';
  }
}

/** Payload bytes as the crew authors them, so a receipt stays readable. */
const canonicalPayload = (payload: CommandPayload): string =>
  `${JSON.stringify(payload, null, 2)}\n`;

const shortId = (): string => randomBytes(6).toString('hex');

/**
 * The envelope's `command` is a published id or `null`, and a caller reaching this surface over
 * the network can name a string that is neither. The argv path answers that with a `null`
 * command and an envelope; this keeps the two paths saying the same thing, rather than throwing
 * a schema error out of the failure path that exists to avoid throwing.
 */
const publishedCommand = (command: string): CommandId | null => {
  const parsed = commandIdSchema.safeParse(command);
  return parsed.success ? parsed.data : null;
};

const failure = (
  command: CommandId | null,
  code: string,
  message: string,
  exitCode: 1 | 2 = 1,
): CommandExecution => ({
  envelope: resultEnvelopeSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    command,
    outcome: 'failed',
    run: null,
    data: null,
    artifacts: [],
    error: { code, message, details: null },
    next: [],
  }) as ResultEnvelope,
  exitCode,
});

/**
 * Resolves a path the way `Path.resolve()` does in `local_client.py`: symlinks followed, and a
 * path that does not exist yet resolved as far as it does exist. Node's `path.resolve` is
 * lexical and never touches the disk, so a containment check built on it alone is satisfied by
 * a symlink that leaves the Run.
 */
const resolveThroughLinks = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;
    return join(await resolveThroughLinks(parent), basename(path));
  }
};

/**
 * The payload-shaped surface: a command name, a Run id where the command names one, and a
 * payload object where the command takes one.
 *
 * This is `local_client.py`'s staging moved across the boundary. The crew's copy writes a plan
 * into the Run directory on the caller's own disk and hands the path to argv; in the cloud the
 * crew's disk is not the Run's disk, so the same writing has to happen on this side. Every
 * filename here matches what the crew writes today, byte for byte, so that a Run produced
 * through either path is the same Run on disk.
 *
 * `dispatchProductionArgv` is the other caller of the same command service and is untouched.
 */
export class ProductionPayloadSurface {
  private readonly service: ProductionCommandService;
  private readonly runsRoot: string;
  private readonly createRunDirectory: () => string;
  private readonly directories = new Map<string, string>();

  constructor(options: ProductionPayloadSurfaceOptions) {
    this.service = options.service;
    this.runsRoot = resolve(options.runsRoot);
    this.createRunDirectory = options.createRunDirectory ?? (() => `run-${shortId()}`);
  }

  async execute(request: PayloadCommandRequest): Promise<CommandExecution> {
    try {
      return await this.route(request);
    } catch (error) {
      if (error instanceof ProductionSurfaceError) {
        return failure(publishedCommand(request.command), error.code, error.message);
      }
      // Everything else is what the argv path calls a failed command, and it answers with an
      // envelope rather than a thrown error. A surface that throws here would hand a transport
      // a raw Node error carrying an absolute host path, where `dispatchProductionArgv` hands
      // back a `COMMAND_FAILED` envelope for the transport to sanitise. Same classification as
      // `service.ts`'s catch-all, so the failure path has the parity the success path has.
      const malformed = error instanceof ZodError || error instanceof SyntaxError;
      const message = error instanceof Error ? error.message : String(error);
      return failure(
        publishedCommand(request.command),
        malformed ? 'INVALID_INPUT' : 'COMMAND_FAILED',
        message,
        malformed ? 2 : 1,
      );
    }
  }

  /**
   * Bytes and a digest, keyed by the descriptor the envelope already published. No caller
   * composes a path.
   *
   * The digest is recomputed rather than echoed, because a retrieval surface that returns the
   * digest the envelope claimed has proved nothing about the bytes it just handed back.
   */
  async fetchArtifact(runId: string, descriptor: ArtifactDescriptor): Promise<RetrievedArtifact> {
    const runRoot = join(this.runsRoot, await this.directoryFor(runId));
    const target = await this.within(runRoot, descriptor.path);
    let bytes: Uint8Array;
    try {
      bytes = await readFile(target);
    } catch {
      throw new ProductionSurfaceError(
        'ARTIFACT_MISSING',
        `Run ${runId} does not carry a ${descriptor.kind} at ${descriptor.path}.`,
      );
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== descriptor.sha256) {
      throw new ProductionSurfaceError(
        'ARTIFACT_CORRUPTED',
        `Run ${runId} published ${descriptor.kind} as ${descriptor.sha256} and it hashes to ${sha256}.`,
      );
    }
    return { kind: descriptor.kind, sha256, bytes };
  }

  /**
   * Resolves a Run-relative locator, refusing anything that leaves the Run. Descriptors come
   * from envelopes this service wrote, so this should never fire. It is here because the
   * alternative to checking is trusting a string to stay inside a boundary, and the boundary is
   * the product.
   *
   * Both sides are resolved through symlinks, because `local_client.py:243` uses
   * `Path.resolve()` and a lexical check is a weaker refusal wearing the same name. The phase
   * treats the escaping symlink as live: `check.mjs` asserts the volume resolves one out of the
   * mount precisely because `run-store.ts`'s containment depends on it.
   */
  private async within(runRoot: string, relative: string): Promise<string> {
    const target = await resolveThroughLinks(resolve(runRoot, relative));
    const root = await resolveThroughLinks(resolve(runRoot));
    if (target === root || !target.startsWith(`${root}${sep}`)) {
      throw new ProductionSurfaceError(
        'ARTIFACT_OUTSIDE_RUN',
        `${relative} is not inside the Run that published it.`,
      );
    }
    return target;
  }

  private async route(request: PayloadCommandRequest): Promise<CommandExecution> {
    switch (request.command) {
      case 'run.init': {
        const directory = this.createRunDirectory();
        const execution = await this.withTransient(request.payload, (staged) =>
          this.service.init({ requestPath: staged, out: join(this.runsRoot, directory) }),
        );
        const created = execution.envelope.run?.id;
        if (created) this.directories.set(created, directory);
        return execution;
      }
      case 'run.status':
        return this.service.status({ runRoot: await this.runRoot(request.runId) });
      case 'run.validate': {
        const runRoot = await this.runRoot(request.runId);
        const planPath = await this.stage(runRoot, 'plan.json', this.required(request));
        return this.service.validate({ runRoot, planPath });
      }
      case 'run.decline': {
        const runRoot = await this.runRoot(request.runId);
        const decisionPath = await this.stage(runRoot, 'decision.json', this.required(request));
        return this.service.decline({ runRoot, decisionPath });
      }
      case 'run.record': {
        const runRoot = await this.runRoot(request.runId);
        // The only optional payload: a replacement authorisation is present or the command is
        // the ordinary one, and the argv path spells that difference as a flag it may omit.
        const authorisation = request.payload
          ? await this.stage(runRoot, 'replacement-authorisation.json', request.payload)
          : null;
        return this.service.record({
          runRoot,
          ...(authorisation ? { replacementAuthorisationPath: authorisation } : {}),
        });
      }
      case 'run.preflight':
      case 'run.compile':
      case 'run.render': {
        const runRoot = await this.runRoot(request.runId);
        const verb = request.command.slice('run.'.length) as 'preflight' | 'compile' | 'render';
        return this.service[verb]({ runRoot });
      }
      case 'contract.index':
        return { envelope: handleContractIndex(), exitCode: 0 };
      case 'contract.show': {
        const category = contractCategorySchema.safeParse(this.required(request).category);
        if (!category.success) {
          throw new ProductionSurfaceError('UNKNOWN_CATEGORY', 'Unknown contract category.');
        }
        return { envelope: handleContractShow(category.data), exitCode: 0 };
      }
      default:
        throw new ProductionSurfaceError(
          'UNKNOWN_COMMAND',
          `${request.command} is not a command this surface serves.`,
        );
    }
  }

  /**
   * Writes a payload inside the Run it belongs to, where an audit can find it afterwards, and
   * returns the path the command service reads. The filename is the surface's decision and it
   * matches what the crew writes today.
   */
  private async stage(runRoot: string, name: string, payload: CommandPayload): Promise<string> {
    const target = join(runRoot, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, canonicalPayload(payload), 'utf8');
    return target;
  }

  private required(request: PayloadCommandRequest): CommandPayload {
    if (!request.payload) {
      throw new ProductionSurfaceError(
        'PAYLOAD_REQUIRED',
        `${request.command} takes a payload and none was given.`,
      );
    }
    return request.payload;
  }

  /**
   * `run init` reads its request before the Run root exists, so this one payload has nowhere
   * durable to live. It is removed however the command ends, because a runs root that keeps a
   * stray file after a crashed init has stopped being evidence of anything.
   */
  private async withTransient(
    payload: CommandPayload | null | undefined,
    work: (staged: string) => Promise<CommandExecution>,
  ): Promise<CommandExecution> {
    const staged = join(this.runsRoot, `.inbox-${shortId()}.json`);
    await writeFile(staged, canonicalPayload(payload ?? {}), 'utf8');
    try {
      return await work(staged);
    } finally {
      await rm(staged, { force: true });
    }
  }

  private async runRoot(runId: string | null | undefined): Promise<string> {
    if (!runId) throw new ProductionSurfaceError('RUN_ID_REQUIRED', 'This command names a Run.');
    return join(this.runsRoot, await this.directoryFor(runId));
  }

  /**
   * A Run id resolves without this object having created it: the checkpoints already in the
   * runs root answer the question, so a restarted service picks up a Run it did not open.
   */
  private async directoryFor(runId: string): Promise<string> {
    const remembered = this.directories.get(runId);
    if (remembered !== undefined) return remembered;
    let entries: string[];
    try {
      entries = (await readdir(this.runsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      entries = [];
    }
    for (const name of entries) {
      let identifier: unknown;
      try {
        const checkpoint = await readFile(join(this.runsRoot, name, RUN_PATHS.checkpoint), 'utf8');
        identifier = (JSON.parse(checkpoint) as { runId?: unknown }).runId;
      } catch {
        continue;
      }
      if (identifier === runId) {
        this.directories.set(runId, name);
        return name;
      }
    }
    throw new ProductionSurfaceError('UNKNOWN_RUN', `No Run named ${runId} is in this store.`);
  }
}
