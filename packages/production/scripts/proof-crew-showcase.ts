/**
 * The Helios Bay showcase, produced by the crew rather than by a scripted driver.
 *
 * This is the sibling of `proof-catalog-showcase.ts`: the same Brief, the same scenario record,
 * the same assertion sheet, and a different agent. Everything that differs between them is
 * here — the driver, and the fact that the crew is handed no plan.
 *
 * **It spends real money.** Live synthesis is one ElevenLabs dispatch, and the crew authors
 * through a model, so both a voice credential and a model credential must be in this process's
 * environment. `scrubAgentEnvironment` keeps production's secrets away from the crew and lets
 * `GOOGLE_`/`GEMINI_` through, which is how the model credential reaches it and the voice
 * credential does not.
 *
 * **Working roots are kept.** A run this expensive is not re-run to find out what it did, so
 * the roots survive it whatever the verdict.
 *
 * **A dead pipe means the pre-spend gate fired.** `catalogShowcasePlanViolations` is checked
 * inside the IPC audit hook, and a throwing hook destroys the socket rather than answering:
 * the crew sees a broken connection, exits non-zero, and writes no bundle. It fires after
 * compile and before synthesis, so a plan that misses the showcase requirements costs model
 * tokens and no voice credit. Whether that gate should instead surface as a refusal the crew
 * can repair from is ticket 15's decision, and it is not made here.
 */

import { createCrewAgentDriver } from '../src/proof/crew-agent';
import { runCatalogShowcaseProof } from '../src/proof/harness';

// Only the shape of the invocation is checked here. What counts as an acceptable model name is
// the crew's rule and is enforced there, next to the pinned default it is derived from — a
// second copy in this language would be the one that drifts.
const modelIndex = process.argv.indexOf('--model');
const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : undefined;
if (modelIndex >= 0 && (model === undefined || model.startsWith('--'))) {
  throw new TypeError('proof:crew-showcase --model needs a model name.');
}

const result = await runCatalogShowcaseProof({
  provider: 'elevenlabs',
  // No `plan`: the crew authors its own, which is the whole point of this run and the one
  // assertion — `agent.unscripted-generalist` — the deterministic crew run cannot earn.
  agentDriver: createCrewAgentDriver({ model }),
  keepWorkingRoots: true,
});

process.stdout.write(
  `${JSON.stringify({
    evidenceRoot: result.evidenceRoot,
    machineVerdict: result.machineVerdict,
    humanVerdict: result.humanVerdict,
  })}\n`,
);
