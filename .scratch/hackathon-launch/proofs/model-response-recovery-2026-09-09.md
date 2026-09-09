# Bounded recovery of incomplete model responses

Follow-up: [full model output capacity and section authoring](section-authoring-2026-09-09.md)
supersedes the initial 8,192/32,768-token authoring policy recorded below.

Local correction of the [rocket SceneAuthor failure](rocket-scene-author-block-2026-09-09.md).
The deployed application remains on the [September 8 rollout](studio-limits-deployment-2026-09-08.md).
This record does not claim deployment, a paid retry or a completed rocket film.

## Cause and reproduction

The 4,530-character public response saved by the original provider callback is now an offline
regression fixture. Before the fix it fails through the real SceneAuthor adapter, JSON parser,
SplitVisualPlanner and AutonomousRun composition checkpoint: the parser exception escapes before
the validator/PlanRepair loop. Thus the user's two authorized repairs were never reached.
The SDK transport retry setting of one attempt is a separate conservative boundary for uncertain
provider outcomes; enabling blind HTTP retries would not fix this parsing failure.

The historical usage is 1,236 candidate tokens plus 6,952 thought tokens against a configured
8,192-token cap. Output exhaustion is a strong hypothesis, not a verified finish reason. The
old callback did not retain that field. Current ADK documentation retrieved through Context7
and the installed `google.adk.models.llm_response` both expose `finish_reason` on `LlmResponse`.
Only public text and token counters were inspected; no thought text was requested or retained.

Fresh read-only observation on September 9 confirms `VOX_CREW_MODEL=gemini-3.5-flash` and that
same model in the provider dispatch records. Run `12515139-b627-4ced-9677-560f9844b153` remains
blocked in `scene_author`, with eight dispatches/eight responses and zero of two repairs used.
Checkpoint SHA-256 is still `d1d9e572832270b9cc378d78e0107e05804df202da33d47e57a2938dfa955644`.
Existing authorization expires at `2026-09-11T02:28:13.291480+00:00`; a future executor must
recheck its validity. The safe observation is in ignored runtime evidence at
`../runtime/studio-limits-20260908/model-recovery-observation-20260909.json`.

## Implemented behavior

- A common execution boundary retries confirmed malformed model answers and contract failures
  in model-only steps. Parsing, structuring, filling and narration/bible checks occur before
  checkpoint success. Existing semantic validators and Production validation remain mandatory.
- Recovery and PlanRepair share the existing total technical allowance. Reservations persist
  before attempts; restart, cached composition and limit extensions never reset consumption.
  Provider call totals and expiry remain enforced by the journal. Incomplete/uncertain calls,
  refusal finish reasons and confirmed HTTP failures do not enter format recovery.
- Retried roles receive their original inputs in fresh sessions and bounded validation feedback.
  Truncation/malformed JSON gets doubled output headroom capped at 32,768; schema failures retain
  their cap. More tokens may be consumed per retry; user-selected attempt totals remain unchanged.
  Finish reasons, configured caps and reported model versions are now recorded without thoughts.
- Studio presents a saved-work message and the actual public failing phase. Exhausted automatic
  recovery offers continuation without JSON instructions or unrelated editorial changes.
- `deploy/studio/reconcile_model_response.py` prepares historical recovery with exact archives,
  existing request-bound authorization, fresh signed status and replayed public response evidence.
  Default inspection does not queue. Explicit application queues the same Run with the next repair
  charged by the corrected worker. Tests cover a crash between adoption and queueing.

## Validation

The original recorded answer is replayed through the real role/parse/checkpoint path with a
simulated provider transport, followed by a complete fixture response. Recovery preserves saved
structure and narration. Tests also cover invalid JSON roots, missing scene fills, empty and
parseable MAX_TOKENS answers, other model roles, media review bytes, shared PlanRepair exhaustion,
call/repair ceilings, expiry, provider refusal, uncertain dispatch and crashes during retry.

148 distinct Python tests passed across targeted runs. The combined eight-file suite passed
144 tests; after the four additional finish-reason/media cases and their callback adjustment,
the model-recovery, autonomous and continuation suites passed all 68 tests. Studio typecheck,
build, formatting and `git diff --check` passed. All seven browser scenarios passed across runs,
including the new continuation without editorial instructions. Its initial test-only login race
was fixed by waiting for authenticated navigation before opening the fixture film.
No provider generation, image decision, authorization mutation, deployment, commit or push was
performed. The existing Run is prepared for controlled recovery after worker/API deployment.
