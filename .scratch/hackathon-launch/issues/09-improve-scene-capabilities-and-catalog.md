# Improve SceneCapabilities and the catalog before tonight's publication

Parent: [Vox Studio delivery map](../map.md)
Type: task
Status: needs-triage
Assignee: none
Blocked by: none

## User direction

On September 8 the user requested one additional milestone before publication tonight:
improve existing SceneCapabilities and the catalog, potentially add new SceneCapabilities,
and explicitly retain the diagnosed framing problem. Return to this work later; the next
active milestone is Studio rehearsal/reliability. No implementation is started by this ticket.

## Known defect to retain

[Diagnosis and visual evidence](../proofs/studio-final-block-diagnosis-2026-09-08.md):
the lightning/thunder film's `scene_4` uses `image_context` / `splitLeft`.
The accepted image includes an observer at the left and lightning at the right.
The renderer fills its narrower plate by cropping, excluding the observer. The
published capability contract does not expose this limitation or a framing control.
The Image intention's textual crops do not configure actual renderer geometry.

The final reviewer attributes the missing observer to the bitmap and requests
regeneration. The resulting composition has a 181-character subject against the
80-character schema maximum, and the previously consumed technical repair allowance
causes a terminal block. Both framing and correction routing need an explicit outcome.

Job: `613ce79f-de42-4116-858f-c314c96f16d1`.
Run: `24c27f73-faff-4f8c-a7b4-e87fe8103f43`.
The 43.051-second preview exists and decodes with audio. Final review remains rejected.

## Scope to select when resumed

- Improve visual composition and behavior of existing SceneCapabilities.
- Make framing guarantees, limitations and selection guidance explicit in the catalog.
- Consider new SceneCapabilities for the desired explanatory and visual needs; the list
  and implementation scope remain to be selected, rather than assumed from this ticket.
- Check essential subjects in their actual composed views before a full film render.
- Distinguish bitmap defects from renderer/layout defects in the correction path, retaining
  accepted assets when appropriate and keeping descriptive detail in Image intention.

`image_detail` already preserves the whole image initially and is a candidate to evaluate
for the affected shot. It has not been selected or tested as the final correction.

## Exit evidence

- The selected improvements and any additions are implemented, with catalog and renderer
  behavior in agreement. Follow `docs/adding-a-capability.md` for every capability change.
- A regression case with essential subjects at opposite image edges proves the chosen
  framing preserves the intended explanation; appropriate catalog/render checks pass.
- The crop defect and its correction-routing failure are resolved with evidence. Any
  recovery of the historical terminal Run preserves its journals, Take and ceilings and
  uses an explicit verified reconciliation; no blind restart or new-generation assumption.
- Recheck the resulting film and release revision in final rehearsal. This ticket does not
  treat the current preview as an accepted final film or authorize paid provider dispatches.

## Comments

2026-09-08: Added at the user's request as a separate milestone after initial Studio rehearsal
and before final voice work and publication tonight. Broader visual/capability discussion is
intentionally deferred until this milestone is resumed; its scope is not yet AFK-ready.
