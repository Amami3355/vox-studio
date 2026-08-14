# Make the proof pin and verify its Codex binary

Type: task
Status: open
Blocked by: none

## Objective

`resolveCodex()` picks the agent binary by PATH order and never checks that the one it picked can
actually spawn a sandbox. When it picks wrong, the proof dies with
`PROOF_CODEX_SANDBOX_UNAVAILABLE` — potentially after a paid ElevenLabs dispatch has already been
spent.

## The defect

`packages/production/src/proof/codex-agent.ts:89` resolves the binary as:

```ts
const resolveCodex = async () => {
  if (process.env.VOX_PROOF_CODEX_BIN) return process.env.VOX_PROOF_CODEX_BIN;
  const located = await execFileAsync('where.exe', ['codex'], { windowsHide: true });
  // ...first PATH hit wins
};
```

Two Codex 0.147.0 installs exist on this machine and they are **not** interchangeable:

- `AppData\Local\Programs\OpenAI\Codex\bin\` — first on PATH in an agent session. It resolves its
  sandbox helper **by bare name** and fails with `program not found`.
- `.codex\packages\standalone\releases\0.147.0-x86_64-pc-windows-msvc\bin\` — resolves the helper
  **by absolute path** and works. Every successful proof run in the logs used this one.

So the fallback path silently selects the install that cannot run the proof. The failure surfaces
late, inside the agent driver, with a message that names the sandbox rather than the binary
choice — which is why it reads as an environment problem rather than a resolution bug.

## Why it is worth a ticket rather than a habit

The workaround is to set `VOX_PROOF_CODEX_BIN` before every run, and that has already cost one
session about fifteen minutes. The real cost is asymmetric: the same mistake on a
`--provider elevenlabs` run can burn a dispatch before the sandbox is ever exercised. A proof
harness whose whole purpose is tamper-evident evidence should not depend on an unwritten
environment convention to pick its own agent.

## Scope

- Resolve deterministically: prefer an explicit `VOX_PROOF_CODEX_BIN`, then a pinned known-good
  location, and only then PATH.
- Before the run reaches anything billable, verify the chosen binary can actually spawn its
  sandbox — check that the helper (`codex-code-mode-host.exe`) resolves beside it, or spawn a
  trivial probe and require it to succeed.
- Fail fast with an error that names the rejected binary and the reason, not just
  `PROOF_CODEX_SANDBOX_UNAVAILABLE`.
- Record the resolved binary path and its SHA-256 in `environment.json`, so evidence bundles say
  which install actually authored the plan. Bundles today do not.

## Acceptance

A proof run started with the wrong install first on PATH either selects the working binary or
fails before the first provider dispatch, with a message naming the binary. The evidence bundle
identifies the Codex binary it used.

## Does not claim

This is a harness-ergonomics and fail-fast defect. It does not affect the validity of any existing
bundle: every recorded successful run used the standalone binary, and the machine assertions about
isolation, network exclusivity and dispatch count are unchanged by how the binary was located.

## Comments

### Opened 2026-08-14

Recorded from the long-form Northbridge session handoff, which flagged it as a real defect worth a
ticket. No approach chosen, nothing claimed.
