# Milestone 2: real narrated video delivered

The hosted crew reached `rendered` at 2026-09-08 00:14:13 UTC and exited successfully.
The 49.28-second MP4 is downloaded and served on the user's PC at
<http://127.0.0.1:8765/> (direct media: <http://127.0.0.1:8765/milestone-2.mp4>).
This completes production and local delivery. The user accepted the technical result on
September 8 and requested validation, commit and push of the programmatic work. Artistic
and editorial acceptance remains open: the user expects substantial feedback in a later session.
The image/frame review recorded below was performed by Codex.

## Identity and verification

- Brief: `milestone-2-reusable-rocket-2026-09-07`.
- Production Run: `28364527-1061-4a27-9010-c317865747c9`.
- MP4 SHA-256: `50d1ddbc973ff54a8c7ee4b00147cec1d27b7f3abec3a6b533960e916d2b9de9`.
- 7,669,537 bytes; 1920 × 1080, 30 fps, H.264 video and AAC audio.
- Local file: `.scratch/hackathon-launch/runtime/delivery/milestone-2.mp4`.
- Hosted artifact: `artifacts/renders/74c098019e5bae13fb58b511092b187b29ffce29b20b1283bf8a6aa4fdfff942/preview.mp4`.
- Signed Production status and 12 artifact descriptors were verified through the crew client;
  every downloaded artifact was checked against its SHA-256 again on the PC.
- Final status has no stale stages. Validation and final compilation have no errors or warnings.
- FFmpeg decoded the entire MP4 without errors. Frames at 10, 25, 34 and 45 seconds were viewed:
  two typographic scenes, the three-burn explanation, then the generated illustration and label.
- Local page returns HTTP 200; full HTTP video response matches the signed digest; byte-range
  seeking returns HTTP 206 with the correct bytes. The browser was opened on the local URL.

The public [artifact index](milestone-2-delivery-2026-09-08/index.json),
[status](milestone-2-delivery-2026-09-08/status.json),
[crew terminal](milestone-2-delivery-2026-09-08/terminal.json) and
[local verification](milestone-2-delivery-2026-09-08/verification.json) retain the evidence.
Media and signed grants remain in ignored runtime storage; no credential was added to these files.

## Research and live authorship

The user's replacement Parallel credential was provisioned directly, as explicitly requested,
as Secret Manager version 2. Version 1 was retained. A hidden-input process sent the value
through stdin; it was not written to the repository or printed. A read-only nonexistent-task
probe returned authenticated HTTP 404 with the new key, compared with the malformed old key's
HTTP 400. The earlier [stopped attempt](milestone-2-attempt-2026-09-08.md) remains historical evidence.

The second grounded dispatch, `bb1ecadb-3be7-4b34-bc85-85fcb3d88333`, produced usable search,
source and citation-support metadata. Its two sources are Orbital Xploration and Wikipedia.
The operator then read three primary NASA/SpaceX documents directly and added five supported
claims. This supplement is explicitly recorded as direct operator research, not another
Parallel dispatch. The final dossier has five sources and seven claims; it is inaccurate to
claim that all five sources came from Parallel or that all are primary sources.
See [research](milestone-2-delivery-2026-09-08/research.json) and
[supplement provenance](milestone-2-delivery-2026-09-08/operator-research-supplement.json).

Actual crew usage across the same Brief's attempts: **16 model dispatches**, including
**two grounded dispatches**, with no pending dispatch. The 40-model/two-grounded ceilings
were retained. The role counts and response usage are in
[provider usage](milestone-2-delivery-2026-09-08/provider-usage.json):
24,169 prompt, 6,226 candidate, 35,899 thought-count metadata, 66,294 total tokens.
No model reasoning text is included. Image and ElevenLabs calls are separate from these counts.

Live ADK authored the narration, visual direction and plan. Invalid model output required
explicit schema guidance (numeric versions, arrays and beat-span IDs). A diagnostic launcher
serialized creative calls to respect the deployed journal's one-outstanding-dispatch rule.
The operator reviewed the final visuals, removed unsupported dates from a proposed timeline,
and made the single generated image explicitly illustrative. The recorded Beat text stayed
identical. [Narrative](milestone-2-delivery-2026-09-08/narrative.json),
[visual direction](milestone-2-delivery-2026-09-08/visualBible.json) and
[reviewed plan](milestone-2-delivery-2026-09-08/videoPlan.json) distinguish these deliverables.

## One narration, one accepted image

ElevenLabs George (`JBFqnCBsd6RMkjVDRZzb`, `eleven_multilingual_v2`, seed 7) recorded one Take:
`bf85b0aa0b04`. Its audio SHA-256 is
`d2fa37234ae613293eead48f027575127a79d069904516e68a6f303b39464578`;
alignment is `60bf891ceed169c7cf2a77cf524930a3a3a56d152efff6f5d4362b810612c071`.
The same Take was reused after visual review and image acceptance. The original placeholder
render is preserved but is not the delivered MP4.

The original Imagen 4 dispatch failed with no candidate. Production did not retain the exact
provider exception, so the precise original failure is unproven. Its configured model is listed
as discontinued in [Google's migration notice](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes).
The adapter was migrated to `generateContent` with `gemini-2.5-flash-image`, following
[Google's image generation documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/image-generation).

The user explicitly approved **one additional Gemini image call** in this session. The trusted
operator recovery preserved the original consumed grant, request digest, Run and job history;
a durable exclusive marker prevents this recovery from dispatching twice. No new grant or
identity was silently created. The Gemini call used Production's cloud identity at `global`.
The proof therefore includes **two image dispatches: one failed Imagen call and one successful
authorized Gemini recovery**, not a claim of only one image call.

- Request SHA-256: `cbdee70e12354d3b045942aa873b833d27164778773f5735a3f02cfc6bad47aa`.
- Job: `image-job-49c61acf99fc568a7928`; requirement `req_5252453d`.
- Accepted PNG: `2bbe636cc8548aa35aa4c2e705254998b07dcd102625ee2c57f126bcb7ccb0f3`, 1344 × 768.
- Gemini dispatch: 00:07:29–00:07:37 UTC. The same job reached `candidate`, then signed
  `image-accept` bound the agent's review to this exact PNG digest.
- The final caption reads `Illustration - final burn and landing legs`. It is a stylized
  unbranded booster, not a dimensionally accurate Falcon 9 technical depiction.

See [recovery](milestone-2-delivery-2026-09-08/image-recovery.json) and
[image review](milestone-2-delivery-2026-09-08/operator-image-review.json).

## Runtime provenance and remaining scope

Base images were not rebuilt during this run:

- Crew: `sha256:fa49a9334580558db760aea496524278aa4866101f1e864051c910120d5d080b`.
- Production: `sha256:dcea1c8238bc0b3f9bda9b96fb2c264e78ce4ebf0e71559f13b232837a98566e`.

These digests alone do not reproduce the run. Crew used the explicit systemd diagnostic
override under `/etc/vox-crew`, loading the patched `adk_roles.py` and
[diagnostic launcher](../../../deploy/crew/milestone-2/diagnose-attempt.py).
Their SHA-256 values are respectively
`702d4c1e241f9d3d5f0c60b0fe9a4f96448e3f2cc4d1af0afbafce1d8a6a28a7`
and `803ed3e5516401f13bc88a5d86f7ab8d5aad6dfdf1f61d5bbc34d868a014da58`.
Production used the one-off [recovery script](../../../deploy/crew/milestone-2/recover-image.mjs),
SHA-256 `7223174ecfad9afae286b68f9c6bb9a18e5111783149ca3a6ef55fe9b600dabf`, with a staged migrated
adapter whose SDK import resolves inside the container, SHA-256
`be3edfc003f447ba8d6dd64ace9ae69bf27ef0f91b61063956080d4f321aca5c`.
The running general Production service still belongs to the old image; its next deployment
must incorporate the repository's Gemini adapter before starting another Brief.

Focused checks pass: eight Google-image adapter tests (including invalid/multiple/thought-only
responses and no retry), Production TypeScript, and nine ADK role tests. Existing unrelated
working changes are preserved; no commit, push, browser Studio release or voice migration is
claimed. The local reader is a delivery page, not the next milestone's authenticated Studio.

The local server listens only on loopback and is not installed as an auto-start service.
If it stops, run `node .scratch/hackathon-launch/runtime/serve-video.mjs .scratch/hackathon-launch/runtime/delivery 8765`
from the repository root. The downloaded MP4 remains usable independently of that process.

## Programmatic validation before commit, September 8

The user accepted the technical outcome and deferred artistic/editorial feedback. Focused
checks on the pending implementation passed without new provider calls or a cloud deployment:

- Python: 70 passed and nine subtests passed across grounded research, operator export,
  hosted execution, ADK roles, crew assembly/CLI, deployment rendering and the Parallel wizard.
  Two SDK deprecation warnings remain.
- Google image adapter: eight tests passed, including cloud identity, response validation
  and refusal without retries. Vitest required execution outside the Windows sandbox because
  esbuild process creation was blocked with `EPERM` inside it.
- Production TypeScript: `pnpm --filter @vox/production typecheck` passed.
- All 13 public evidence JSON files parse; inspection found no credential fields or known
  credential patterns in the pending files. The Git ignore exception covers only this public
  evidence directory. Media and signed grants remain in ignored runtime storage.

These checks validate the implemented paths and retain the earlier live delivery evidence.
They do not close the Studio, deployment consolidation or artistic/editorial acceptance work.
`verification.json` retains the original delivery-time human-acceptance state as historical evidence.
