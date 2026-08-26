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
 * **A Brief-violating plan is scored, not blocked.** `catalogShowcasePlanViolations` was once
 * enforced inside the IPC audit hook, where a throwing hook destroys the socket and the run
 * died before it ever compiled. It is now only `scenario.brief-compliance` on the assertion
 * sheet, so the same plan runs to a rendered preview and fails by name in a bundle you can
 * read and watch. Recording spend is capped by `maxNewTakes`, not by that check.
 *
 * **`--provider fixture` is the rehearsal and spends no voice credit.** The crew still authors
 * through a real model, the whole pipeline runs, and every assertion scores except the claim
 * itself — `agent.unscripted-generalist` is claim-eligible only under `elevenlabs`. Run it
 * before spending, because a plan that fails now costs a synthesis dispatch and a render.
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

// Spending is the default, and the rehearsal is the flag. The other way round would make a
// forgotten argument the difference between a dress rehearsal and a paid run that nobody
// meant to start.
const providerIndex = process.argv.indexOf('--provider');
const provider = providerIndex >= 0 ? process.argv[providerIndex + 1] : 'elevenlabs';
if (provider !== 'elevenlabs' && provider !== 'fixture') {
  throw new TypeError('proof:crew-showcase --provider takes `elevenlabs` or `fixture`.');
}

const result = await runCatalogShowcaseProof({
  provider,
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
