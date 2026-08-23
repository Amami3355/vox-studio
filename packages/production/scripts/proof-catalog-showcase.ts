import { createCodexAgentDriver } from '../src/proof/codex-agent';
import { runCatalogShowcaseProof } from '../src/proof/harness';

const result = await runCatalogShowcaseProof({
  provider: 'elevenlabs',
  agentDriver: createCodexAgentDriver(),
  keepWorkingRoots: true,
});

process.stdout.write(
  `${JSON.stringify({
    evidenceRoot: result.evidenceRoot,
    machineVerdict: result.machineVerdict,
    humanVerdict: result.humanVerdict,
  })}\n`,
);
