# ADR-0018 — The isolation guarantee outlives the named pipe

**Status:** accepted · 2026-09-02
**Supersedes in part:** ADR-0007, its transport clause only
**Scope:** what ADR-0007's code-blindness guarantee is, once stated independently of the named
pipe that delivered it; what answers each question the pipe used to answer when the service runs
in a container on a remote VM; and which recorded isolation evidence stops being meaningful there.
It chooses no authentication mechanism — that is ticket 06 — provisions nothing, and changes no
command, envelope, schema or test. The local topology is untouched and its evidence continues to
stand for it.

## Context

ADR-0007 contains one sentence that forbids the cloud phase outright:

> A native, thin `vox` launcher communicates with it through authenticated OS-local IPC,
> **never TCP or HTTP**.

That clause is load-bearing rather than stylistic. Three of the isolation properties the proof
sheet scores are consequences of it: the pipe ACL answers *who may connect*, the restricted
Windows principal answers *what the caller may read*, and the absence of a socket answers *who may
reach the service at all*. A remote deployment has no pipe, no Windows principal, and a service
reachable by whatever the network permits. Deleting the sentence would delete all three answers
and leave nothing in their place.

**Editing the clause in place was the tempting move and is the wrong one.** The sentence is a
consequence of the threat model, not an axiom of it. The paragraphs around it — what the service
alone owns, what the agent receives, what `record` alone may do — are true in both topologies. An
edit that changed one clause would leave a reader unable to tell which of the isolation *evidence*
still applies, which is the question a reader of ADR-0007 actually arrives with. So ADR-0007 keeps
its body and gains a superseded-in-part note, and this ADR states the replacement.

One thing this ADR must do that its ticket did not originally anticipate: **say plainly that a
`render` reaches the network.** Ticket 11 built the deployment image and measured it. That is not a
new behaviour and not a regression — it has always been true, locally and silently — but the cloud
is the first place it becomes a written property of a deployment, because the egress rule has to
name a host for renders to work at all. An ADR that restated ADR-0007's network wording unchanged
would be describing a system that does not exist.

## Decision

### 1. The guarantee, stated without reference to a transport

ADR-0007's isolation guarantee is three properties, and none of them mentions a socket:

- **The agent cannot read production's implementation.** Not its source, its runtimes, its
  dependencies, its internal commentary, its repository paths or its private temporary files.
- **The agent cannot reach production's credentials.** The four production secrets are held by
  the service process and by nothing the agent can read — `service-host.ts:28-35` is where they
  enter, and they enter nowhere else.
- **The agent cannot issue a command production did not publish.** The public surface is the
  contract categories, and a request outside them is refused rather than interpreted.

**A future topology is judged against these three sentences, not against a pipe.** That is the
whole purpose of writing them down separately: ADR-0007 stated the guarantee and its mechanism in
one breath, and the mechanism is the half that does not travel.

### 2. What answers *who may reach the service at all*, and *who may connect*

**No public ingress, and no listening socket the network can reach.** The service binds its
container's port on a VM whose firewall admits nothing from outside; the only route in is an SSH
tunnel gated by a key the operator holds. The tunnel answers *who may reach the service at all*
where the absence of a socket used to. The SSH key answers *who may connect* where the pipe ACL
used to.

**The per-request HMAC survives unchanged, and it answers a third question.** It authenticates the
request *body*, not the channel, and the Run ledger's integrity story in ADR-0008 already rests on
it. Channel authentication and body authentication are two answers to two different questions; the
local topology has both, and the cheap mistake available here is to let one strong channel answer
stand in for both. It does not, and this ADR forbids treating it as if it did.

**This is deliberately not a platform identity check.** The spec's decision 4 was written against
a serverless runtime and answers this question with "the platform accepts only requests bearing an
authorised service identity". The topology chosen on 2026-09-02 is a Compute Engine VM behind a
tunnel, which has no such layer in front of the container. The property is the same and the
mechanism is not, and anything still citing platform identity for this phase is stale.

### 3. The bearer capability is not new, and decision 8 did not break

`VOX_IPC_TOKEN` already authorises a caller today. `proof/codex-agent.ts:415` scrubs the agent's
environment of everything on production's side of the boundary and then re-applies that one token
by name, as **the launcher capability**. It authorises *calling* the service and reveals none of
the four production secrets. It moves to the second transport unchanged.

This is stated because a reader who assumes the crew *gains* a secret at the transport change will
conclude decision 8 was broken to make the cloud phase possible. It was not, and the code is the
evidence.

### 4. What replaces the restricted OS account

**The container is the isolation unit, and it is a stronger separation than the local topology
achieves.** Locally the crew and the service share a disk and the boundary across it is an ACL.
Remotely the agent has no filesystem in common with the service at all — a different machine, not
a different principal on the same one. This is claimed as an improvement rather than apologised
for as a substitute.

What is *lost* is the measurement, not the property. See decision 6.

### 5. A `render` reaches the network, and the two locks are not the same lock

`packages/video/src/design/fonts.ts` loads four faces through `@remotion/google-fonts`, which
fetches `woff2` files from `fonts.gstatic.com` **inside the headless browser** — below
`service-host.ts:59`, where the denying network adapter cannot see them. Ticket 11 measured this
directly: with the network removed, the render fails outright and names the four loads.

The deployment therefore has **two locks on outbound traffic, of unequal strength, and they must
not be described as one property**:

- **The adapter is the strong lock and it is unchanged.** `network: { request: async () =>
  reject('NETWORK_POLICY_DENIED') }` refuses every outbound request the service itself makes
  outside `record`. It is enforced in code, it is total, and nothing in this ADR weakens it.
- **The egress allowlist is the weak lock, and weaker still than this ADR first claimed.**
  *Corrected 2026-09-02, the same day, while ticket 03's wizard was being written.* The original
  wording said the rule "names two hosts". **A VPC firewall rule cannot name a host.**
  `gcloud compute firewall-rules create` takes `--destination-ranges`, which is CIDR, and both the
  synthesizer and the font host sit behind CDNs with wide, shifting address ranges. Restricting
  egress by hostname needs Secure Web Proxy or FQDN objects in Cloud NGFW — real products, real
  cost, and the wrong thing to adopt under this deadline.

  So for this phase the two-host list is **documented intent, not an enforced control**, and the
  adapter is the only egress lock the deployment actually enforces. That is a smaller claim than
  the one this ADR was accepted with, and it is written here rather than discovered by ticket 09
  trying to evidence it. What remains true and worth keeping: the list is the record of which
  outbound destinations this system is *supposed* to have, and a destination appearing in a
  traffic log that is not on it is a finding.

**So ADR-0007's `record`-only wording is narrowed here rather than repeated.** The honest property
is: *the service reaches nothing outside `record`, and the render's browser reaches one named font
host and nothing else.* Self-hosting the faces in the image would have collapsed the two locks
back into one; it was recommended and the user chose the allowlist on 2026-09-02, with the
weakening recorded here rather than discovered later.

`fonts.gstatic.com` is the only font host **observed** — ticket 11's four failures were all
`gstatic`, and the font CSS ships in the bundle so `fonts.googleapis.com` was never reached. It is
not the only host possible. A face that later resolves elsewhere fails the same way and is found
by the same negative control.

### 6. Which recorded evidence stops meaning anything

The proof harness already has the right vocabulary for this. `ProofOutcome` is `pass | fail |
not-evidenced`, and `not-evidenced` exists precisely because isolation assertions once passed by
falling back to what a restricted token *would* have been denied. **A cloud run reports the
following as `not-evidenced`. It does not report them as passes.**

- **`isolation.service-denied`.** The probe reads the service's install path from inside the
  agent's sandbox and expects refusal. In the cloud that path is not on the machine, so the probe
  would be measuring absence rather than denial. The harness already guards this shape —
  `codex-agent.ts` `access()`es every probe target before probing, because a probe pointed at a
  file that is not there reports "denied" for the wrong reason. What the cloud offers instead is
  decision 4's structural argument, which is stronger but is **not the same measurement**, and the
  sheet says so in those words rather than scoring an argument as an observation.
- **`network.record-only`, in its current wording.** It is computed from events the harness
  observes *at the injected adapter* — `harness.ts` counts `provider-dispatch` and
  `unauthorized-network` events raised by the adapter it supplied. It therefore cannot see the
  headless browser's font fetch and never could. The assertion is sound about what it measures and
  its **name overclaims**; the sheet renames or re-scopes it to the adapter, and decision 5's
  second lock gets its own evidence rather than borrowing this one's.
- **The pipe-path assertions.** `ipc/host.ts` rejects any path that is not
  `\\.\pipe\<name>`, and `service-host.ts` asserts the same shape on the public path. Both are
  correct and both remain the local transport's evidence. Neither is evidence about a deployment
  that has no pipe, and a cloud sheet that reports them is reporting on a different system.

**Unaffected, and continuing to apply to both topologies:** the distribution leak scan, every
`contracts.*` assertion, `isolation.credentials-denied` and
`isolation.credentials-environment-denied` — which get *stronger* remotely, since the secrets are
not on the operator's machine at all — and `isolation.initial-two-files`,
`isolation.work-root-readwrite` and `isolation.write-containment`, which measure the work root and
are unchanged because the crew stays local.

### 7. No local HTTP listener is authorised by this ADR

ADR-0015 decision 3 rejected one and the cloud spec declines to reopen it. This ADR permits an
authenticated network transport **for the remote topology only**, in those words, so that a later
session cannot cite it to add a convenience listener on a developer's laptop. The named pipe
remains the local transport permanently; the two are siblings, not stages.

### 8. The evidence a cloud deployment must produce

Stated here so that the cloud proof sheet can be written from this ADR rather than invented
alongside it. A deployment claiming this guarantee produces:

- The leak scan, run over the **image's readable layers**. An image layer is a readable file set
  and the threat model does not care that it arrives as a tarball.
- A refusal of a request that is not on the public surface, made over the network transport,
  sanitised on the way out.
- Proof the service refuses to start without its persistent volume — the failure it prevents is
  silent, which is why it is asserted rather than assumed.
- A render completing with outbound traffic observed and compared against the two intended
  destinations. **`--network none` is no longer the control**, because decision 5 makes it fail by
  design. *Corrected 2026-09-02: this previously said "with every host outside the two named ones
  refused", which assumed an enforcement the firewall cannot perform. What the deployment can
  produce is an observation, not a refusal, and the sheet must not score an observation as one.*
- A non-`record` command attempting egress and being refused **by the adapter**, demonstrated
  independently of the egress rule. A test that passes only because the network was unavailable
  has not tested the adapter — which is the generalisation ticket 11 earned, and it is recorded
  here because it is the discipline that found both defects in the image.
- The `not-evidenced` verdicts of decision 6, named as such, with the substitute argument stated
  and not scored.
- **A statement of how many instances are running, because the replay cache is one of them.**
  *Added 2026-09-02 by ticket 06, which built the second transport.* The per-request HMAC this
  ADR preserves is paired with a replay cache, and that cache is an in-process `Map` — one
  container is one cache. A request captured inside the skew window and replayed against a
  *second* instance is accepted, because that instance has never seen the id. **This is a real
  weakening relative to the local topology, where one machine ran one host, and it is recorded
  here rather than left to be discovered.** It is mitigated for this phase by running exactly one
  instance and by a short skew window; a shared cache is a later ticket. A deployment that scales
  past one instance has changed a property of this ADR and owes its own decision, so the evidence
  a deployment produces has to say which case it is in. See
  `packages/production/src/ipc/boundary.ts`, where the same limit is written at the seam that
  carries it.

## Considered and rejected

**Amend ADR-0007's sentence and leave the rest standing.** Rejected in the Context above: it is
cheap, and it destroys a reader's ability to tell which isolation evidence survives. The clause is
downstream of the threat model and the threat model has not changed.

**Keep OS-local IPC and tunnel the pipe.** Rejected because it buys the wording rather than the
property. A pipe forwarded over a tunnel is a network transport with a pipe-shaped API in front of
it; the ACL it appears to preserve is enforced on the wrong machine, and the design would owe
exactly the same replacement answers this ADR gives while pretending it did not.

**Restate `record`-only egress unchanged and treat the font fetch as an implementation detail.**
Rejected as the most dangerous of the options, because it is the one that reads best. The
deployment's egress rule names a host that the ADR's wording forbids; ticket 09's sheet would then
score a property the system does not have, and the discrepancy would surface as an audit finding
rather than a decision.

**Self-host the four faces and keep one lock.** Not rejected on the merits — it was the
recommendation. The user chose the allowlist on 2026-09-02 with the trade-off stated. It remains
the repair if the weaker claim later proves unaffordable, and it costs roughly an hour plus a
re-baselining of the accepted still hashes.

## Consequences

- **The cloud proof sheet is smaller than the local one, and says so.** Two assertions become
  `not-evidenced` and the pipe assertions do not appear. A sheet that scored the same count would
  be the vacuous pass `not-evidenced` was introduced to prevent.
- **`network.record-only` needs renaming or re-scoping**, which is ticket 12's work. The
  assertion is not wrong; its name asserts more than the measurement supports, and that gap
  existed before this ADR and was invisible while nothing depended on it.
- **The egress allowlist is a governed list, not a configuration detail.** Two entries, each with
  its recorded cause. An entry added without one is a defect against this ADR even if the
  deployment works. It is enforced by nothing at the network layer in this phase — see decision 5
  — so it governs review rather than traffic, and anyone citing it should say which.
- **The VM reaches the internet through Cloud NAT, and that is not optional.** An instance with no
  external address cannot reach a non-Google host at all; Private Google Access covers Artifact
  Registry and Secret Manager but not the synthesizer and not the font host. Closed ingress and a
  working `record` are therefore both properties of the network design rather than of one setting,
  and the gateway is a standing cost this phase's envelope now carries.
- **ADR-0015 decision 3's sentence "ADR-0007 stands unamended" is now historical.** Its substance
  — no local HTTP listener — is reaffirmed by decision 7 here and is unchanged.
- **Nothing in `packages/production` changes because of this ADR.** The service, the launcher, the
  IPC host, the envelope and the proof harness are untouched. Tickets 06, 07, 09 and 12 are where
  the consequences are built.

## References

- ADR-0007 — Isolate agent production behind a trusted service (superseded in part, transport
  clause only)
- ADR-0008 — Authenticate agent-writable Runs with a private monotonic ledger (the HMAC this ADR
  preserves)
- ADR-0015 — The deployment seam is the crew's client, not the transport (decision 3 reaffirmed,
  decision 4's POSIX volume unchanged)
- `.scratch/cloud-phase/map.md` — the decision layer for this phase
- `.scratch/cloud-phase/spike-11/FINDINGS.md` — the measurement decision 5 rests on
