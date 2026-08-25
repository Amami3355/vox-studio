# 10: Every crew run leaves an evidence bundle

**What to build:** Any crew run can be audited afterwards exactly like a proof evidence
bundle. Each run persists its transcripts, every command envelope in the order it was
issued, the Run's artifacts, and an assertion evaluation against its scenario's sheet.

The bundle's shape follows the proof bundles rather than inventing a second vocabulary
for the same thing, so a crew run and a scripted proof run can be read side by side and
compared.

Evidence is written inside the workroot and nowhere else — the crew never writes outside
it, and a bundle that escaped would be the first breach of that rule.

The Run's artifacts are captured by fetching them, never by scanning for them. Those are
the same thing today and stop being the same thing later: the local client puts each Run
directory inside the crew's own workroot, so a workroot inventory sweeps up the Run's files
for free — and under the other implementation ADR-0015 exists to allow, the Run's disk is
not the crew's disk and the same sweep finds nothing. A bundle assembled from the
descriptors the envelopes published is complete under both, and the difference between the
two implementations is invisible until the day it is expensive.

The workroot scans the proof bundles carry are a separate thing and stay as they are. The
inventories, the hash index and the leak scan are assertions about the crew's own directory
— what it held before, what it holds now, and that nothing in it leaked — which is exactly
what they should go on reading.

**Blocked by:** 09 (The producer records, compiles and renders under the quota rules)

**Note:** the bundle evaluates the assertions the crew observed and no others. The
scenario families are the harness's — a scenario is chosen there and the crew holds only a
Brief — and the media and isolation families are measured by instruments the crew does not
hold. What it cannot measure it reports as `not-evidenced` rather than answering from a
fallback. Ticket 12 scores the same Run against the whole sheet, which is the only place the
two restatements can be held to each other.

`assemble` and `write_bundle` are separate for ADR-0015's sake, and ticket 12's driver is the
first caller that writes one: nothing in the crew converges yet, because converging needs a
model credential the CLI is not given.

**Said plainly, because the tick above does not say it:** no crew run persists a bundle today.
`converge` is called only from tests and `cli.py` reads the teaching surface and stops, so there
is no run in existence for "each run persists" to be true or false of. What this ticket built is
the bundle and the two functions that write and read it, proved end to end — assemble, write,
read back, verify — and what it did not build is a caller. **The first criterion is therefore
carried by ticket 12**, where the crew driver is the first thing that both produces a Run and
has somewhere to put it, and it is written into 12's own list rather than left implied here.

**Status:** done

- [x] Each run persists its transcript and every command envelope in issue order
- [x] Run artifacts are captured by descriptor through artifact retrieval, never by scanning the workroot
- [x] The workroot inventories, hash index and leak scan still read the crew's own directory
- [x] The bundle carries an assertion evaluation against the scenario's sheet
- [x] The bundle's shape matches the existing proof bundles
- [x] Nothing is written outside the workroot
- [x] A completed bundle can be verified after the fact without the crew present
