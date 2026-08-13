# ADR-0008 — Authenticate agent-writable Runs with a private monotonic ledger

**Status:** accepted · 2026-08-13

A Run must remain readable and useful outside Git while its directory is writable by the
agent. Hashes can bind files to one another, and attestations can prove who issued a checkpoint,
but neither can stop the agent from rewriting all unhashed state or rolling the directory back
to an earlier valid revision to recover quota or replay a replacement grant.

The public Run is therefore an inspectable, content-addressed artifact carrier with an
attested `run.json` checkpoint and chained receipts. The Production service keeps a private
monotonic ledger that is authoritative for each Run's highest revision, receipt head,
quota-bearing recording dispatches and consumed replacement grants. All consumers reverify
the public artifact bytes and authenticated bindings; the private ledger stores no hidden copy
of Take media. Reopening or mutating a Run requires the service authority that issued its
attestations, while its verified media and reports remain readable and load-bearing without a
Git commit.

## Considered options

**Hashes or signed files in the Run alone** were rejected because a complete earlier signed
state can be replayed and deletion of later revisions cannot be detected from inside the
directory. **Git commits** were rejected as the definition of integrity because an isolated
Run Take is load-bearing before and without repository publication. **Keeping every artifact
private** was rejected because it would make the public Run a receipt stub rather than the
inspectable handoff the Agent production interface promises.

## Consequences

State-changing commands require a private per-Run lease, revision compare-and-swap and durable
commit order. Public immutable artifacts and receipts are published before the private head;
`run.json` follows it, making any crash recoverable without repeating production work. A voice
dispatch is recorded and charged before outbound I/O, and an uncertain response is never
retried automatically. This deliberately trades standalone writable portability for quota and
authorisation integrity.
