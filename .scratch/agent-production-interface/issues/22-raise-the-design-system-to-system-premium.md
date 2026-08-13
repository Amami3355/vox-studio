# Raise the design system to system-premium

Type: grilling
Status: open
Blocked by: none

## Question

What must change in the design system before a narrated preview reads as system-premium?

This ticket exists because a human evaluator watched a technically complete preview and
refused exactly that claim. It is a **quality** frontier, not a defect report: nothing in the
production interface misbehaved.

## The evidence that opened it

On 2026-08-13 (UTC) Mourad watched and listened to the frozen Northbridge preview
`502afe11b44324b4e165ee56148ffbdd66702d548e06bf8ccac8064d1f0a3c1a` (`takeId` `f089beb94850`,
24.363 s, H.264/AAC) on a built-in laptop display with wired headphones, and completed the
ticket-09 verdict form. Five of six rows passed. Row 5 failed:

> composition, typography, motion and pace are system-premium

The recorded reason is that the design system is not yet good enough; no single offending
element was named. The other five rows — narration, the March highlight landing on the unique
spoken word, legibility, honest placeholder degradation, and whole-preview watchability —
passed on the same viewing.

That single failed row fails the whole human verdict, so
`.scratch/agent-production-interface/proofs/2026-08-13T225821-834Z-northbridge-night-bus`
carries `machineVerdict: pass` and `humanVerdict: fail`. See ticket 21.

## Why this is not a production-interface ticket

The failure is downstream of everything ticket 21 proves. The isolated agent authored a valid
plan, the March anchor landed, the placeholder degraded honestly and the render was correct
H.264/AAC within budget. What the evaluator rejected is the visual language those correct
mechanics render **into** — the shared composition, type and motion vocabulary owned by the
catalogue and the video package, not the Run lifecycle.

Fixing it therefore must not require re-running a paid proof to observe. Any candidate
improvement should be judgeable on a rendered preview built from an existing Take.

## What the frontier has to settle

- **What "system-premium" means operationally.** The row is currently one sentence of prose.
  A quality bar that fails a preview without naming a defect cannot be iterated against or
  handed to a fresh agent.
- **Where the gap actually lives** — composition, typography, motion, pace, or the interaction
  between them — and which of those the current two capabilities (`image_context`,
  `bar_chart`) can even express.
- **Whether the placeholder confounds the judgement.** Ticket 09 rules that a placeholder is
  acceptable for system-premium and that final-image premium is explicitly out of scope, but
  this verdict was cast on a preview whose opening image was a placeholder. Establish whether
  the same design system reads as premium with real media before redesigning around it.
- **What evidence closes this ticket.** Presumably a re-watch of a rebuilt preview, but the
  re-watch needs a defined artifact and a defined bar, or it repeats this outcome.

## Cost and scope pressure

The hackathon deadline is 7 September 2026. The map's cut line and `Never cut` list do not
mention design-system quality, and the map puts "final image generation, human asset selection
and frame-premium judgement" out of scope. Decide deliberately whether this ticket sits inside
the shipped destination or beside it — it is currently unbudgeted either way.

## Does not claim

Opening this ticket does not concede that the design system is broken, that the Northbridge
proof's other five rows are in doubt, or that the production interface needs a change. It does
not close or reopen gap 8, which still needs its own watch/listen of `section--vertical-slice`.

## Resolved when

The design system has a stated, checkable premium bar; the specific gap behind the 2026-08-13
refusal is identified against it; and a named evaluator passes the system-premium row on a
preview built with the revised system.

## Comments

### Opened 2026-08-14

Recorded at the user's instruction when the Northbridge human verdict was collected. No
approach has been chosen and no work is claimed.
