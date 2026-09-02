#!/usr/bin/env node
// Volume conformance check — cloud-phase ticket 04.
//
// `RunStore` is built on four filesystem primitives that object storage does not
// have: `link()` at run-store.ts:733, `rename()` over an existing target at 1504
// and 1537, `realpath()` at 1314-1372, and exclusive create at 1100, 1465, 1524
// and 1545. This exercises those four against a real mount, from the process
// shape the service will run in, and reports what it observed.
//
// It constructs no `RunStore` and imports nothing from the workspace. A check
// that depends on the store cannot be trusted to tell you the store's
// assumptions are met, and a check with dependencies is a check that cannot run
// in a stock image.
//
//   node check.mjs <mount-path> [--renames=N] [--size=BYTES] [--rounds=N] [--racers=N]
//
// The JSON result goes to stdout and the human summary to stderr, so the result
// survives a pipe. Exit 0 when every asserted primitive holds, 1 when one does
// not or could not be proved, 2 when the check itself broke.

import { fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  statfs,
  symlink,
  unlink,
} from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

// The two contents the rename race alternates between. A reader that sees
// anything other than one of these whole saw a torn write.
const OLD_BYTE = 0x41;
const NEW_BYTE = 0x42;

// `statfs().type` is the kernel's own answer and does not care what /proc/mounts
// claims, which matters when a bind mount makes the two disagree.
const FS_MAGIC = new Map([
  [0xef53, 'ext2/ext3/ext4'],
  [0x58465342, 'xfs'],
  [0x9123683e, 'btrfs'],
  [0x01021994, 'tmpfs'],
  [0x65735546, 'fuse'],
  [0x794c7630, 'overlayfs'],
  [0x6969, 'nfs'],
  [0xff534d42, 'cifs/smb'],
  [0x4d44, 'msdos/vfat'],
]);

function parseOptions(argv) {
  const options = {
    mount: undefined,
    renames: 200,
    size: 1024 * 1024,
    rounds: 200,
    racers: 4,
  };
  for (const argument of argv) {
    const match = /^--(renames|size|rounds|racers)=(\d+)$/.exec(argument);
    if (match) {
      options[match[1]] = Number(match[2]);
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown option ${argument}`);
    } else if (options.mount === undefined) {
      options.mount = argument;
    } else {
      throw new Error(`Unexpected argument ${argument}`);
    }
  }
  if (options.mount === undefined) throw new Error('A mount path is required.');
  if (options.racers < 2) throw new Error('At least two racers are needed for a race.');
  return options;
}

function errorCode(error) {
  return error?.code ?? error?.name ?? 'UNKNOWN';
}

function describe(error) {
  return { code: errorCode(error), message: String(error?.message ?? error) };
}

// /proc/mounts escapes spaces, tabs, newlines and backslashes as octal.
function unescapeMountField(value) {
  return value.replace(/\\(\d{3})/g, (_, digits) =>
    String.fromCharCode(Number.parseInt(digits, 8)),
  );
}

async function readMountTable(canonicalPath) {
  for (const source of ['/proc/self/mounts', '/proc/mounts']) {
    let text;
    try {
      text = await readFile(source, 'utf8');
    } catch {
      continue;
    }
    let best;
    for (const line of text.split('\n')) {
      const fields = line.split(' ');
      if (fields.length < 4) continue;
      const mountPoint = unescapeMountField(fields[1]);
      const isPrefix =
        canonicalPath === mountPoint ||
        canonicalPath.startsWith(mountPoint === '/' ? '/' : `${mountPoint}${sep}`);
      if (!isPrefix) continue;
      if (best && best.mountPoint.length > mountPoint.length) continue;
      best = {
        source,
        device: unescapeMountField(fields[0]),
        mountPoint,
        fsType: fields[2],
        mountOptions: unescapeMountField(fields[3]),
      };
    }
    if (best) return best;
  }
  return null;
}

async function describeMount(requestedPath) {
  const canonicalPath = await realpath(requestedPath);
  const identity = {
    requestedPath,
    canonicalPath,
    device: null,
    mountPoint: null,
    fsType: null,
    mountOptions: null,
    statfsType: null,
    statfsTypeName: null,
    sizeBytes: null,
    freeBytes: null,
  };
  const table = await readMountTable(canonicalPath);
  if (table) {
    identity.device = table.device;
    identity.mountPoint = table.mountPoint;
    identity.fsType = table.fsType;
    identity.mountOptions = table.mountOptions;
  }
  try {
    const stats = await statfs(canonicalPath);
    const type = Number(stats.type);
    identity.statfsType = `0x${type.toString(16)}`;
    identity.statfsTypeName = FS_MAGIC.get(type) ?? 'unrecognised';
    identity.sizeBytes = Number(stats.bsize) * Number(stats.blocks);
    identity.freeBytes = Number(stats.bsize) * Number(stats.bavail);
  } catch (error) {
    identity.statfsTypeName = `unavailable: ${errorCode(error)}`;
  }
  return identity;
}

async function writeExclusive(path, bytes, mode = 0o600) {
  const handle = await open(path, 'wx', mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// ── the four primitives ───────────────────────────────────────────────────

// run-store.ts:733 links a private temporary into place rather than copying it,
// and treats EXDEV as fatal — so the link has to cross directories on one mount.
async function checkLink(scratch) {
  const sourceDirectory = resolve(scratch, 'link/tmp');
  const targetDirectory = resolve(scratch, 'link/artifacts');
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(targetDirectory, { recursive: true });
  const source = resolve(sourceDirectory, randomUUID());
  const target = resolve(targetDirectory, 'artifact.bin');
  const bytes = randomBytes(4096);
  await writeExclusive(source, bytes);

  try {
    await link(source, target);
  } catch (error) {
    return {
      status: 'fail',
      detail: { stage: 'link', error: describe(error) },
      because:
        errorCode(error) === 'EXDEV'
          ? 'link() crossed a device boundary inside one mount; run-store.ts:746 fails the publication.'
          : 'link() is not available on this mount, so an artifact cannot be published without copying it.',
    };
  }

  const sourceStats = await lstat(source);
  const targetStats = await lstat(target);
  const sameInode = sourceStats.ino === targetStats.ino && sourceStats.dev === targetStats.dev;
  const linkedBytes = await readFile(target);
  await unlink(source);
  const survivingBytes = await readFile(target);
  const survivingStats = await lstat(target);

  const detail = {
    inode: String(targetStats.ino),
    sameInode,
    nlinkWhileLinked: targetStats.nlink,
    nlinkAfterUnlink: survivingStats.nlink,
    bytesMatchWhileLinked: linkedBytes.equals(bytes),
    bytesMatchAfterUnlink: survivingBytes.equals(bytes),
  };
  const passed =
    sameInode &&
    targetStats.nlink === 2 &&
    survivingStats.nlink === 1 &&
    detail.bytesMatchWhileLinked &&
    detail.bytesMatchAfterUnlink;
  return {
    status: passed ? 'pass' : 'fail',
    detail,
    because: passed
      ? undefined
      : 'link() returned success without producing a second name for one inode.',
  };
}

// run-store.ts:1537 renames a temporary over a target that already exists. A
// rename that returns success proves nothing about what a reader saw mid-flight,
// so a separate process reads the target throughout and reports every distinct
// content it observed.
async function checkRename(scratch, options) {
  const directory = resolve(scratch, 'rename');
  await mkdir(directory, { recursive: true });
  const target = resolve(directory, 'checkpoint.bin');
  const oldBytes = Buffer.alloc(options.size, OLD_BYTE);
  const newBytes = Buffer.alloc(options.size, NEW_BYTE);
  await writeExclusive(target, oldBytes);

  const reader = fork(SELF, ['--role=reader', `--target=${target}`, `--size=${options.size}`], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const readerReport = new Promise((resolveReport, rejectReport) => {
    reader.on('message', (message) => {
      if (message?.kind === 'report') resolveReport(message);
    });
    reader.on('error', rejectReport);
    reader.on('exit', (code) => rejectReport(new Error(`reader exited early with ${code}`)));
  });
  await new Promise((ready) => reader.once('message', ready));

  let renames = 0;
  let renameError = null;
  let report;
  try {
    try {
      for (let index = 0; index < options.renames; index += 1) {
        const temporary = resolve(directory, `tmp-${randomUUID()}`);
        await writeExclusive(temporary, index % 2 === 0 ? newBytes : oldBytes);
        await rename(temporary, target);
        renames += 1;
      }
    } catch (error) {
      renameError = error;
    }
    reader.send({ kind: 'stop' });
    report = await readerReport;
  } finally {
    // Killed here rather than after the report: a reader left alive holds the
    // IPC channel open and the check never exits.
    reader.kill();
  }

  if (renameError) {
    return {
      status: 'fail',
      detail: { renamesBeforeFailure: renames, error: describe(renameError) },
      because:
        'rename() over an existing target failed while a reader had it open, so a checkpoint cannot advance under a concurrent read.',
    };
  }

  const observed = report.observed.sort();
  const unexpected = observed.filter((entry) => entry !== 'old' && entry !== 'new');
  const detail = {
    renames,
    contentBytes: options.size,
    reads: report.reads,
    observed,
    unexpected,
  };
  if (unexpected.length > 0) {
    return {
      status: 'fail',
      detail,
      because: `a concurrent reader saw ${unexpected.join(', ')} — rename() over an existing target is not atomic here.`,
    };
  }
  if (observed.length < 2) {
    return {
      status: 'inconclusive',
      detail,
      because:
        'the reader never observed a transition, so the race it was there to witness did not happen. Raise --renames or --size.',
    };
  }
  return { status: 'pass', detail };
}

// run-store.ts:1314-1372 resolves the run root and its parent and compares the
// result to what it expects. The property that check depends on is that
// realpath() follows links through this mount rather than returning the path it
// was handed.
async function checkRealpath(scratch) {
  const real = resolve(scratch, 'realpath/real');
  const links = resolve(scratch, 'realpath/links');
  await mkdir(real, { recursive: true });
  await mkdir(links, { recursive: true });
  const file = resolve(real, 'run.json');
  await writeExclusive(file, Buffer.from('{}'));

  const canonicalScratch = await realpath(scratch);
  const canonicalParent = await realpath(dirname(file));
  const expected = resolve(canonicalParent, 'run.json');
  const canonicalFile = await realpath(file);

  const throughLink = resolve(links, 'inner');
  const escapingLink = resolve(links, 'escape');
  const detail = {
    canonicalParent,
    resolvesToExpectedChild: canonicalFile === expected,
    parentIsInsideMount: canonicalParent.startsWith(canonicalScratch),
    symlinkSupported: false,
    resolvesThroughSymlink: null,
    escapeResolvesOutside: null,
  };
  try {
    await symlink(real, throughLink);
    await symlink(tmpdir(), escapingLink);
    detail.symlinkSupported = true;
  } catch (error) {
    return {
      status: 'fail',
      detail: { ...detail, error: describe(error) },
      because:
        'a symlink could not be created on this mount, so realpath() cannot be shown to resolve through one.',
    };
  }
  detail.resolvesThroughSymlink =
    (await realpath(resolve(throughLink, 'run.json'))) === canonicalFile;
  // The containment check at run-store.ts:1331 is only worth anything if a link
  // that leaves the mount resolves to somewhere outside it.
  const escaped = await realpath(escapingLink);
  detail.escapeResolvesOutside = !escaped.startsWith(canonicalScratch);

  const passed =
    detail.resolvesToExpectedChild &&
    detail.parentIsInsideMount &&
    detail.resolvesThroughSymlink &&
    detail.escapeResolvesOutside;
  return {
    status: passed ? 'pass' : 'fail',
    detail,
    because: passed
      ? undefined
      : 'realpath() did not resolve through this mount as the store assumes.',
  };
}

// run-store.ts:1465 takes the ledger's lease with an exclusive create, which is
// the lock. A mount that is usually exclusive passes a single attempt, so this
// runs as a race and repeats it.
async function checkExclusiveCreate(scratch, options) {
  const directory = resolve(scratch, 'exclusive');
  await mkdir(directory, { recursive: true });

  const racers = [];
  for (let index = 0; index < options.racers; index += 1) {
    const child = fork(SELF, ['--role=racer', `--racer=${index}`], {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    await new Promise((ready) => child.once('message', ready));
    racers.push(child);
  }

  const rounds = [];
  const failures = [];
  const otherErrors = new Set();
  let modeObserved = null;
  try {
    for (let round = 0; round < options.rounds; round += 1) {
      const path = resolve(directory, `lease-${round}.lock`);
      const atMs = Date.now() + 12;
      const answers = Promise.all(
        racers.map(
          (child) =>
            new Promise((answered) => {
              child.once('message', answered);
            }),
        ),
      );
      for (const child of racers) child.send({ kind: 'race', path, atMs });
      const results = await answers;
      const winners = results.filter((result) => result.outcome === 'won').length;
      for (const result of results) {
        if (result.outcome === 'other') otherErrors.add(result.code);
      }
      if (winners !== 1) failures.push({ round, winners, results });
      if (modeObserved === null) {
        const stats = await lstat(path).catch(() => null);
        if (stats) modeObserved = `0${(stats.mode & 0o777).toString(8)}`;
      }
      rounds.push(winners);
    }
  } finally {
    for (const child of racers) child.kill();
  }

  const detail = {
    rounds: options.rounds,
    racersPerRound: options.racers,
    roundsWithExactlyOneWinner: rounds.filter((winners) => winners === 1).length,
    roundsWithMoreThanOneWinner: rounds.filter((winners) => winners > 1).length,
    roundsWithNoWinner: rounds.filter((winners) => winners === 0).length,
    loserErrorCodesOtherThanEEXIST: [...otherErrors],
    modeOfCreatedFile: modeObserved,
    firstFailures: failures.slice(0, 3),
  };
  const passed = failures.length === 0 && otherErrors.size === 0;
  return {
    status: passed ? 'pass' : 'fail',
    detail,
    because: passed
      ? undefined
      : detail.roundsWithMoreThanOneWinner > 0
        ? 'two creators won the same exclusive create, so the ledger lease at run-store.ts:1465 is not a lock here.'
        : 'a racing creator failed with something other than EEXIST, so the lock cannot tell contention from breakage.',
  };
}

// Not one of the four, and recorded rather than asserted: run-store.ts:1545
// swallows a failed directory fsync, so a mount that cannot do it weakens
// durability silently instead of failing.
async function observeDirectorySync(scratch) {
  const directory = resolve(scratch, 'fsync');
  await mkdir(directory, { recursive: true });
  await writeExclusive(resolve(directory, 'entry.bin'), Buffer.from('x'));
  const handle = await open(directory, 0).catch((error) => error);
  if (handle instanceof Error) {
    return { id: 'directory-fsync', result: `open failed: ${errorCode(handle)}` };
  }
  try {
    await handle.sync();
    return { id: 'directory-fsync', result: 'ok' };
  } catch (error) {
    return { id: 'directory-fsync', result: `sync failed: ${errorCode(error)}` };
  } finally {
    await handle.close();
  }
}

// ── the forked roles ──────────────────────────────────────────────────────

async function runReader(argv) {
  const target = argv.find((entry) => entry.startsWith('--target='))?.slice('--target='.length);
  const size = Number(argv.find((entry) => entry.startsWith('--size='))?.slice('--size='.length));
  const oldBytes = Buffer.alloc(size, OLD_BYTE);
  const newBytes = Buffer.alloc(size, NEW_BYTE);
  const observed = new Set();
  let reads = 0;
  let stopped = false;
  process.on('message', (message) => {
    if (message?.kind === 'stop') stopped = true;
  });
  process.send({ kind: 'ready' });
  while (!stopped) {
    reads += 1;
    try {
      const bytes = await readFile(target);
      if (bytes.equals(oldBytes)) observed.add('old');
      else if (bytes.equals(newBytes)) observed.add('new');
      else if (bytes.length !== size) observed.add(`short:${bytes.length}`);
      else observed.add('torn');
    } catch (error) {
      observed.add(errorCode(error) === 'ENOENT' ? 'missing' : `error:${errorCode(error)}`);
    }
  }
  process.send({ kind: 'report', observed: [...observed], reads });
  // The parent kills us once it has the report; exiting here would race it.
  await new Promise(() => {});
}

async function runRacer() {
  process.on('message', async (message) => {
    if (message?.kind !== 'race') return;
    const wait = message.atMs - Date.now() - 2;
    if (wait > 0) await new Promise((tick) => setTimeout(tick, wait));
    // The last two milliseconds are spun rather than slept: a mount that is
    // usually exclusive needs the attempts to land together to fail.
    while (Date.now() < message.atMs) {
      /* spin to the barrier */
    }
    try {
      const handle = await open(message.path, 'wx', 0o600);
      await handle.close();
      process.send({ outcome: 'won' });
    } catch (error) {
      const code = errorCode(error);
      process.send(code === 'EEXIST' ? { outcome: 'lost', code } : { outcome: 'other', code });
    }
  });
  process.send({ kind: 'ready' });
  await new Promise(() => {});
}

// ── the run ───────────────────────────────────────────────────────────────

function summarise(result) {
  const lines = [
    `volume conformance — ${result.verdict.toUpperCase()}`,
    `  mount    ${result.mount.canonicalPath} (${result.mount.fsType ?? '?'} on ${result.mount.device ?? '?'}, statfs ${result.mount.statfsTypeName})`,
    `  options  ${result.mount.mountOptions ?? '?'}`,
    `  process  uid=${result.process.uid} gid=${result.process.gid} node=${result.process.node} host=${result.process.hostname} containerized=${result.process.containerized}`,
  ];
  for (const entry of result.results) {
    lines.push(`  ${entry.status === 'pass' ? '✓' : '✗'} ${entry.id}: ${entry.status}`);
    if (entry.because) lines.push(`      ${entry.because}`);
  }
  for (const entry of result.observations) {
    lines.push(`  · ${entry.id}: ${entry.result}`);
  }
  return lines.join('\n');
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const mount = await describeMount(options.mount);
  const scratch = resolve(mount.canonicalPath, `.volume-conformance-${randomUUID()}`);
  await mkdir(scratch);

  const results = [];
  const observations = [];
  try {
    const checks = [
      ['link', 'link() creates a second name for one inode', () => checkLink(scratch)],
      [
        'rename-over-existing',
        'rename() over an existing target is atomic to a concurrent reader',
        () => checkRename(scratch, options),
      ],
      [
        'realpath',
        'realpath() resolves through the mount and through a symlink on it',
        () => checkRealpath(scratch),
      ],
      [
        'exclusive-create',
        'exclusive create refuses the loser of a repeated race',
        () => checkExclusiveCreate(scratch, options),
      ],
    ];
    for (const [id, title, run] of checks) {
      try {
        const outcome = await run();
        results.push({ id, title, ...outcome });
      } catch (error) {
        results.push({
          id,
          title,
          status: 'fail',
          detail: { error: describe(error) },
          because: 'the check threw before it could reach a verdict.',
        });
      }
    }
    observations.push(await observeDirectorySync(scratch));
  } finally {
    await rm(scratch, { recursive: true, force: true }).then(
      () => observations.push({ id: 'cleanup', result: 'scratch directory removed' }),
      (error) => observations.push({ id: 'cleanup', result: `failed: ${errorCode(error)}` }),
    );
  }

  const verdict = results.every((entry) => entry.status === 'pass') ? 'pass' : 'fail';
  const result = {
    check: 'volume-conformance',
    ticket: 'cloud-phase/04',
    schemaVersion: 1,
    verdict,
    startedAt,
    finishedAt: new Date().toISOString(),
    parameters: {
      renames: options.renames,
      contentBytes: options.size,
      rounds: options.rounds,
      racers: options.racers,
    },
    mount,
    process: {
      uid: typeof process.getuid === 'function' ? process.getuid() : null,
      gid: typeof process.getgid === 'function' ? process.getgid() : null,
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      hostname: hostname(),
      containerized: existsSync('/.dockerenv'),
    },
    results,
    observations,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  console.error(summarise(result));
  return verdict === 'pass' ? 0 : 1;
}

const role = process.argv.find((entry) => entry.startsWith('--role='))?.slice('--role='.length);
try {
  if (role === 'reader') await runReader(process.argv.slice(2));
  else if (role === 'racer') await runRacer();
  else process.exitCode = await main();
} catch (error) {
  console.error(`volume conformance check broke: ${error?.stack ?? error}`);
  process.exitCode = 2;
}
