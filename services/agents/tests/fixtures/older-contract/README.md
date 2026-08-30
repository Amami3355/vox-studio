# The contract as it stood before the audience field

**Frozen. Never re-record these.** `pnpm --filter @vox/production record:crew-fixtures` writes the
directory above this one and does not touch this directory, which is the whole point of it being
a directory.

These six files are `services/agents/tests/fixtures/*.stdout` as they stood at `2224069`, the
commit before crew ticket 25 gave the contract index an `audience` per category and split
`protocol` into the command surface and the `operating` rules. The index here publishes five
categories and no audience field at all.

They exist because one of ticket 25's acceptance criteria is a byte-for-byte claim about
history — *"a contract publishing no audience field yields today's prefix byte for byte"* — and
history is the one thing a live fixture cannot be. A test that built an audience-less surface out
of the *current* fixtures and compared it against the current assembly is a test that cannot fail:
both halves move together, and both move again the next time the catalog is rebuilt. Comparing
against a frozen copy is what makes the assertion an assertion.

So the character count in `test_planner.py` is pinned against these bytes and only these bytes.
That pin is not the kind ticket 23 refused — it does not go red when another team rebuilds their
catalog, because nothing here is rebuilt. It goes red only if the crew changes what it does with a
contract it has already seen, which is exactly the flag day the criterion is about.

The catalog, checks, language and plan projections in here are byte-identical to the live ones at
the time of freezing; they are copied rather than referenced so that this set stays a single
coherent contract when the live ones move on.
