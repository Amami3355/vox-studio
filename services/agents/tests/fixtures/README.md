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
  with `resultEnvelopeSchema` and then parses each one's `data` with the schema for its command:
  an envelope the service could not emit, or a report shape it would never publish, fails that
  test. Authoring one by hand and running that test is the whole workflow.

## The bodies under `artifacts/`

`fetch_artifact` checks an artifact's bytes against the digest its descriptor published, so an
envelope naming an artifact nothing can produce leaves the read-back direction of the client
untestable. The three artifacts a finished Run is read back for — the Preflight report, the
compile report and the preview — therefore have a body here, and the `sha256` in the envelope
that publishes them is the digest of these exact bytes. The reports are canonical JSON (RFC
8785), which is what the service's `reportBytes` emits; the preview is a stand-in for an MP4,
because the render adapter is stubbed everywhere the crew is tested.

Every other descriptor in these envelopes carries a well-formed placeholder digest, because
nothing opens those artifacts. If a later ticket reads one back, give it a body here and put
its real digest in the envelope.

These files are deliberately not `.stdout`: they are artifact bodies, not recorded stdout, and
the contract test parses only the latter. Their bytes are the fixture in the same way the
envelopes' are, so `biome.json` ignores this directory — reformatting a report here would
change its digest and break the envelope that publishes it.

Only `checks` is recorded among the five projections. The five total ~220 KB and duplicate
generated contract data that drifts the moment the catalog is rebuilt; the client under test
is indifferent to which projection it is carrying, and the crew's discovery test covers all
five through the stub launcher.
