import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { canonicalJson } from '../canonical-json';
import {
  type ImageGenerationGrant,
  type ImageRecoveryPolicy,
  imageGenerationGrantSchema,
  imageRecoveryPolicySchema,
} from '../contracts/schemas';

const envelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    maxImages: z.number().int().min(0).max(5),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const stateSchema = z
  .object({
    envelope: envelopeSchema,
    runId: z.string(),
    grants: z.array(imageGenerationGrantSchema),
    recovery: imageRecoveryPolicySchema.optional(),
    retryGrants: z
      .array(z.object({ retryOf: z.string(), grant: imageGenerationGrantSchema }).strict())
      .optional(),
  })
  .strict();

/** Operator-mounted envelopes and durable single-Run grants. Never available to the crew. */
export class AutonomousImageAuthority {
  constructor(
    private readonly directory: string,
    private readonly key: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async transaction<T>(
    digest: string,
    runId: string,
    action: (state: z.infer<typeof stateSchema>) => T | Promise<T>,
  ): Promise<T | undefined> {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid request digest.');
    let envelope: z.infer<typeof envelopeSchema>;
    try {
      envelope = envelopeSchema.parse(
        JSON.parse(await readFile(join(this.directory, 'envelopes', `${digest}.json`), 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    if (envelope.requestSha256 !== digest) throw new Error('Envelope request mismatch.');
    const path = join(this.directory, 'state', `${digest}.json`);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    // A crash retains this lock. Reconciliation must precede further authorization.
    const lock = `${path}.lock`;
    await mkdir(lock, { mode: 0o700 });
    try {
      let state: z.infer<typeof stateSchema>;
      try {
        state = stateSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        state = { envelope, runId, grants: [] };
      }
      if (state.runId !== runId || canonicalJson(state.envelope) !== canonicalJson(envelope)) {
        throw new Error('Autonomous envelope is already bound or was changed.');
      }
      const result = await action(state);
      const file = await open(`${path}.partial`, 'w', 0o600);
      try {
        await file.writeFile(`${JSON.stringify(state)}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(`${path}.partial`, path);
      return result;
    } finally {
      await rmdir(lock);
    }
  }

  async bind(requestSha256: string, runId: string): Promise<void> {
    await this.transaction(requestSha256, runId, () => undefined);
  }

  async recoveryPolicy(
    requestSha256: string,
    runId: string,
    retainedMetadata = false,
  ): Promise<ImageRecoveryPolicy | undefined> {
    if (!/^[a-f0-9]{64}$/.test(requestSha256)) throw new Error('Invalid request digest.');
    let recovery: ImageRecoveryPolicy;
    try {
      recovery = imageRecoveryPolicySchema.parse(
        JSON.parse(
          await readFile(join(this.directory, 'recovery', `${requestSha256}.json`), 'utf8'),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    if (recovery.requestSha256 !== requestSha256 || recovery.runId !== runId)
      throw new Error('Image recovery binding mismatch.');
    if (
      (!retainedMetadata && Date.parse(recovery.expiresAt) <= this.now().getTime()) ||
      Date.parse(recovery.authorizedAt) > this.now().getTime()
    )
      throw new Error('Image recovery authorization is not current.');
    const state = stateSchema.parse(
      JSON.parse(await readFile(join(this.directory, 'state', `${requestSha256}.json`), 'utf8')),
    );
    if (
      state.runId !== runId ||
      (state.recovery && canonicalJson(state.recovery) !== canonicalJson(recovery))
    )
      throw new Error('Image recovery authorization changed after use.');
    return recovery;
  }

  async authorize(
    requestSha256: string,
    runId: string,
    imageSha256: string,
    retryOf?: string,
  ): Promise<ImageGenerationGrant | undefined> {
    return this.transaction(requestSha256, runId, async (state) => {
      const recovery = await this.recoveryPolicy(requestSha256, runId);
      if (retryOf && !recovery)
        throw new Error('An image retry needs explicit recovery authorization.');
      if (recovery) state.recovery = recovery;
      const previous = retryOf
        ? state.retryGrants?.find(
            (row) => row.retryOf === retryOf && row.grant.requestSha256 === imageSha256,
          )?.grant
        : state.grants.find((grant) => grant.requestSha256 === imageSha256);
      if (previous) return previous;
      if (Date.parse(state.envelope.expiresAt) <= this.now().getTime()) {
        throw new Error('Autonomous envelope expired.');
      }
      if (
        state.grants.length + (state.retryGrants?.length ?? 0) >=
        (recovery?.maxImageAttempts ?? state.envelope.maxImages)
      ) {
        throw new Error('Autonomous image allowance exhausted.');
      }
      const unsigned = {
        protocolVersion: 1 as const,
        grantId: randomUUID(),
        runId,
        requestSha256: imageSha256,
        issuedAt: this.now().toISOString(),
        expiresAt: recovery?.expiresAt ?? state.envelope.expiresAt,
      };
      const grant = imageGenerationGrantSchema.parse({
        ...unsigned,
        grant: createHmac('sha256', this.key).update(canonicalJson(unsigned)).digest('hex'),
      });
      if (retryOf) {
        state.retryGrants ??= [];
        state.retryGrants.push({ retryOf, grant });
      } else state.grants.push(grant);
      return grant;
    });
  }
}
