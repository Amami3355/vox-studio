import { resolve } from 'node:path';
import { verifyProofBundle } from '../src/proof/evidence';

const directory = process.argv[2];
if (!directory) throw new TypeError('verify:proof requires an evidence directory.');
const result = await verifyProofBundle(resolve(directory), { requirePass: true });
process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
