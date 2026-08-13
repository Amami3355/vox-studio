# Choose the production voice

Type: grilling
Status: resolved
Blocked by: none

## Question

Which operator-owned voice configuration should new Agent production interface runs use? The
choice belongs to production configuration rather than `VideoPlan`, and listening work spends
quota on every sample.

## Answer

**The production voice remains George, `JBFqnCBsd6RMkjVDRZzb`**, with `eleven_v3` and seed 7 —
the current configuration, unchanged. **No paid listening comparison is performed now.**

Rationale: deadline stability, and reuse of measured evidence. Committed take `0a663181b592`
is already a measured sample of this voice, which is what lets
[Define duration preflight](05-define-duration-preflight.md) start from a real 66.25
ms/authored beat-text character rate instead of an invented constant — so keeping the voice
is not merely cheaper, it is what makes preflight measurable at all inside the planning
timebox.

This is cut-line item 1, taken deliberately and up front rather than under pressure.

## Deferred cost

Changing the voice later is not a configuration edit. It:

- moves **every** beat boundary and **every** word onset, so word anchors resolve elsewhere;
- produces a new Take and a new `takeId`, staling any take id quoted in a commit message;
- leaves word-anchor tests structurally green while the **editorial** landing must be judged
  again by a human — the tests survive by construction, the judgement does not;
- invalidates the provisional 66.25 ms/authored beat-text character preflight measurement,
  which must be remeasured from the new voice's first verified take;
- requires every affected preview to be watched and listened to again.

Recorded here so that the cost is on the record whether or not anyone ever listens to a
sample.
