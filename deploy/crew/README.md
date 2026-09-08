# Hosted crew connectivity

Milestone 2 now has a separate [live operator runbook](milestone-2/README.md). Render with
`--live` to install its bounded policy, Google Cloud model/image configuration and explicit
Parallel secret fetch. The default configuration below remains the zero-provider connectivity
path. Current deployment and remaining proof are recorded in
[session 12 evidence](../../.scratch/hackathon-launch/proofs/milestone-2-progress-2026-09-07.md).

The first launch milestone uses the existing signed `HttpProductionClient` from a separate
crew VM. Production remains on loopback on `vox-service`. The crew image contains only the
Python crew and its dependencies. It has no Production source, disk or private signing keys.

`render.py` renders two digest-pinned COS cloud-init documents. Its inputs contain public SSH
keys and immutable image references only. The Production document extends the existing
`deploy/cloud-init.yaml`; the crew document installs a persistent ext4 disk, boot-time caller
capability fetch, a supervised SSH connection, and explicit probe/attempt systemd units.

The operator obtains Production's ed25519 host public key over existing IAP SSH. The crew
pins it with `StrictHostKeyChecking=yes`. The crew host generates its own persistent SSH key;
only its public half returns to the operator for the Production configuration. The private
half is root-only on the crew host and is not mounted into the crew container.

The Production `voxbridge` account can forward only to `127.0.0.1:8080`. `MaxSessions 0`
refuses shell and SFTP channels. Unix-socket, agent and remote forwarding are disabled.
Its authorized key is outside metadata-managed user keys. The VPC must allow only TCP 22
from the crew service account to the Production service account, ahead of the existing
deny rule. The operator IAP rule separately admits TCP 22 to the crew VM.
These controls follow the [OpenSSH server documentation](https://man.openbsd.org/sshd_config).

The crew service account needs Artifact Registry reader access on a separate `vox-crew` repository and
Secret Manager accessor on **only** `VOX_NETWORK_TOKEN` for this milestone. This is the caller
capability, not `VOX_RUN_HMAC_KEY`, `VOX_GRANT_KEY` or the narrator credential. Google Cloud
inference configuration is explicit in the runtime; live model/provider access is verified
by the next milestone, not by the zero-spend connectivity probe. Do not grant the crew reader
on `vox`: that repository holds Production images and would expose its implementation through
the registry even though it has no shared disk. Check denial against that repository too.

Build Production from the repository root, and the crew from `services/agents`. Scan the
Production image with `deploy/image-leak-scan.mjs` before promotion. Read both pushed image
digests back from Artifact Registry before rendering metadata. Do not deploy a moving tag.

The crew VM is intended as `vox-crew-worker`, COS, `e2-small`, no external address, in
`studio-prod-7f3a/europe-west1-c`, with the existing `vox-crew` service account. Attach a new
10 GB persistent disk named/device-named `vox-crew-state` with auto-delete disabled. Boot
initializes only that named disk, and refuses any existing non-ext4 signature. Private
Google Access and the existing NAT supply registry/Secret Manager access.

After installing both rendered configurations and their narrow firewall/IAM bindings:

1. Verify Production's deployed digest, listening socket, and mounted Run disk.
2. Verify the crew setup and bridge units, state disk, and root-only private SSH key.
3. Start `vox-crew-probe.service` on the crew VM. It reads all real contracts, checks the
   published VideoPlan schemas and fetches an existing Run status through the signed client.
   Render with an explicit `--run-id` from a public Run result: the `run-...` disk directory
   name is not that identifier. Wait for Production's loopback listener before probing;
   an active SSH bridge alone does not establish application readiness. If an old Run returns
   an integrity refusal, preserve it and investigate separately; a fresh connectivity-only
   Run with `maxNewTakes: 0` can establish the current round trip without paid work.
4. Restart the crew VM, rerun the probe and compare its persistence marker. Record both
   observations and the deployed image references in the milestone evidence.
5. From the crew host, verify SSH command execution and forwarding to another port fail.
   `check-ssh-boundary.sh` checks specific refusal reasons after a successful signed probe.
   Run `check-identity.py` in the crew container to verify access to the caller capability and
   crew registry, and HTTP 403 for Production's private secrets and registry. It prints only
   resource names and status codes, never response bodies or credentials.

The probe never invokes a model, image generation, narration or rendering. It writes
`connectivity.json` on the mounted crew state volume. `signedResponsesVerified` means the
existing client verified MACs before returning; malformed signatures raise instead.

`vox-crew-attempt.service` is the installed operator entry point for the next milestone.
It reads `/var/lib/vox-crew/request.json`, builds the existing crew with a read-only
`operator-policy.json` from `/etc/vox-crew`, and writes public events and checkpoints to the
state disk. The checked-in policy authorizes no live phase. Recorded phases also require
operator-installed `recordings.json`. Image decisions pause for review. A Linux file lock
permits one attempt at a time, and systemd does not automatically retry interrupted paid
work. A leftover `running` attempt is uncertain and needs reconciliation with Production.
This is not yet browser admission, automatic recovery or the Studio API.

Deployment evidence and remaining work belong to
[the launch route](../../.scratch/hackathon-launch/route.md).
