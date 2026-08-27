import { resolve } from 'node:path';
import { verifyProofBundle } from '../src/proof/evidence';

/**
 * Verifies a sealed evidence bundle.
 *
 *   verify:proof <bundle-dir>                  the release gate: every check, and a pass required
 *   verify:proof <bundle-dir> --allow-pending  integrity only: the bundle holds together
 *
 * The default is `requirePass: true` and stays that way — production ticket 21 records it as the
 * correct fail-closed result for the northbridge proof, which must not go green while a human
 * verdict is outstanding.
 *
 * `--allow-pending` exists because that gate is not the only question worth asking, and for a
 * crew bundle it is a question that can never be answered yes: a crew Run gathers machine
 * evidence and never carries a human verdict, so `requirePass` refuses it with
 * `PROOF_VERDICT_NOT_PASS` for a reason that has nothing to do with whether the bundle is sound.
 * That left the real check — `verifyProofBundle` with no options — reachable only from inside a
 * test or a one-off script, which is to say not reproducible by whoever is holding the bundle.
 * This flag is that check, as a standing command.
 */

const [directory, ...flags] = process.argv.slice(2);
if (!directory) throw new TypeError('verify:proof requires an evidence directory.');
const requirePass = !flags.includes('--allow-pending');
const result = await verifyProofBundle(resolve(directory), { requirePass });
process.stdout.write(`${JSON.stringify({ ok: true, requirePass, ...result })}\n`);
