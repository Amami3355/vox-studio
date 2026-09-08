# Milestone 2 attempt: stopped for malformed Parallel credential

Historical stopped attempt. The user subsequently supplied a replacement credential and
authorized continuation; see the [real video delivery](milestone-2-delivery-2026-09-08.md).
The stop and quota usage recorded below remain part of that Brief's history.

The user requested the hosted video and explicitly instructed the operator to stop if
the Parallel credential was incorrect, so the user could rerun the wizard.

Before starting, both VMs were RUNNING. Production was active on loopback with its ext4
Run disk and session-12 image digest. Crew setup and bridge were active, the attempt unit
was inactive, the canonical request matched the staged request byte for byte, and the
installed policy retained the 40 model / 2 grounded dispatch ceilings. No prior video
attempt checkpoints were present.

One explicit attempt was started. Its identifier is
`3d7f8e51-d64f-4353-a4e8-d6ac7938aa9f`, under crew state
`briefs/6381730fbb94348555c1565a97e13474bd480156617ae5d7c17b14f949fc5f1d/`.
It terminated with `RESEARCH_CONTRACT_INVALID`, `runId: null`.

The persistent provider journal records two completed dispatches on September 7 UTC:

| Role | Dispatch ID | Prompt | Candidate | Thought | Total |
| --- | --- | ---: | ---: | ---: | ---: |
| ResearchAgent | `84c6cef3-d59a-4d01-b077-6d03da8aa862` | 338 | 276 | 1276 | 1890 |
| ParallelGroundedResearch | `c5da0d4a-b009-4056-ab38-741618b9dd73` | 295 | 1059 | 7682 | 9036 |

The grounded dispatch returned at `2026-09-07T22:47:36.179519+00:00`, but its output
failed dossier validation. The adapter did not retain the rejected response or precise
validation reason. A completed Gemini response does not prove successful Parallel Search.
The malformed credential below is established independently; it does not establish which
dossier validation check failed.

Read-only authentication diagnostics from the crew queried the Parallel task-status
endpoint for a nonexistent task identifier, without starting any task or search.
Without a key, the endpoint returned HTTP 401. With the configured key, it returned
HTTP 400 and a generic HTML error. A subsequent local-only format inspection inside
the crew container established that the installed value is nonempty ASCII but contains
control characters and is not printable. No key value was printed or exported.

Execution stopped according to the user's instruction. No second grounded dispatch,
Production video Run, image generation, narration or render was started. No credential,
IAM policy, deployment or execution ceiling was changed. The attempt and provider journal
remain on the persistent crew disk. The milestone remains open; no video URL exists.

The current `--parallel-only` wizard keeps an enabled secret version without prompting.
Simply rerunning it will not replace this malformed enabled version. Replacement must be
handled explicitly in the user's next credential-provisioning step; do not silently strip
characters, rotate the key or restart the paid attempt. After replacement, retain this
Brief's journal and its consumed dispatch counts when resuming.
