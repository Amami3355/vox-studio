# 16: A stale fixture fails the build

**What to build:** Re-recording the crew's contract fixtures is something a contract change
forces rather than something a README asks for. The recorded projections are compared
against what the handlers emit now, and a fixture recorded from an older catalog fails with
a message naming the command that refreshes it.

The guard that exists today parses every recorded envelope against the current schemas, so a
malformed fixture or one carrying a report shape the service would never publish fails. A
fixture recorded from last month's catalog parses perfectly. Nothing detects it. The
fixtures' README says to re-record when the contracts are rebuilt, and prose is not a check.

That gap was cheap while the fixtures were a convenience for the client and expensive the
moment the planner landed. The crew's instructions are assembled from these bodies, and the
leak scan over that text and the capability, action and anchor names an authored plan is
read back against are all assertions about what the build publishes. A stale fixture means
the crew's suite is green against a catalog that no longer exists: a capability added today
is one the planner's tests still say cannot be named, and the failure surfaces as a puzzling
red in a Python suite far from the change that caused it, or as a live run that plans for
capabilities the compiler has dropped.

The check can be exact rather than approximate, and it should be. The contract commands take
no run identity and no clock, so their stdout is a pure function of the generated contracts
— the recorded bytes and the bytes the handler emits now are comparable directly. No digest
sidecar and no second source of truth: the handler is the authority, as it already is for
the recorder.

Two things should fail, not one. A recorded projection whose bytes have moved, and a
category the contract index publishes that has no recorded fixture at all — the second is
how a new category arrives, and the crew assembles its instructions from every category the
index names.

The authored `run-*.stdout` envelopes are out of scope. Nothing can regenerate them, which
is why they were authored; they stay under the schema guard that already covers them.

The recorder's own header explains that only the smallest projection is recorded and why the
others are not, which stopped being true when the planner made all five load-bearing. It
should say what is true now.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A recorded contract fixture that no longer matches what its handler emits fails the build
- [x] The failure names the exact command that re-records it
- [x] A category the contract index publishes with no recorded fixture fails the build
- [x] The authored run envelopes are unaffected and stay under the schema guard they have
- [x] Rebuilding the contracts and re-recording turns the build green again with no other edit
- [x] Removing the check or staling a fixture by hand is demonstrated to turn it red
- [x] The recorder and the fixtures README describe the recording policy that is actually in force
