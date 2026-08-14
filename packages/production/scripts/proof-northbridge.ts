import { createCodexAgentDriver } from '../src/proof/codex-agent';
import { runNorthbridgeProof } from '../src/proof/harness';

const providerIndex = process.argv.indexOf('--provider');
const provider = providerIndex >= 0 ? process.argv[providerIndex + 1] : undefined;
if (provider !== 'fixture' && provider !== 'elevenlabs') {
  throw new TypeError('proof:northbridge requires --provider fixture|elevenlabs.');
}

const agentIndex = process.argv.indexOf('--agent');
const agent = agentIndex >= 0 ? process.argv[agentIndex + 1] : undefined;
if (agent !== undefined && agent !== 'fixture' && agent !== 'codex') {
  throw new TypeError('proof:northbridge accepts --agent fixture|codex.');
}
const selectedAgent = agent ?? (provider === 'elevenlabs' ? 'codex' : 'fixture');
if (provider === 'elevenlabs' && selectedAgent !== 'codex') {
  throw new TypeError('The elevenlabs proof requires --agent codex.');
}

const lengthIndex = process.argv.indexOf('--length');
const length = lengthIndex >= 0 ? process.argv[lengthIndex + 1] : undefined;
if (length !== undefined && length !== 'short' && length !== 'long') {
  throw new TypeError('proof:northbridge accepts --length short|long.');
}

const result = await runNorthbridgeProof({
  provider,
  length,
  agentDriver: selectedAgent === 'codex' ? createCodexAgentDriver() : undefined,
  keepWorkingRoots: provider === 'elevenlabs' || selectedAgent === 'codex',
});
process.stdout.write(
  `${JSON.stringify({
    evidenceRoot: result.evidenceRoot,
    machineVerdict: result.machineVerdict,
    humanVerdict: result.humanVerdict,
  })}\n`,
);
