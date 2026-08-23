# 01: Carry a crew runtime's model credential through the environment scrub

**What to build:** A crew process spawned by the proof harness can reach its model
provider, and the credentials probe that guards the boundary still tests something
that can fail.

Today the environment scrub deletes every credential-shaped variable except the two
agent-runtime prefixes it knows about, so a crew that reads its key from the
environment is spawned without one and cannot reach a model at all. The escape hatch
widens to cover the crew's runtime, and the reasoning goes in that file's existing
comment in its style — this widens a deliberate boundary and the next reader needs to
know why.

Separately, the credentials probe currently points at a file belonging to a different
agent runtime. Against a crew that holds its credential in the environment, that probe
cannot fail, and a probe that cannot fail is worse than no probe: it reports isolation
that was never tested. Re-point it at the crew's actual credential or retire it.

Production secrets are unaffected. The scrub must still remove them, and must still
remove any variable that merely aliases a production secret's value under an innocent
name.

**Blocked by:** None (can start immediately)

**Not verified here:** no crew driver exists yet (ticket 05), so the widened scrub is proved by
unit test rather than by a crew that actually started. The Codex proof path is unchanged: its
own store is still among the probed candidates.

**Status:** done

- [x] A crew runtime's model credential survives the scrub and is present in the spawned environment
- [x] Every production secret is still removed, including value-aliased duplicates under innocent names
- [x] The credentials probe targets a credential the crew actually holds, and a test proves it fails when that credential is reachable
- [x] The widened escape hatch carries a comment explaining what it admits and why, matching the surrounding style
- [x] Existing proof runs are unaffected
