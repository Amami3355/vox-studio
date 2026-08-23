# 02: Score isolation as not-evidenced when a driver brings no sandbox

**What to build:** A proof run whose agent driver supplies no sandbox evidence reports
its isolation assertions as **not evidenced**, rather than passing them from fallback
probes.

Today those assertions fall back to probe values measured against a restricted token —
what such a token *would* be denied — rather than what the agent process actually was.
A driver that supplies nothing therefore passes the entire isolation section while its
process may have read the repository at will. One field is worse still: the direct
network verdict is simply whatever the driver reports about itself.

Assertions gain a third outcome beside pass and fail, so a run can say "this was not
measured" in the evidence bundle and in the machine verdict. A verdict containing a
not-evidenced assertion is not a pass. The existing Codex proofs, which do supply
sandbox evidence, keep passing exactly as they do now.

This is what makes review decision 1 honest: the crew phase accepts that it cannot
evidence code-blindness, and the sheet says so instead of implying otherwise.

**Blocked by:** None (can start immediately)

**Not verified here:** "scored exactly as before" is established by construction and unit test
rather than by a paid Codex run, which spends quota. Bundles written before the third outcome
existed were re-verified against the new verifier and read identically.

**Status:** done

- [x] Assertions carry a third outcome for "not evidenced", distinct from pass and fail
- [x] A driver supplying no sandbox evidence produces not-evidenced isolation assertions, never passes
- [x] A self-reported network verdict with no sandbox behind it is not-evidenced
- [x] A machine verdict containing any not-evidenced assertion is not a pass
- [x] Runs that do supply sandbox evidence are scored exactly as before
- [x] The evidence bundle distinguishes the three outcomes
