// The image's leak scan, run from inside the container over the layers it actually has.
//
//   docker cp deploy/image-leak-scan.mjs <container>:/tmp/scan.mjs
//   docker exec <container> /app/packages/production/node_modules/.bin/tsx /tmp/scan.mjs
//
// This is *not* `scanReadableFiles`, the agent-distribution scan. That one forbids the `.ts`
// extension and the marker `ProductionCommandService` because it answers "may the agent read
// this?" — and the image is the production runtime, made of exactly those. Running it here would
// fail on nearly every file by design, and a gate that must be suppressed to pass is not a gate.
// ADR-0018 decision 8 was corrected on 2026-09-03 to say so.
//
// What an image can honestly be scanned for is what a careless `COPY . .` produces: baked secret
// material, and the agent's own distribution travelling inside the service image.
import { scanImageFiles } from '/app/packages/production/src/proof/image-scan.ts';

/**
 * **This scanned `/app` alone, and claimed "the image's readable layers".**
 *
 * Found by the spec review of `bc5a7dc..4915cef`: `/app` is where a careless `COPY . .` puts the
 * repository, so it is the right first root — but it is not where a credential most often ends up
 * in a Node image. `/root/.npmrc` is written by npm and pnpm as a matter of course and is the
 * single most likely baked credential in an image built this way; `CREDENTIAL_FILENAMES` has
 * named `.npmrc` since the scan was written and nothing ever walked the directory holding it.
 *
 * `/etc/vox` is where the deployment's env file lands on the VM. It should not exist *in the
 * image* at all, and a scan that never looks cannot say so.
 *
 * Roots that do not exist are reported as absent rather than skipped in silence: "nothing was
 * found" and "nothing was looked at" are the two readings a scan must never conflate.
 */
const DEFAULT_ROOTS = ['/app', '/root', '/pnpm', '/etc/vox'];

/**
 * The package store is content-addressed third-party tarballs, and it is excluded for the reason
 * `node_modules` is: it is not what a careless `COPY . .` leaks, and reading every byte of it
 * turns this into a scan nobody runs.
 *
 * It is applied **only to the auxiliary roots**, never to `/app`. Adding `store` to the global
 * skip set would silently stop the scan descending into any directory of that name in the
 * repository too — narrowing the one root that matters most, to speed up the ones that matter
 * least.
 */
const AUXILIARY_SKIP = new Set(['node_modules', '.git', '.pnpm-store', 'store', '.cache']);

const roots = process.argv.slice(2);
const targets = roots.length > 0 ? roots : DEFAULT_ROOTS;

let scannedTotal = 0;
let absent = 0;
const violations = [];

for (const root of targets) {
  const options = root === '/app' ? {} : { skip: AUXILIARY_SKIP };
  let scan;
  try {
    scan = await scanImageFiles(root, options);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.info(`absent  ${root} (nothing to scan)`);
      absent += 1;
      continue;
    }
    throw error;
  }
  console.info(`scanned ${scan.scanned.length} files under ${root}`);
  scannedTotal += scan.scanned.length;
  violations.push(...scan.violations.map((violation) => `${root}: ${violation}`));
}

if (scannedTotal === 0) {
  // A scan that walked nothing would pass for the wrong reason.
  console.info(`FAIL: the scan found no files at all across ${targets.length} root(s)`);
  process.exit(2);
}

for (const violation of violations) console.info(`VIOLATION ${violation}`);
console.info(
  violations.length === 0
    ? `leak scan passed over ${scannedTotal} files in ${targets.length - absent} root(s)`
    : `leak scan failed with ${violations.length}`,
);
process.exit(violations.length === 0 ? 0 : 1);
