# 04: Bootstrap a crew workroot in one command

**What to build:** One command on a fresh machine produces a workroot the crew can be
pointed at: the sandbox account exists, the agent distribution is built and verified,
and the workroot contains the launcher and the Brief's request — and nothing else.

Today this is several steps with names belonging to a specific agent runtime. The
bootstrap becomes crew-agnostic and repeatable, because the crew's isolation story
depends on the workroot starting as *exactly* those two files: assembling it by hand is
precisely how that invariant quietly stops being true.

The script reports what it did and refuses rather than half-completing — a workroot that
is nearly right is worse than one that failed loudly, since the leak scan and the
initial-inventory assertion will only notice much later.

**Blocked by:** None (can start immediately)

**Note:** re-running produces the same work root contents, not the same launcher bytes — the C#
compiler does not emit a byte-reproducible executable, so `vox.exe` hashes differently each
build. The reported hash is what landed, which is what a bundle needs to record.

**Status:** done

- [x] One command produces a ready workroot from a clean checkout
- [x] The workroot contains exactly the launcher and the Brief's request when the script finishes
- [x] Distribution build and verification run as part of it, and a failure of either fails the bootstrap
- [x] Naming is crew-agnostic, with no agent runtime baked into it
- [x] Re-running it is safe and produces the same result
- [x] It refuses loudly rather than leaving a partial workroot behind
