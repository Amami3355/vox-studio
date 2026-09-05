# The cloud proof sheet

**Written 2026-09-05, before the Run, which is the only time it can be written honestly.**
Ticket 09's own criterion: *"The 'not evidenced' entries are written before the run, not after.
Deciding what the cloud cannot prove while looking at what it happened to produce is how a proof
sheet becomes a summary of the outcome."* Nothing below was authored with a result in front of it;
the one post-Run factual correction is labelled with its date rather than passed off as pre-Run
knowledge.

The local sheet's assertion ids are read out of `packages/production/src/proof/assertions.ts`
rather than transcribed from a previous sheet. Every one of them is dispositioned here:
**carried forward**, **replaced** per ticket 02's ADR, or **not evidenced** with a reason.

## The topology this sheet scores

Not the local one. The crew runs from a local checkout by the day-one cut and reads the Brief off
the operator's disk; the Run store, the render and the four production secrets are on the instance.
There is **no launcher in the path** — the crew speaks to ticket 06's host over a forwarded port,
holding a token, and that is the whole client side. Most of what the local sheet scores is a
property of a launcher running under a restricted OS principal, and that principal does not exist
here. Those entries are not failures. They are assertions about a mechanism that is absent.

## Stated spend, before the Run

The Brief is `walk-31`'s, which has been produced locally before, so the topology is the only
variable.

- **Narration: 1,289 characters across 12 segments**, measured from the known-good local
  `plan.json`. The cloud crew authors its own plan from the same Brief, so treat this as the
  estimate it is rather than a quoted total.
- **`production.maxNewTakes` is `1`.** That is a hard ceiling in the brief, not a guideline: the
  ledger cannot admit a second take, so a re-issue after a failure spends nothing.
- **Model `eleven_v3`, voice `JBFqnCBsd6RMkjVDRZzb`, seed 7.**
- **The ElevenLabs rate is deliberately not converted to a currency figure here.** No sanctioned
  source has delivered one and this project does not answer cost questions from training data.
  The characters are the measurement; the invoice is the authority.
- **Compute: one `e2-standard-2` in `europe-west1-c`, running for the length of the session.**
  Its rate is likewise unpriced here. Artifact Registry's rate remains unpriced and must not be
  invented.

## Not evidenced, and why

These are the entries that matter, because they are the ones a sheet written after the fact
quietly drops.

| Assertion | Why the cloud cannot evidence it |
|---|---|
| `isolation.initial-two-files` | The work root is bootstrapped on the instance's volume, not handed to a launcher as two files. The shape being asserted is not the shape being run. |
| `isolation.work-root-readwrite` | Scores a restricted OS principal's access to its own work root. No such principal exists in this topology. |
| `isolation.repository-denied` | Same principal. There is no repository on the instance to be denied. |
| `isolation.service-denied` | Scores an absent named pipe. The cloud transport is a loopback socket reached through a tunnel, and ticket 02's ADR replaces this assertion rather than carrying it. |
| `isolation.credentials-denied` | Scores a launcher principal that cannot read the four production secrets off disk. Replaced below by the crew-identity check, which is the cloud's version of the same question and is **not** the same assertion. |
| `isolation.credentials-environment-denied` | As above, for the environment rather than the disk. |
| `isolation.write-containment` | Containment was a filesystem ACL property of the launcher's principal. On the instance the container is the boundary and the uid is root — see below. |
| `leaks.agent-readable-files` | The agent-readable-file scan is a local harness walk over a principal's reachable set. Nothing on the instance corresponds to it. |
| `agent.unscripted-generalist`, `evidence.agent-transcript`, `agent-transcript.jsonl` | Properties of the proof harness's own agent, which is not what drives this Run. The crew is. |
| `probe.invalid-grant-failed`, `probe.status-read-only`, `probe.zero-budget-paused`, `probe.main-run-preserved` | Launcher probes. No launcher. |
| `network.agent-direct-denied` | Asserts the *agent* reaches no network. The crew is local and has ordinary network access by the day-one cut; asserting this would be asserting something false. |
| the fourteen still-hash fixtures | A Windows-versus-Linux divergence measured by ticket 11 and owned by ticket 13. It is not settled and this Run does not settle it. A still-hash comparison here would be scoring an open question as a failure. |

**One property is recorded as a stated fact rather than as a pass:** the container runs as
**uid 0 (root)**, inherited from the image rather than chosen. It was an open question until the
2026-09-05 deploy answered it. It is not a defect this sheet is entitled to score either way, and
it belongs in ticket 12.

## Replaced, per ticket 02's ADR

The isolation question does not disappear; it changes mechanism. Five checks stand in for the
launcher-principal family, and **three of them must be run from inside the tunnel**, because from
outside nothing connects at all and all three pass vacuously — ticket 09's own rule turned on
itself.

| Cloud assertion | Where it runs |
|---|---|
| Unauthenticated request refused | inside the tunnel, through the forwarded port |
| Request with a bad body MAC refused | inside the tunnel |
| Replayed request refused | inside the tunnel |
| The VM has no external address, the service binds loopback and IAP admits only SSH from outside | outside, as a provisioning fact. **Corrected 2026-09-05:** the inherited `default-allow-internal` rule admits internal TCP, so the firewall alone is not the service-port boundary |
| The crew identity cannot read a production secret | outside, against Secret Manager |

The last two are **provisioning properties, not things the service earned**, and are recorded as
such. Under a tunnel "no public ingress" is true by construction, which makes it cheap to assert
and weak as evidence of anything the service does.

## Carried forward unchanged

These score the Run itself and are topology-independent. They are expected to hold, and a failure
in any of them is a finding about the deployment rather than about the sheet:

`run.receipt-chain`, `run.attestations`, `run.artifact-hashes`, `run.bindings-fresh`,
`run.rendered`, `record.one-take-used`, `record.same-take`, `record.verified-reuse`,
`take.verified`, `take.fold-current`, `compile.green`, `compile.zero-errors`,
`media.h264-video`, `media.aac-audio`, `media.take-duration`, `media.preview-duration`,
`media.take-audio-non-silent`, `media.preview-audio-non-silent`, `process.exit-contract`,
`process.stdout-envelopes`, `process.stderr-contract`, `limits.*`, `preflight.*`,
`network.record-only`, `network.one-provider-dispatch`, `recording.input-bound`.

**`network.record-only` gains a second reading in the cloud** and keeps both: the denying adapter
at `service-host.ts:59` still refuses everything the service attempts, and separately the egress
allowlist now names two hosts — the synthesizer's, and `fonts.gstatic.com`, the latter because the
user settled the font question that way on 2026-09-02. Font traffic runs *below* the adapter, so
for that traffic the egress rule is no longer a redundant confirmation of the adapter. That is a
weakening, it was decided deliberately, and it is written here rather than inherited silently.

## What this sheet is not

It is not the local sheet re-run against a new machine. The local harness stays local and remains
the authority for the local topology; porting it is explicitly out of ticket 09's scope. A cloud
deployment that shipped without this file would not have lost an audit artifact — it would have
**silently inherited the local one, which scores mechanisms that are not present.**
