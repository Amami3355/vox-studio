# Recorded envelopes

What the production command surface writes to stdout: one JSON line and the newline that ends
it. The crew's tool tests replay these instead of running a service, so a Python test needs no
key, no quota, no ElevenLabs credit and no network.

Their bytes are the recording. Nothing here should be reformatted — verbatim pass-through is a
byte property, and prettifying these files would delete the thing they exist to prove. That is
why they carry a `.stdout` extension and sit outside `biome check`'s reach.

- `contract-index.stdout`, `contract-show-checks.stdout` are **recorded**: written by
  `pnpm --filter @vox/production record:crew-fixtures`, straight from the handlers the
  dispatcher calls. Re-record them when the contracts are rebuilt.
- The `run-*.stdout` envelopes are **authored**, because producing them for real needs a Run,
  a ledger and a signing key. They are held to the contract by
  `packages/production/tests/crew-fixtures.test.ts`, which parses every file in this directory
  with `resultEnvelopeSchema`: an envelope the service could not emit fails that test.

Only `checks` is recorded among the five projections. The five total ~220 KB and duplicate
generated contract data that drifts the moment the catalog is rebuilt; the client under test
is indifferent to which projection it is carrying, and the crew's discovery test covers all
five through the stub launcher.
