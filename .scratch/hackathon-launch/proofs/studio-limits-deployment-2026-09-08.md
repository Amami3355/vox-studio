# Studio limits and correction rollout

Deployed September 8, 2026, from the complete local workspace on `feat/adk-production-crew`,
based on `42dd39b`. No commit or Git push was made. This supersedes the deployment-pending
status in the [implementation record](studio-user-corrections-2026-09-08.md).

The private Studio remains at https://vox-studio-164544259455.europe-west1.run.app.
The rocket Brief is job `9cdaa4c5-08d1-4651-8189-1498ee97de56` and now exposes editable limits
and **Authorize and start**. No film was submitted, resumed or approved by these checks.

## Installed images

All three images were built, scanned and published. Digests were read back from the registry,
then verified in running containers and exact boot metadata.

| Component | Registry image |
| --- | --- |
| Production | `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox/production@sha256:95472b5db6367c0ebfcb02e9febbfb002d658943abfcd60e041c5e992a8e59ee` |
| API/frontend | `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/studio-api@sha256:b517949a092c2042f905ec6775991f21dc0a91486ab64d90045c07ac624e7bc6` |
| Worker | `europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/studio-worker@sha256:c7f619599cfce8aa2f49bce402d707885b243b5da9e1c67cfb04a773d0a7bdc7` |

Production was installed before Studio. The new worker's signed contract/status probe passed
before activation and inside its running container: protocol category version 4, `run.authorize`
present, zero provider calls. A dedicated key was generated in memory and installed as Secret
Manager `VOX_STUDIO_AUTHORIZATION_KEY`, version 1, with secret-level accessor bindings for
Production and crew identities. Both hosts fetched it into root-owned mode-0600 files on their
persistent disks. A public challenge produced matching HMACs inside the running containers;
Production also verified that this key differs from its network, Run and image-grant keys.
The API environment contains none of these or the provider credentials.

The [fetch script](../../../deploy/studio/fetch-authorization-env.sh) and
[runbook](../../../deploy/studio/README.md) record its paths and pinned version. The key was
never printed, saved locally, passed in a shell argument or baked into an image.

## Verification

- Image scans passed over 441 Production files, 98 worker files and 101 API files. Hashes of
  240 Production/video/voice sources and all 44 Python sources in each Studio image matched
  the workspace, including the new untracked implementation files.
- Production, API, worker and private bridge were active/running with empty `DropInPaths`.
  The crash harness remains retired. Both VMs' boot metadata matched through Compute REST.
- Edge browser checks passed for authenticated legacy-start controls, new-film limits,
  blocked-film correction controls, session refresh and mobile width. Screenshots and the
  `/api/production-limits` response are saved. No application mutation except login was sent.
- All four jobs retain their identities, statuses, original Briefs, events, sources, narration,
  previous image fields and media. Crew checkpoint and provider-journal hashes, including
  archived files, were byte-identical across the update.
- Run `68871fb6-927a-4549-b194-ae72261d4c97` retains 23 calls, one search, four images and one
  Take. `simultaneous_strike` remains accepted; all three `propagation_light` candidates remain
  rejected. Five detailed image observations and image/visual correction controls are exposed.
  The signed Production snapshot did not change.
- The already-recorded local feature suites were not rerun. Deployment checks exercised the
  built images and hosted application. `git diff --check` passed.

The rocket Brief retains its historical database message mentioning operator authorization;
the current form immediately below it offers **Authorize and start**. No historical message
or budget was rewritten during this rollout.

## Evidence and rollback

Ignored records are under `../runtime/studio-limits-20260908/`: registry digests, source manifest,
image verification, before/after jobs, signed probes, key provisioning metadata, API isolation,
browser screenshots/assertions, preservation checks, logs and exact before/after boot configs.

Remote prior units are under `/mnt/disks/vox-runs/operator/studio/before-limits-20260908/`
on Production and `/mnt/disks/vox-crew/studio-operator/before-limits-20260908/` on the crew.
The latter also contains the stopped Studio database backup and `checkpoints.sha256`.

Prior digests: Production `fee2112f16553a28e0d7c7c980142697b2fad3b67d78bf9e5d2616157057148e`,
API `01b84be0d8dfe34a21f85fd5973b8670ac0f561d9db82febc41d96291bcaa718`,
worker `cccfec947651d598a0d4071c6c105b61a7884adfba1f25416b4397ba90a1eac7`.

Rollback requires stopping execution, checking for subsequent work, restoring the archived
units and `*-previous.yaml` metadata, reloading systemd and verifying the prior services.
Preserve volumes, keys, journals, authorizations and media. Do not restore the database snapshot
over later user work. Assess compatibility with new authorizations before rolling back after
the user's trial.

## Remaining evidence

The user can now run their end-to-end trial in the hosted UI. This rollout does not prove a
live `run.authorize` mutation or newly accepted film; those require their explicit submission.
Actual render-disconnect recovery, accepted final film, SceneCapabilities/catalog changes,
final voice work and publication/rehearsal remain open.
