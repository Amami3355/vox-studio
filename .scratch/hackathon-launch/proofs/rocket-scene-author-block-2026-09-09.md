# Rocket trial: incomplete SceneAuthor response

Follow-up: [local recovery correction and regression evidence](model-response-recovery-2026-09-09.md).
The original diagnosis below remains the historical observation; the correction is not yet deployed.

Read-only diagnosis of Studio job `9cdaa4c5-08d1-4651-8189-1498ee97de56`,
Run `12515139-b627-4ced-9677-560f9844b153`, after the user's hosted trial.

The persisted diagnostic is `SceneAuthor did not answer with JSON.` The pending parent is
`composition`, substep `scene_author`. Research, narration, the Director's narration review,
art direction and visual structuring already returned before this failure. The public event
`verification` is the generic exception handler's phase, not the actual failing role.

The provider journal contains eight dispatches with eight responses. SceneAuthor's saved public
answer has 4,530 characters, starts with an opening JSON code fence and ends in the middle of
an unfinished scene event. It has neither complete JSON nor a closing fence. Replaying this
exact recorded answer twice through the deployed `_json_answer` reproduces the same exception
without a provider call. Removing the opening fence still leaves incomplete JSON.

The response usage records 1,236 candidate tokens and 6,952 thought tokens; their sum is close
to the configured 8,192 output limit. This is consistent with output exhaustion, but the
journal does not preserve the provider finish reason, so that upstream explanation is not
established. No model reasoning was read or retained by this diagnosis.

The parsing exception escapes before the plan-validation/PlanRepair path. Its repair counter
remains zero, despite the user's allowance of two. The generic exception handler then blocks
the job and replaces the useful diagnostic with the exception class and an operator message.
These are two application shortcomings: incomplete model responses do not enter a bounded
format-recovery path, and the UI does not explain the specific failure. The research correction
option is a generic available control, not evidence that research caused this stop.

Preserved work: eleven source entries, five written narration beats, no generated image,
no recorded Take, no rendered film. Consumption is eight of forty total calls and one of four
searches. No quota increase is justified by this failure alone.

Evidence: `../runtime/studio-limits-20260908/jobs-diagnosis-20260909.json`,
`rocket-diagnostic-20260909.json`, `rocket-response-replay-20260909.json`.
The checkpoint hash at observation is
`d1d9e572832270b9cc378d78e0107e05804df202da33d47e57a2938dfa955644`.

No code, remote checkpoint, authorization, counter, image decision or provider execution was
changed. This turn answers the user's request to explain the failure; repair and recovery
remain outstanding.
