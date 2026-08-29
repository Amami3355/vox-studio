import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The `vox-production-service` skill lives outside every tsconfig, so its scripts import package
 * source by deep relative path with nothing checking them and `pnpm typecheck` blind to the whole
 * folder. Its REFERENCE.md cites source locations the same way. Both go stale silently when a
 * file moves — which is the failure the skill itself exists to prevent, one level up.
 *
 * This holds the skill to the tree the way `template-scene.test.ts` holds the capability doc to
 * the template folder. Line *numbers* still drift; a moved or deleted file does not.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const skillRoot = resolve(repositoryRoot, '.claude/skills/vox-production-service');

describe('the vox-production-service skill cites files that exist', () => {
  it('resolves every source import in its scripts', () => {
    const scripts = readdirSync(resolve(skillRoot, 'scripts')).filter((name) =>
      name.endsWith('.mts'),
    );
    expect(scripts.length).toBeGreaterThan(0);

    const unresolved: string[] = [];
    for (const script of scripts) {
      const scriptPath = resolve(skillRoot, 'scripts', script);
      const source = readFileSync(scriptPath, 'utf8');
      for (const match of source.matchAll(/from '(\.\.[^']+)'/g)) {
        const specifier = match[1] as string;
        const target = resolve(dirname(scriptPath), specifier);
        const found = ['', '.ts', '.mts', '.js', '/index.ts'].some((suffix) =>
          existsSync(`${target}${suffix}`),
        );
        if (!found) unresolved.push(`${script} → ${specifier}`);
      }
    }

    expect(unresolved).toEqual([]);
  });

  it('resolves every path-shaped file:line citation in REFERENCE.md', () => {
    const reference = readFileSync(resolve(skillRoot, 'REFERENCE.md'), 'utf8');
    // Only citations carrying a directory are checked; a bare `host.ts:59` names no location the
    // tree can confirm, and guessing at one would make this test lie rather than fail.
    const citations = [...reference.matchAll(/`([\w./-]+\/[\w.-]+\.\w+):(\d+)/g)];
    expect(citations.length).toBeGreaterThan(0);

    const bases = [repositoryRoot, join(repositoryRoot, 'packages/production')];
    const broken: string[] = [];
    for (const [, cited, line] of citations) {
      const path = cited as string;
      const resolved = bases
        .map((base) => resolve(base, path))
        .find((candidate) => existsSync(candidate));
      if (resolved === undefined) {
        broken.push(`${path} does not exist under any known base`);
        continue;
      }
      const lines = readFileSync(resolved, 'utf8').split('\n').length;
      if (Number(line) > lines) broken.push(`${path}:${line} is past the end of the file`);
    }

    expect(broken).toEqual([]);
  });
});
