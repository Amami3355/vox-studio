/**
 * The template folder, held to the shape of the real ones.
 *
 * `_TemplateScene` is what `docs/adding-a-capability.md` tells you to copy. It is
 * deliberately **not** in the registry, so `catalog-contract.test.ts` — the enforced
 * checklist every real capability clears — never runs against it. That leaves one drift
 * vector, and it is the expensive kind: a template missing a file teaches its shape to
 * every capability copied from it, and nothing fails until someone notices by hand.
 *
 * So this asserts the two things the type system cannot. It does not restate the catalog
 * contract; rule 1 says that checklist has one home and it is not here.
 *
 * **What this deliberately does not cover, and why that is affordable.** Nothing here checks
 * the template's *content* against the catalog contract — that it ships three examples, that
 * its `avoidWhen` entries carry their arrow, that its `deicticFields` name real payload
 * fields. Running that checklist here would be a second home for it, and it cannot run
 * anyway: `validateScene` resolves through `requireCapability`, so an unregistered
 * capability's examples are not validatable at all.
 *
 * The mitigation is that a copy of the template gets registered, and the contract tests then
 * run on the copy with a named failure. A flaw in the template costs a copier one confusing
 * red test; it cannot reach the manifest, because the template is not in it. That trade was
 * made knowingly. If it ever stops holding, the fix is to extract the contract's per-
 * capability block into one exported helper both files call — not to copy its assertions.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capabilityIds, registry } from '../src/scenes/registry';

const SCENES_DIR = join(import.meta.dirname, '..', 'src', 'scenes');
const TEMPLATE_DIR = '_TemplateScene';

const foldersIn = (dir: string): string[] =>
  readdirSync(dir).filter((entry) => statSync(join(dir, entry)).isDirectory());

const filesIn = (folder: string): string[] =>
  readdirSync(join(SCENES_DIR, folder))
    .filter((entry) => statSync(join(SCENES_DIR, folder, entry)).isFile())
    .sort();

describe('the capability template', () => {
  /**
   * Registering it would publish `template_scene` to the manifest, and rule 2 says the
   * agent sees the manifest and never the code — a stub capability in the catalog is a
   * capability the agent will try to use.
   */
  it('is not registered, so it never reaches the manifest', () => {
    expect(capabilityIds()).not.toContain('template_scene');
    expect(registry.map((capability) => capability.meta.name)).not.toContain('TemplateScene');
  });

  /**
   * A superset assertion, not an equality one. A capability with a file of its own —
   * `BarChartScene` may well grow one — is free to have it. What is caught is the reverse:
   * a file every live capability carries, that the thing people copy does not.
   *
   * The live folders are read off the filesystem rather than off `meta.name`, so a
   * capability whose folder and component name diverge is still counted.
   */
  it('carries every file the live capabilities all carry', () => {
    const live = foldersIn(SCENES_DIR).filter((folder) => folder !== TEMPLATE_DIR);
    expect(live.length).toBeGreaterThan(0);

    const universal = live
      .map(filesIn)
      .reduce((common, files) => common.filter((file) => files.includes(file)));
    const template = filesIn(TEMPLATE_DIR);

    for (const file of universal) {
      expect(template, `template is missing ${file}`).toContain(file);
    }
  });
});
