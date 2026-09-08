# Parallel credential provisioned

Historical provisioning record. Version 1 later proved malformed; the user explicitly
authorized direct replacement with version 2. Successful authentication, grounded research
and video delivery are recorded in [the September 8 delivery proof](milestone-2-delivery-2026-09-08.md).

The user entered the Parallel API key through the dedicated `--parallel-only` wizard.
Read-only Secret Manager metadata checks confirmed exactly one version in
`studio-prod-7f3a`: `PARALLEL_API_KEY/versions/1`, created at
`2026-09-07T22:32:25.628218Z`, state `ENABLED`. Describing `latest` resolves to this version.
No secret payload was read during verification. No second version was added.

The wizard initially reported a false failure after the successful upload. The installed
gcloud list formatter emits `enabled`, while describe/JSON emit `ENABLED`. The wizard
compared the list output against the uppercase spelling. Its test double had incorrectly
used the uppercase API spelling too. Reproduced both the post-upload failure and the
incorrect prompt on resumption, then normalized casing at the metadata boundary.
All eight wizard tests pass with the actual lowercase output and Windows CRLF, including
preservation without rotation and failed-upload non-retry. Bash syntax validation passes.
The corrected metadata helper also returned `ENABLED` against the actual secret.

Only Parallel was provisioned. No other credential, IAM binding, API or VM was changed.
The user restricted this session to credential provisioning: no hosted video attempt or
provider call was started. Key acceptance by Parallel and the first real video remain
unverified. Continue with the existing [milestone 2 runbook](../../../deploy/crew/milestone-2/README.md)
when video execution resumes; the credential provisioning step is now complete.
