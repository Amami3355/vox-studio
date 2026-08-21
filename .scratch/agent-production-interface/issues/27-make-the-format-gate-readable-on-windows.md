# Make the format gate readable on Windows

Type: task
Status: open
Blocked by: none

## Objective

`pnpm exec biome check .` reports 20 errors on this machine and zero in CI. Every one of them is a
line ending. The gate is therefore unreadable exactly where the code is edited, and green exactly
where nobody is looking — the worst arrangement available for a check whose whole job is to be
believed.

`deb6113` fixed this for two directories because `catalog:check` was red for the identical reason.
This is the same defect at the scale of the repository.

## The cause, measured

`core.autocrlf` is `true`, and the root `.gitattributes` written by `deb6113` covers only the two
generated-JSON directories. Everything else is checked out converted:

```
tracked files with CRLF in the worktree : 309
tracked files with LF only              :  24
```

Biome formats to LF and has no `lineEnding` override in `biome.json`, so it proposes to rewrite 20
files whose only difference from the proposal is `␍`. The files it names — `biome.json`,
`package.json`, four `tsconfig.json`, and the workspace manifests — are files nobody on this branch
touched.

## Why this is smaller than it looks

**The repository is already LF. Only the checkout is not.**

```
committed blobs with CRLF : 1   (packages/video/public/vertical-slice.vo.mp3 — binary, a byte coincidence)
committed blobs LF only   : 333
```

So there is **no renormalising commit to make**, and no content diff to review. The predecessor
handoff estimated *"`* text=auto eol=lf` plus a renormalising commit"*; the second half is not
needed. This is one attributes file and one fresh checkout of the working tree, exactly as
`deb6113` turned out to be — that commit changed zero bytes of content and the same holds here.

`text=auto` sniffs content, so the mp3 and any future binary are left alone without being listed.

## Scope

Replace the root `.gitattributes` with a repo-wide rule, keeping the two explicit entries only if
they still say something the general rule does not:

```
* text=auto eol=lf
```

Then re-checkout the working tree so the files on disk match, and confirm `biome check` reports what
it is for.

**Keep the comment.** The current file explains *why* the generated projections are pinned — their
bytes are the contract and `--check` compares bytes. That reason survives and should stay; the new
rule adds a second one, which is that a format gate nobody can read is not a gate.

**Do not add a `lineEnding` setting to `biome.json`.** Configuring the formatter to accept CRLF
would make the tool agree with the checkout and disagree with the repository, and would put the
files back into the state where CI and this machine can differ. Fix the checkout, not the reader.

## Acceptance

`pnpm exec biome check .` reports the same result on this machine as in CI. `pnpm catalog:check`
stays green. `git status` is clean after the re-checkout, and `git log -p` for the change shows no
content diff — only `.gitattributes`.

## Does not claim

**It does not make `biome check` green.** It makes it *true*. If real formatting errors are hiding
behind the 20 line-ending ones, this is what reveals them, and fixing those is ordinary work that
belongs to whoever the diagnostics name.

**It does not change what anyone's editor writes.** `eol=lf` governs checkout and commit, not
authoring. An editor configured to insert CRLF will still do so; git will normalise it on the way
in, which is the behaviour that was already intended and was simply never declared.

**It is not a CI change.** CI is green today and stays green. The whole defect is that the two
disagreed.

## Comments

### Opened 2026-08-21

Found while running the gates for the composed-capacity branch, which reported `biome check` red and
had to establish per file that its own work was clean — every file that branch wrote or rewrote
passes when normalised, verified one at a time, which is a check nobody should have to run by hand.

The 2026-08-20 handoff listed `biome clean` among the gates. That was not true of this checkout and
had probably not been true for some time; a gate that is always red stops being read, which is how
it went unnoticed.

`.scratch/composed-capacity/spec.md` decision D7 deliberately declined this scope as too large to
hide inside that spec. That was the right call for the branch and is the reason this is a ticket
rather than a line in someone else's commit.
