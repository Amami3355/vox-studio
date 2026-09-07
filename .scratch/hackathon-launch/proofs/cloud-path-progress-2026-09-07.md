# Cloud path: current implementation and deployment evidence

Observed 2026-09-07. **Cloud path answers is complete** following the session 11 deployment and
signed round trip before/after crew restart recorded below. Earlier sections describe the
pre-deployment state and are historical. The canonical hosting approval is in
[ticket 03](../issues/03-connect-the-hosted-crew-without-breaking-production-isolation.md).

## Production updated and verified

- `vox-service`, project `studio-prod-7f3a`, zone `europe-west1-c`, private IP `10.132.0.2`.
- Built/scanned/pushed current Production, read the registry digest, rendered the existing
  `deploy/cloud-init.yaml`, applied it and performed a controlled stop/start.
- Running image read back using `deploy/crew/inspect-production.sh`:
  `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox/production@sha256:5116828d7a2a13aa0ee3af71272c89e3c6c80ac8c261e30e8b8f6506465658dd`.
- Revision label `9808524`; service active; `/dev/sdb` mounted ext4 at `/mnt/disks/vox-runs`;
  listener `127.0.0.1:8080`. Production remains RUNNING.
- Image leak scan: 329 files, no violations; `/etc/vox` absent from image.
- `deploy/container-smoke.mjs` executed inside the deployed container: all eight checks passed
  (listening control, malformed request refusal, forged MAC refusal, signed answer, successful
  contract index, replay refusal, available-egress control, adapter egress refusal).
  This is Production-local evidence, **not** the missing cloud-to-cloud round trip.
- Existing Run directories: `run-49cca702a0ed`, `run-75db826a380a`.
- No model, image generation, narration or render was invoked.

## Crew prepared

- `services/agents/src/vox_crew/hosted.py`: `probe` reads signed contracts and existing Run
  status; `run` builds the existing crew with separately mounted operator policy, persistent
  checkpoints and public events. One Linux lock, no automatic paid retry, image review pauses.
- Isolated registry image, digest read back from Artifact Registry:
  `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:b9fe91eb85bd047f51b4004304a562c6f1aa74c40b6892a0b347cb9deba10502`.
- Tag `9808524-hosted`; revision label `9808524-hosted-wip`. Implementation currently uncommitted.
  `hosted.py` SHA256 verified identical locally and in the image:
  `c022b138c42e0bd7fd058bff98d6f5b5678be6b236fd1cfe3d4e84d6a27ee102`.
- An earlier identical copy remains under `vox/crew:9808524-hosted`. Do not deploy from that
  repository: giving crew reader access there would reveal Production images.
- Linux check: ADK 2.7.1 installed, `/app/packages/production` absent, startup refuses an
  unmounted state directory. Selective Docker context contains Python crew source and manifest.
- Crew suite: **554 passed, 1 skipped**. Renderer tests: **4 passed**. Existing deployment
  contract script: all checks passed. Diff whitespace check passed.
- `deploy/crew/` contains the renderer, boot secret fetcher, restricted SSH configuration,
  operator policy, checks and runbook. ADR-0022 is **proposed**, not accepted.
- Ignored generated files: `.scratch/hackathon-launch/runtime/production-current.yaml`
  (applied), `production-host.pub` (read through operator IAP SSH), `crew-cloud-init.json`
  (prepared only). No private key or secret value crossed the operator terminal.

## Cloud permissions actually changed

- Created separate Artifact Registry repository `vox-crew` in `europe-west1`, published the
  crew image there and granted the existing crew identity reader on **only that repository**.
- Granted `vox-crew@studio-prod-7f3a.iam.gserviceaccount.com` Secret Manager accessor on
  **only `VOX_NETWORK_TOKEN`**, the caller capability identified by ADR-0018 decision 3.
- No crew VM/disk/firewall rule/SSH account was created. No inference role was granted.
  Effective denial of Production private secrets and registry still needs a runtime test.

## Additional pre-deployment check

The next goal turn verified the SSH proposal with `/usr/sbin/sshd` on the actual Production
host, using only temporary configuration files under `/tmp`. Both an additional Include and
an appended Match block passed `sshd -t`. `sshd -T` for the appended candidate with
`user=voxbridge,host=vox-crew-worker,addr=10.132.0.3` reported `maxsessions 0`,
`allowtcpforwarding local`, `forcecommand /bin/false`, `authorizedkeyscommand none`, and
`permitopen 127.0.0.1:8080`. No active SSH configuration or account was changed. This verifies
parser/effective configuration compatibility, not an authenticated tunnel or denial at runtime.

## Historical execution checklist from session 10

For the prepared VM option: create `vox-crew-worker` (`e2-small`, COS, no external IP, existing
crew identity) with a new 10 GB `vox-crew-state` persistent disk, auto-delete disabled, and
the rendered metadata. Add narrowly scoped crew-to-Production TCP 22 and operator IAP-to-crew
TCP 22 rules ahead of `vox-deny-all-ingress`. Existing NAT covers all subnet ranges. Boot
initializes only the named blank crew disk and refuses an existing non-ext4 signature.

Read the generated crew **public** key. Render/apply the Production bridge configuration
with the already verified Production digest. Check effective SSH restrictions, run the probe
on the crew VM, reboot it and rerun to prove the same persistence marker. Verify denied
Production shell/other-port forwarding/private secret access/Production registry access.
Record both deployed revisions and signed responses before accepting ADR-0022, resolving
ticket 03 and checking the milestone. The hosting choice is now approved; these runtime checks
remain unexecuted.

## Session 11: deployed and proved, 2026-09-07

### Actual topology

- `vox-crew-worker`, `studio-prod-7f3a/europe-west1-c`, COS, `e2-small`, private address
  `10.132.0.3`, no external address, identity `vox-crew@studio-prod-7f3a.iam.gserviceaccount.com`.
- New 10 GB `pd-standard` data disk `vox-crew-state`, same device name, `autoDelete: false`;
  `/dev/sdb` mounted ext4 at `/mnt/disks/vox-crew`. COS also has its own 10 GB boot disk.
- `vox-allow-crew-production-ssh`: priority 1000, only TCP 22, source crew service account,
  target Production service account. `vox-allow-iap-crew-ssh`: priority 1000, only TCP 22,
  source `35.235.240.0/20`, target crew service account. Both precede the existing deny rule.
- The root-owned crew private SSH key remains on the crew data disk, mode `0600`, outside
  container mounts. Only its public half was read through operator IAP access.
- Production metadata installs the restricted `voxbridge` account. Actual `sshd -T -C` reported
  `maxsessions 0`, `allowtcpforwarding local`, `forcecommand /bin/false`,
  `authorizedkeyscommand none`, `permitopen 127.0.0.1:8080`.
- The persistent systemd bridge connects from the crew host to Production's pinned host key.
  IAP SSH was used for operator commands; no developer-machine port forward carries the client
  requests. Both VMs were left RUNNING.

### Runtime failures found and handled

The first signed discovery exposed a real Production boundary defect: the Windows-drive regex
matched `s:/` inside `https://json-schema.org/draft/2020-12/schema`, publishing
`http<redacted-path>` instead. The crew correctly refused the altered schema. A regression using
the complete generated VideoPlan contract and a mixed URL/private-path response failed before
the fix and passed after a URI-scheme guard was added. No schema check was relaxed.

Production was rebuilt, scanned, pushed, pinned using the registry-read digest, and restarted:

- Final image: `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox/production@sha256:cb7ea2135cfc514406aaefb7d7e321eeed2f459bd015d15eca9ec583fe82eac7`.
- Runtime revision label: `9808524-sanitize-wip`. Local `sanitize.ts` SHA256:
  `262598dc232eaae4e0a21796658cd74eb8683b7d6a4a35b40277ba4aba64993a`.
- Crew image remains `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:b9fe91eb85bd047f51b4004304a562c6f1aa74c40b6892a0b347cb9deba10502`,
  runtime revision `9808524-hosted-wip`, ADK `2.7.1`.
- After deployment, Production's listener and ext4 mount were verified again. All eight deployed
  smoke checks passed. Image scan: 342 files, no violations, `/etc/vox` absent.
- Targeted sanitizer/boundary/network tests: 47 passed; Production typecheck passed.
  Hosted/renderer tests initially passed 9 checks; after the Run ID correction the renderer's
  expanded suite passed 9 checks. Existing deployment contract checks all passed.

The prepared renderer also confused a disk directory (`run-49cca702a0ed`) with a public Run UUID.
It now requires explicit `--run-id`, accepts the real identifier and rejects unit-argument
injection. Its regression failed before the correction and passed after it.

Both historical Runs then returned a signed receipt-schema integrity refusal, independently of
connectivity. They remain untouched; [ticket 08](../issues/08-diagnose-historical-run-receipt-compatibility.md)
owns diagnosis. A fresh connectivity-only Run was initialized through the hosted signed client
with `maxNewTakes: 0`: `f70e55e4-c33f-457a-bc80-7ab5e2bb9d65`. It remains `initialized`.
No model, research provider, image generation, narration or render was invoked.

### Signed round trip and persistence

`vox-crew-probe.service` fetched the real contract index and all seven projections, instantiated
the published shape validators and checked the new Run's status. MAC verification happens in
`HttpProductionClient` before each envelope reaches the probe. Both observations succeeded:

| Observation | UTC | Status | Provider calls |
| --- | --- | --- | --- |
| Before crew stop/start | `2026-09-07T20:40:20.161502+00:00` | `succeeded` | 0 |
| After crew stop/start | `2026-09-07T20:41:59.018675+00:00` | `succeeded` | 0 |

Both report `signedResponsesVerified: true`, persistence marker
`1460309a-d208-4bd4-a7da-cad6440fe8dc`, and status SHA256
`13546277f81e995c48bfe4a829cdb447bd28b1b36b038fcf7a7cfb11d276f42c`.
The second observation points to the first through `previousObservation`. Setup and bridge units
were active after reboot; the same disk mount and private-key mode were verified.

Contract envelope SHA256 values, unchanged across reboot:

| Projection | SHA256 |
| --- | --- |
| catalog | `2d6b1295153fcffc1fecdc48198246a87a971d80e26cff041fd337b2a110c517` |
| checks | `147e5c2f7cee313c7d06d91f608e66e61bb4974c2bc8fb5cff114316ef5a0190` |
| design | `c452318627bb1a677fb03a108be704501be56ec59809b6750d67fe679dab03ea` |
| language | `88b59fab9de6f4064fabd1eab9d12e18cc9ff0d4b536eb9023ff06754b1d1243` |
| operating | `25652d27d3ef29b444e3fa4a3614483d7a38c64670ba2c4ee77d1c6f988abe94` |
| plan | `fe7c8784eb755471527adf2a009b0a087e66b9095344b8c6bef39a8c5ed0ec1e` |
| protocol | `030068f8ee185909a21b4ab0f21f762809217ae71eee3364e400e0dcb3946758` |

The host retains `state/connectivity-before-reboot.json`, `state/connectivity.json` and the
public `state/connectivity-init.json`. Generated boot configuration remains under ignored
`.scratch/hackathon-launch/runtime/crew-cloud-init.json` and `production-bridge.yaml`.

### Isolation controls actually exercised

From the crew host, `check-ssh-boundary.sh` observed refused session creation, another-port
forwarding refused as `administratively prohibited`, and remote forwarding refused. These are
policy-specific errors, not a timeout accepted as proof.

From the crew container using its attached service identity, `check-identity.py` observed:

| Resource | HTTP status |
| --- | --- |
| `VOX_NETWORK_TOKEN` access | 200 |
| `VOX_RUN_HMAC_KEY` access | 403 |
| `VOX_GRANT_KEY` access | 403 |
| `ELEVENLABS_API_KEY` access | 403 |
| `vox-crew` registry image listing | 200 |
| `vox` Production registry image listing | 403 |

After crew restart, an actual `docker pull` of the pinned Production image using the crew
identity also failed with `artifactregistry.repositories.downloadArtifacts` denied. This
checks download refusal in addition to the image-listing refusal; no Production image was pulled.

The script printed only names and status codes, never tokens or response payloads. Production
still binds loopback and retains its own disk and identity. The operator policy grants no live
provider phase. This completes the connectivity milestone and ADR-0022 evidence; it does not
prove browser admission, historical Run compatibility, paid execution recovery or a real video.
