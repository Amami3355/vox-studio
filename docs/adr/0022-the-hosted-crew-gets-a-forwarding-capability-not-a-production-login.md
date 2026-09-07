# The hosted crew gets forwarding, not a Production login

**Status:** accepted · 2026-09-07; approved separate VM and 10 GB state disk deployed, signed
round trip and persistence/SSH/IAM controls exercised in launch ticket 03.
**Amends:** ADR-0018 decisions 2 and 4 for the hosted crew only.

The first hackathon milestone must reach Production from a hosted crew without a developer
laptop tunnel. The deployed topology keeps the crew on a separate Compute Engine VM with
its own persistent ext4 state disk. Cloud Run remains the proposed Studio application host;
the browser API, access decision and authorized media route are subsequent milestone work.
The existing Python/file seams make this smaller than adapting the worker to ephemeral storage
and a managed runtime at the same time as establishing connectivity.

The crew host supervises SSH to Production's private address. Production still binds only
`127.0.0.1:8080`. A dedicated `voxbridge` account and root-owned authorized key permit only
local forwarding to that address/port, with zero session channels, no shell/SFTP, no agent
forwarding and no Unix-socket forwarding. The crew host pins Production's host key obtained
through the operator's existing authenticated access. Its own private key stays root-only on
the crew host, outside the crew container's mounts. The firewall authorizes crew identity to
Production identity on TCP 22 only; it does not expose the Production listener.

The application client still signs requests and verifies response MACs. The crew identity may
read `VOX_NETWORK_TOKEN`, which is the caller capability already identified in ADR-0018 decision
3. It may not read the private Run HMAC, grant key or narrator credentials, and has no Production
disk or source. Registry reader is bound only on a separate `vox-crew` repository; granting
reader on the existing `vox` repository would leak the Production image and violate the first
guarantee even without a shared disk. Public artifacts still cross the published client boundary.

The installed operator entry point reads a separate read-only policy and defaults to no live
provider authorization. The supervised tunnel may reconnect automatically; a paid crew attempt
may not restart automatically. A single process lock excludes concurrent attempts. Checkpoints
and public events persist, but this alone does not claim durable browser admission, automatic
reconciliation or exactly-once paid execution. Those belong to the following launch milestones.

The [deployment evidence](../../.scratch/hackathon-launch/proofs/cloud-path-progress-2026-09-07.md)
records actual cloud-to-cloud signed contracts/status, pinned deployed revisions, the same disk
marker before/after crew stop/start, refused session/other-port/remote forwarding, and HTTP 403
for Production private secrets and registry. A fresh zero-quota connectivity Run supplies the
status control. Historical Runs returned receipt-schema integrity refusals and remain untouched;
this acceptance establishes connectivity and isolation, not compatibility of those old receipts.
