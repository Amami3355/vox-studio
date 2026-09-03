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

const ROOT = process.argv[2] ?? '/app';

const scan = await scanImageFiles(ROOT);

console.info(`scanned ${scan.scanned.length} files under ${ROOT}`);
if (scan.scanned.length === 0) {
  // A scan that walked nothing would pass for the wrong reason.
  console.info('FAIL: the scan found no files at all');
  process.exit(2);
}

for (const violation of scan.violations) console.info(`VIOLATION ${violation}`);
console.info(scan.pass ? 'leak scan passed' : `leak scan failed with ${scan.violations.length}`);
process.exit(scan.pass ? 0 : 1);
