# Build the code-blind proof harness

Type: task
Status: resolved
Blocked by: 19

## Objective

Automate ticket 09's isolated Northbridge execution, transcript, negative probes, evidence
bundle and machine verdict without substituting a scripted plan for the generalist agent.

## Scope

- Create the restricted work root/principal, initial two-file inventory, task message and frozen
  request; start the trusted service and capture permissions, IPC and network policy.
- Capture agent/tool and exact command transcripts, filesystem deltas, revisions, hashes,
  stderr/stdout bytes and network audit outside the agent-writable root.
- Enforce plan/validation/Preflight/repair and one-dispatch limits while leaving plan authorship
  to the fresh generalist agent.
- Run the zero-budget paused probe and invalid-grant failed probe after the nominal Run.
- Implement every itemized machine assertion, ffprobe/audio checks, leak scans, hash index,
  `SUMMARY.md` non-claims and the exact human-verdict template.
- Make absence, pending evidence or a false assertion fail; never derive a code-blind claim from
  ticket 03 or unit tests.

## Acceptance

A dry run with an injected provider produces a complete evidence bundle and deliberately seeded
violations independently fail the relevant assertion, leak gate and aggregate machine verdict.

## Verification

```text
pnpm --filter @vox/production typecheck
pnpm test -- packages/production/tests/proof-harness.test.ts packages/production/tests/proof-assertions.test.ts
pnpm --filter @vox/production proof:northbridge -- --provider fixture
```

## Answer

Implemented 2026-08-13.

- The frozen Northbridge request, task message and non-claims now drive one reusable proof
  harness. It creates an empty isolated agent root containing exactly `vox.exe` and
  `request.json`, a separate trusted service root and an evidence root that the agent cannot
  write.
- The harness starts authenticated named-pipe IPC, applies the restricted Windows principal,
  proves work-root read/write plus denied repository, trusted-service and Codex-credential
  reads, and records both SAFER and optional elevated-Codex sandbox evidence.
- Every invocation stores exact Base64 stdout/stderr bytes, exit status, input/output hashes,
  filesystem deltas and service network events. The proof derives plan-version limits from
  submitted `run.validate` input hashes instead of accepting driver-reported counters.
- The fixture driver exercises all public contract categories and lifecycle commands,
  verified Take reuse, zero-budget pause, invalid-grant failure and preservation of the main
  Run. It renders a real H.264/AAC preview, probes duration and audible audio, scans the full
  agent-readable tree for leaks and writes a hash-indexed evidence bundle.
- Fifty-one itemized assertions are fail-closed. A fixture run deliberately fails only the
  fresh-unscripted-agent assertion and retains `humanVerdict: pending`; it never emits a
  code-blind pass. Independent tests seed both a readable-file leak and a forbidden network
  event and prove that each fails its own assertion and the aggregate verdict.
- A real Codex driver is wired for ticket 21. It disables rules, plugins, apps, web search and
  multi-agent delegation; filters secrets out of shell subprocesses; selects a custom elevated
  Windows permission profile with only minimal system reads plus work-root writes; and refuses
  to start unless repository, service, credentials and direct network are all inaccessible.
  ElevenLabs mode requires this fresh-agent driver and preserves working roots on failure.

Verification actually run:

```text
pnpm --filter @vox/production typecheck
  PASS
pnpm test -- packages/production/tests/proof-harness.test.ts packages/production/tests/proof-assertions.test.ts
  PASS - 2 files, 7 tests, including preserved fail-closed evidence on driver abort
pnpm --filter @vox/production proof:northbridge -- --provider fixture
  PASS - complete bundle at .scratch/agent-production-interface/proofs/2026-08-13T200156-336Z-northbridge-night-bus
  EXPECTED VERDICT - machine fail only because the driver is fixture-scripted; human pending
biome check (changed proof files)
  PASS
git diff --check
  PASS
```

This resolves the harness acceptance criterion only. No fresh-agent model execution, real
ElevenLabs dispatch or independent watch/listen verdict has yet passed; ticket 21 exclusively
owns that claim.
