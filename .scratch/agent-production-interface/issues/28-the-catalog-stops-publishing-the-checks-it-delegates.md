# 28: The catalog stops publishing the checks it delegates

Status: done

## Problem Statement

The contract publishes the compiler's check meanings twice, in two categories, byte for byte.

`buildContractProjections` takes the checks *out of* the catalog — `assertObject(catalog.checks,
'checks')` — and publishes them as the `checks` category. It then publishes the catalog as its own
category with `catalog.checks` still on it. The two documents are 9,367 characters each and hash
identically.

Every consumer that reads the whole contract therefore reads the same document twice. The crew is
the consumer that makes this expensive: it assembles one instructions prefix from every category
the index publishes, bodies whole and unsummarised, and sends that prefix on every turn of every
Run. So roughly **15% of a ~125,000-character prefix is one document repeated**, paid per model
call, per repair cycle, for the life of every Run.

It is not a formatting accident. It is a projection carrying a section that another projection
exists to publish, and the index says so plainly: `catalog` is *"Scene capabilities, semantic time
and compiler checks"* while `checks` is *"Compiler error and warning meanings and repairs."* Two
summaries claiming the same material is the readable symptom of the duplication.

Fixing it downstream is worse than fixing it here. A consumer that dropped the repeat would be
editing a published projection, which is exactly what the crew's assembly rule forbids — bodies go
in whole, because a consumer that edits a contract is a consumer that has an opinion about it. The
duplication is the contract's to remove.

## Solution

Publish each document in one place. The `checks` category carries the check meanings; the
`catalog` category carries capabilities and semantic time and delegates the checks by not
repeating them.

The categories and their summaries do not change count or identity — five in, five out, the index
unchanged in shape. What changes is that the catalog projection stops carrying a section the
contract publishes beside it.

The catalog's own summary is corrected to stop claiming the checks, since that claim is what made
the duplication look intentional.

This moves contract bytes, so it is a contract version movement and the recorded fixtures that
consumers hold are re-recorded in the same change. The stale-fixture guard exists for exactly this
and must be green without a hand edit.

## Implementation Decisions

- **The checks stay where they are richest and are removed from where they are repeated.** The
  `checks` category exists to publish them, is named for it, and is what the crew's refusal reader
  looks them up in. The catalog is the copy.
- **The internal source does not have to change.** Whether the checks continue to live inside the
  catalog source and are lifted at projection time is an implementation detail; what is published
  is the decision. If lifting them at projection time is the smaller change, take it.
- **The index's category list is unchanged.** Five categories, same ids, same order. Only the
  catalog's summary is corrected.
- **This is a contract version movement, deliberately.** The published bytes move, consumers hold
  recorded fixtures of them, and the guard that catches this is the guard working. Bump what the
  contract's own versioning rules say to bump, and say so in the change.
- **No capability, action, anchor form or check meaning changes.** Every code the checks category
  publishes, its `means` and its `repair`, are the same strings in the same shape. A consumer
  looking a code up finds the same answer; it just finds it in one place.

## Testing Decisions

The assertion that matters is the one that would have caught this: **no two published categories
carry byte-identical content.** That is a property of the projection set rather than of any one
category, it is cheap to check, and it generalises — a future projection that embeds another's
document fails at the point it is introduced rather than after someone measures a prefix.

Beyond that, the existing contract tests hold: every category the index names is published, the
checks category still publishes every code the compiler can emit with its `means` and `repair`,
and the catalog still publishes every capability, action and anchor form it did before. The
regression to guard is subtraction that went too far — a catalog missing something that was not
the checks.

Consumers are covered by their own recorded fixtures and the stale-fixture guard, which should
fail before this change and pass after re-recording.

## Out of Scope

- **Any other overlap between projections.** If the duplication check finds more, each is its own
  decision about which projection owns the material. This ticket removes the one that is
  byte-identical and unambiguous.
- **Reorganising the catalog.** Capabilities and semantic time stay exactly as published.
- **Changing what the checks contract says.** Not a word of it moves.
- **Anything about how a consumer assembles a prefix.** That is the consumer's business, and the
  point of this ticket is that it should not have to have an opinion.

## What the repeat actually cost, measured

The five published contract bodies, serialised as the crew receives them, came to **126,927
characters** before this change and **117,332** after. The saving is **9,595 characters off every
turn of every Run** — the 9,585-character checks document plus the ten characters of the
`,"checks":` key that carried it.

**The ticket's "roughly 15%" counted both copies.** The checks document is 9,585 of 126,927
characters, and at two copies it occupied 15.1% of the assembled prefix; what a reader can give
back is the repeat, which is **7.6%**. The premise stands and the arithmetic was double-counted:
the fix removes one copy, not the material.

Per category, before → after: `language` 19,831 → 19,831 · `plan` 7,387 → 7,387 · `catalog`
**66,016 → 56,421** · `checks` 9,585 → 9,585 · `protocol` 24,108 → 24,108. Only the catalog moved,
which is the shape a subtraction that went exactly far enough leaves behind.

## Two notes for whoever reads this next

**The checks were lifted at projection time, not moved at the source.** `catalog.json` in the
video package is untouched and `manifestVersion` stays at **4** — no capability, action, anchor
form or check meaning moved, so nothing the ADRs version has changed. The ticket allowed either
route and this was the smaller one: the checks stay authored beside the capabilities whose
refusals they explain, and only the projection stops repeating them.

**The index's own `contractVersion` deliberately did not move.** The `catalog` category went from
3 to 4 because its published document changed. The index's version stays at 1: its bytes moved
only because the catalog's summary is one of the strings it publishes, and its shape — five
categories, same ids, same order — is what that number versions. Nothing keys a cache on either
number today; both are the record that a document moved. A later session that decides the index
should version its content instead should change both this and the reasoning, not just the digit.

One thing left deliberately untouched: `teaching_surface.py`'s module docstring still says the
projections "assemble into ~125,000 characters of instructions, and the catalog alone is half of
that". Both remain roughly true at 117,332 and 48%, and the consumer's own prose is out of scope
here — but it is the sentence a later session would want to re-measure.

**Blocked by:** None (can start immediately)

- [x] The check meanings are published in exactly one category — `buildContractProjections` lifts
      `catalog.checks` into the `checks` category and publishes `catalogWithoutChecks` beside it
- [x] The catalog's summary no longer claims material it does not carry — *"Scene capabilities and
      semantic time."*, the clause about compiler checks removed
- [x] The index publishes the same five categories, in the same order, with the same ids — asserted
      outright by `publishes the same five categories, in the same order, under the same ids`
- [x] Every code, `means` and `repair` published before is published after, unchanged —
      `generated/checks.json` is byte-identical and does not appear in this change's diff at all
- [x] Every capability, action and anchor form published before is published after, unchanged —
      `{ ...catalog.contract, checks: source.checks }` equals the source catalog exactly, so the
      subtraction removed the checks and nothing else
- [x] A test asserts that no two published categories carry byte-identical content — `never carries
      one category document inside another`, written first and **failing on the old projections**,
      which is what makes it the assertion that would have caught this
- [x] The contract version moves as the contract's own rules require, and the change says so — the
      `catalog` category moves 3 → 4, with the reason in the comment beside it
- [x] Consumer fixtures are re-recorded and the stale-fixture guard is green with no hand edit —
      `record:crew-fixtures` rewrote `contract-show-catalog.stdout` (66,381 → 56,782 bytes) and
      `contract-index.stdout` (552 → 535); `crew-fixture-freshness` and `contracts:check` are both
      green

**Green at this change:** vitest **891/891 across 60 files** (~62 s, up from 889 by the two new
assertions), `pnpm --filter @vox/production typecheck` clean, `biome check packages/production`
clean over 84 files, and crew pytest **exit 0 — 298 collected, 297 passed, 1 skipped** (re-run
because the fixtures moved; this suite prints no summary line, so the exit code is the evidence).
