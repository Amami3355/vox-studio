/**
 * Rule 4, made checkable.
 *
 * CONTEXT.md rule 4 names the three things that stop a render being a pure function of
 * `(props, frame)`, and until this file nothing enforced it: no test, no lint rule, only
 * discipline. That is not a hypothetical gap. `runtime/StressControl.tsx` carried the
 * package's only `useState` through a whole commit and a review before anyone named it —
 * the rule was not subtle, nothing was looking. And ADR-0001 spent the rule as *currency*:
 * it dropped `eslint-plugin-react-hooks` on the grounds that its "value is near zero in a
 * codebase where `useState` is forbidden by rule 4", which is a tooling decision resting on
 * a guarantee that had no mechanism behind it.
 *
 * Why it earns a test rather than a review habit: Remotion renders frames out of order,
 * across parallel processes. A component that remembers anything between frames does not
 * draw a *wrong* frame, it draws a *different* frame depending on which worker took it and
 * what that worker had already drawn. That is invisible in a still, invisible in the studio,
 * and invisible in a key-frame hash that happened to be taken by the first worker. It is
 * only visible as a render that stops reproducing, which is the most expensive moment to
 * find it.
 *
 * **Scoped to what the agent can cause to be drawn.** `src/scenes/` and `src/primitives/`
 * are the two levels a plan reaches; `src/design/` is the tokens both resolve against. A
 * control under `src/runtime/` is deliberately outside this net: it is in no catalog and no
 * video, and `StressControl`'s probe has to hold a `delayRender` handle somewhere for the
 * render lifecycle to work at all. That exception is argued in the file that takes it, and
 * this scope is why it does not have to be argued a second time here.
 *
 * **Exactly the three things rule 4 names, and no more.** `useReducer` joins `useState`
 * because it is the same claim under another name. `useRef` and `useEffect` do not: they
 * are absent from these directories today, but a primitive that has to measure the DOM is a
 * shape this repository already accepts, and a check that forbids more than its rule says
 * teaches the rule wrongly.
 *
 * **Whole-line comments are stripped, trailing ones are not.** This repository discusses
 * these constructs in prose constantly — rule 4 itself writes `Date.now()` — so a docblock
 * naming one must not fail the check. Stripping only what is entirely comment cannot hide a
 * line of code, which is the direction to err in. A trailing `// never Date.now() here` will
 * fail this test, and moving the remark onto its own line is the repair.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

/** The levels a plan reaches, and the tokens they resolve against. */
const DRAWN_DIRECTORIES = ['scenes', 'primitives', 'design'];

/**
 * What a frame may not depend on, matched against the syntax that *uses* it rather than the
 * bare name, so that `useStaggeredEntrance` and a type called `DateNow` are not findings.
 */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['useState', /\buseState\s*[(<]/],
  ['useReducer', /\buseReducer\s*[(<]/],
  ['Date.now', /\bDate\.now\s*\(/],
  ['new Date', /\bnew\s+Date\s*\(/],
  ['Math.random', /\bMath\.random\s*\(/],
  ['performance.now', /\bperformance\.now\s*\(/],
  ['requestAnimationFrame', /\brequestAnimationFrame\s*\(/],
  ['setTimeout', /\bsetTimeout\s*\(/],
  ['setInterval', /\bsetInterval\s*\(/],
  ['CSS animation', /\banimation\s*:/],
  ['CSS transition', /\btransition\s*:/],
];

const sourceFilesIn = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFilesIn(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });

/**
 * Block comments go entirely; line comments go only where the line holds nothing else.
 * Both replacements keep the newlines they consume, so a finding's line number is still the
 * line number in the file a reader will open.
 */
const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n');

const findingsIn = (path: string): string[] => {
  const lines = withoutComments(readFileSync(path, 'utf8')).split('\n');

  return lines.flatMap((line, index) =>
    FORBIDDEN.flatMap(([name, pattern]) =>
      pattern.test(line)
        ? [`${relative(SRC, path).replace(/\\/g, '/')}:${index + 1} uses ${name}`]
        : [],
    ),
  );
};

describe('rule 4: the render is a pure function of (props, frame)', () => {
  it.each(DRAWN_DIRECTORIES)('holds src/%s to it', (directory) => {
    const findings = sourceFilesIn(join(SRC, directory)).flatMap(findingsIn);

    // Listed rather than counted: the failure has to name the file and the line, because
    // "one of these ninety files remembers something" is a message that costs a bisect.
    expect(findings).toEqual([]);
  });

  it('scans a real number of files, so an empty net cannot read as a pass', () => {
    // The whole check is a search that found nothing, and a search over nothing also finds
    // nothing. A directory renamed out from under `DRAWN_DIRECTORIES` would otherwise turn
    // this file green and silent, which is the failure mode it exists to prevent.
    for (const directory of DRAWN_DIRECTORIES) {
      expect(sourceFilesIn(join(SRC, directory)).length).toBeGreaterThan(0);
    }
  });

  it('finds what it is looking for when it is there', () => {
    // The patterns are the whole check, so they are exercised against a string that has one
    // of each rather than trusted. Without this, a regex that never matches anything reads
    // exactly like a codebase that never violates the rule.
    const offending = [
      'const [n, setN] = useState<number>(0);',
      'const [s, d] = useReducer(reduce, init);',
      'const t = Date.now();',
      'const d = new Date();',
      'const r = Math.random();',
      'const p = performance.now();',
    ];

    for (const line of offending) {
      expect(FORBIDDEN.filter(([, pattern]) => pattern.test(line))).toHaveLength(1);
    }

    // And leaves the near-misses alone, which is the half that makes it usable.
    for (const line of ['useStaggeredEntrance(', 'type DateNow = number;', 'useSpace(4)']) {
      expect(FORBIDDEN.filter(([, pattern]) => pattern.test(line))).toEqual([]);
    }
  });

  it('does not let a docblock naming a construct fail the check', () => {
    const source = [
      '/**',
      ' * No `useState` here, and no `Date.now()` either.',
      ' */',
      '// Math.random() is not used.',
      'export const two = 2;',
    ].join('\n');

    expect(withoutComments(source).includes('useState')).toBe(false);
    expect(withoutComments(source).includes('Math.random')).toBe(false);
    // The code survives, and on the line it was written on.
    expect(withoutComments(source).split('\n')[4]).toBe('export const two = 2;');
  });
});

describe('ADR-0014: visualization dependencies stay behind internal seams', () => {
  const allSource = sourceFilesIn(SRC);
  const imports = (path: string): string[] => {
    const source = withoutComments(readFileSync(path, 'utf8'));
    return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].flatMap((match) =>
      match[1] ? [match[1]] : [],
    );
  };

  it('allows Visx only inside Vox primitives', () => {
    const findings = allSource.flatMap((path) =>
      imports(path).some((specifier) => specifier.startsWith('@visx/')) &&
      !relative(SRC, path).replace(/\\/g, '/').startsWith('primitives/')
        ? [relative(SRC, path).replace(/\\/g, '/')]
        : [],
    );
    expect(findings).toEqual([]);
  });

  it('allows D3 only in pure core arithmetic or primitive implementations', () => {
    const findings = allSource.flatMap((path) => {
      const local = relative(SRC, path).replace(/\\/g, '/');
      const allowed = local.startsWith('core/') || local.startsWith('primitives/');
      return imports(path).some((specifier) => specifier.startsWith('d3-')) && !allowed
        ? [local]
        : [];
    });
    expect(findings).toEqual([]);
  });
});
