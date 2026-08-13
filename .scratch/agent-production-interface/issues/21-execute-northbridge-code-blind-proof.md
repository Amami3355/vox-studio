# Execute and sign off the Northbridge code-blind proof

Type: task
Status: claimed
Blocked by: 20

## Objective

Run ticket 09 with the real George/`eleven_v3` provider path, preserve the evidence and obtain
the required independent watch-and-listen verdict. This ticket, not planning or the prototype,
is the only place an end-to-end code-blind pass may be claimed.

## Scope

- Freeze launcher, service, contract and environment hashes before exposing the task to a fresh
  generalist agent.
- Execute the one-dispatch main Run and both zero-network negative probes without intervention.
- Preserve and audit the complete evidence bundle; rerun no paid operation silently.
- Present the exact preview hash to one named human evaluator and store every required verdict
  row and note.
- Record all explicit non-claims and keep gap 8 open unless the shipped vertical slice receives
  its own explicit verdict.

## Acceptance

`machineVerdict` and `humanVerdict` are both `pass`, every referenced artifact is present and
hash-valid, and the final report distinguishes this proof from the measurement gate. If either
verdict is false or pending, report the actual incomplete/failed result without euphemism.

## Verification

```text
pnpm --filter @vox/production proof:northbridge -- --provider elevenlabs
pnpm --filter @vox/production verify:proof -- <evidence-directory>
```

## Progress

Claimed 2026-08-13. The paid proof **has now run once**; see the 2026-08-14 entry at the end.

- The one-time Windows setup completed with `CODEX_ELEVATED_SANDBOX_READY`. The fresh Codex
  driver now passes work-root, repository, trusted-service, credentials and direct-network
  isolation probes through the elevated Windows sandbox profile.
- The native launcher reaches the trusted Production service through a dedicated public-to-
  private named-pipe bridge whose public ACL grants only the required local sandbox principals.
- A provider-free fresh-agent rehearsal originally rendered successfully but exposed hidden
  harness assumptions: the harness expected `run-main`, a second agent `record`, all contract
  categories and an unpublished asset identity even though none was required by the task
  message or public contract.
- On 2026-08-14 the user selected option A. The agent now chooses any contained Run path and
  drives production only until the narrated preview is rendered. The harness selects that Run
  from the audited successful `run.render`, fills only post-terminal evidence gaps, proves Take
  reuse and read-only status itself, and rejects missing, ambiguous or out-of-root Runs.
- The provider-free Codex rehearsal at
  `proofs/2026-08-13T220756-284Z-northbridge-night-bus` completed with
  `machineVerdict: pass`, `humanVerdict: pending`, 54/54 machine assertions passing and a
  hash-indexed 4,800,284-byte preview. It is correctly claim-ineligible because its provider
  is `fixture`.
- `verify:proof` remains expected to fail with `PROOF_VERDICT_NOT_PASS` while the independent
  human verdict is pending. Do not run the one real George/`eleven_v3` dispatch without fresh
  explicit authorisation.

### 2026-08-14 — the paid dispatch happened

The single authorised ElevenLabs attempt ran to completion at exit 0 against commit `80623d9`,
after a green re-verification (358 tests, typecheck, native distribution, contract projections).

Evidence: `proofs/2026-08-13T222606-424Z-northbridge-night-bus`, `provider: elevenlabs`,
`claimEligible: true`, agent `fresh-generalist` (`gpt-5.6-sol` via `codex-cli 0.147.0`),
restricted token `SAFER_CONSTRAINED` over a Windows named pipe.

- `machineVerdict: pass`, 54/54 assertions, no failures.
- Exactly one `provider-dispatch` service event; direct network denied with zero direct events.
- Agent used 3 plan versions, 3 `validate` calls, 1 Preflight, 0 post-record plan versions and
  received no human hint. `record` then the harness probe reported `recorded` then `reused`.
- Scenario: both capabilities, `highlightBar` on `March`, unique Word anchor, Northbridge asset
  resolved exactly `placeholder`.
- Media: H.264/AAC, Take 25.840 s, preview 25.877333 s, audio non-silent at −3.1 dB max.
- Preview SHA-256 `ca2d43f84f303fee8d3b13af50d3526a5e66ab01c3f44fa0c6cf4aab207545a5`
  (6,508,036 bytes), `takeId` `c5b3da491560`. On-disk hash reverified as matching the form.

**This bundle does not count.** The user watched the preview and challenged it. Two assertions
turned out to claim more than they measured, so its `machineVerdict: pass` rested on guarantees
that were not real:

- `media.audio-non-silent` ran `volumedetect` on the Take MP3 while `ffprobe` read the preview
  MP4. A preview muxed with a silent AAC track would have passed.
- The Codex driver spread the whole harness environment into the agent, so a machine-level
  `ELEVENLABS_API_KEY` reached the sandbox. Confirmed empirically: `if defined
  ELEVENLABS_API_KEY` answered `PRESENT` from inside the proof sandbox. The leak scan missed it
  because it scans files and this was an environment variable.

Both are fixed in `e9a92cf`. The preview itself was genuinely audible — that part of the
challenge did not reproduce.

### 2026-08-14 — second paid dispatch, against the fixed harness

Authorised by the user after the defects were found. Ran to completion at exit 0 against commit
`e9a92cf`, after 365 green tests, typecheck, native distribution and contract projections.

Evidence: `proofs/2026-08-13T225821-834Z-northbridge-night-bus`, `provider: elevenlabs`,
`claimEligible: true`, agent `fresh-generalist` (`gpt-5.6-sol` via `codex-cli 0.147.0`).

- `machineVerdict: pass`, **56/56** assertions, no failures.
- `isolation.credentials-environment-denied` passes on three per-secret sandbox probes, each
  exit 0 and each answering `ABSENT:<name>` — by name only, no value in the evidence.
- `media.preview-audio-non-silent` and `media.take-audio-non-silent` pass separately, measured
  at -5.6 dB and -2.5 dB. The distinct readings prove the preview is now genuinely measured.
- Exactly one provider dispatch; direct network denied with zero direct events.
- Agent used 1 plan version, 1 `validate`, 1 Preflight, 0 post-record versions, 0 human hints.
- Scenario: both capabilities, `highlightBar` on `March`, unique Word anchor, `placeholder`.
- Media: H.264/AAC, Take 24.320 s, preview 24.362667 s.
- Preview SHA-256 `502afe11b44324b4e165ee56148ffbdd66702d548e06bf8ccac8064d1f0a3c1a`
  (5,394,777 bytes), `takeId` `f089beb94850`. Hash reverified on disk against the form.

**Still not a pass.** `humanVerdict` is `pending`: six unfilled rows, no named evaluator.
`verticalSliceReviewed: false`; gap 8 stays open. Two dispatches have now been spent.
