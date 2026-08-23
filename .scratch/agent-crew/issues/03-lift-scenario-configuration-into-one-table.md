# 03: Lift proof scenario configuration into one table

**What to build:** A proof scenario is one record in one place — its Brief, its proof
id and slug, its non-claims, its duration bounds and target, and any scenario-specific
gate — instead of a branch repeated across every site that needs one of those values.

Adding the showcase scenario spread the same conditional across roughly six sites.
Adding a third scenario would put a fourth branch in each, and a scenario whose values
are assembled from six independent conditionals is one edit away from being subtly
wrong in a way no test names.

Pure prefactor: both existing scenarios keep their current values exactly, and every
existing proof run produces the same result it does today. The point is that the next
scenario is a row rather than six edits.

**Blocked by:** None (can start immediately)

**Not verified here:** the fixture proof harness test cannot run on this machine — `ffprobe` and
`ffmpeg` are not installed, so the fixture synthesiser fails before a Take exists. It failed the
same way, with the same three tests and the same error, before this change.

**Status:** done

- [x] Scenario configuration lives in one place, keyed by scenario
- [x] Selecting a scenario reads that record rather than re-deriving values from conditionals
- [x] Both existing scenarios keep identical values and identical run results
- [x] Adding a scenario requires adding a row, not editing existing branches
- [ ] The existing proof suite passes unchanged — see the note above
