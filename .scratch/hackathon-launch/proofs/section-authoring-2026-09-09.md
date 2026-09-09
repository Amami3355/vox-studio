# Model output capacity and section authoring

Local implementation following the user's request to support four- and five-minute films
without the arbitrary SceneAuthor output ceiling. It builds on
[bounded model-response recovery](model-response-recovery-2026-09-09.md).
No deployment or paid generation was performed in this change.

## Result

- SceneAuthor and PlanRepair start with 65,536 output tokens on both supported pins,
  `gemini-3.5-flash` and `gemini-3.6-flash`. Lower saved retry settings cannot reduce that
  capacity. The model pin is unchanged. Unknown overrides retain conservative defaults.
- `model_output.py` centralizes initial and recovery capacity. Known-model recovery no longer
  stops at 32,768. The maximum is available space; prompts do not request padding to fill it.
- SceneAuthor processes one section at a time with fresh sessions. Every section retains the
  complete immutable film structure, global editorial context, an identical generated selected
  capability prefix, and exact previous image requirements. Tools remain the existing read-only
  visual catalog/validation tools. No scene capability or runtime contract was changed.
- Each section's validated fill set is checkpointed separately. Wrong, duplicate or missing
  scene IDs fail within the existing bounded recovery boundary. The final assembly still passes
  whole-plan validation/PlanRepair and all subsequent Production gates.
- A failed section's format retry preserves previous section results. Safe continuation after
  a call limit reuses those checkpoints. Unknown dispatch outcomes remain blocked. Older
  whole-film SceneAuthor results keep their original checkpoint identity and are reused.
- Studio exposes 2-, 3-, 4- and 5-minute duration choices alongside existing short options.
  Its API accepts 30–300 seconds; worker preparation accepts 10–300 seconds. A saved five-minute
  admission survives a lost response and browser refresh with the same idempotency key.
- Section progress is public. Every new section consumes a normal provider call; a retry also
  consumes a technical repair. User-selected call, image and repair totals are not increased.

The provider maximum was verified against Google's
[Gemini 3.5 Flash specification](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash)
and [Gemini 3.6 Flash guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-6-flash).
Both publish 65,536 output tokens. Earlier Context7 SDK documentation supplies the
`GenerateContentConfig.max_output_tokens` interface used by the existing adapter.

## Verification

The new section-authoring suite exercises actual ADK adapter parsing with a simulated provider
transport: a 300-second target with five sections, a failed middle section, global context and
asset continuity across fresh sessions, durable restart after a call ceiling, legacy whole-film
checkpoint reuse, unknown provider outcomes and out-of-scope fills. Capacity is checked for both
roles and model pins, with and without a journal, including old saved retry limits.

162 distinct Python tests passed across targeted verification: the nine-file combined suite had
one obsolete assertion that SceneAuthor retained conversation history; its updated role suite
then passed all nine tests. Section session isolation is independently covered by execution
tests. The remaining 153 tests in the combined suite passed unchanged.

Studio typecheck, build and targeted Biome checks passed. Browser verification covers the new
five-minute lost-response/refresh path as well as the existing admission, authentication,
limits and correction paths. Test preparation now reuses one separate administrative session
to reset fixtures; it no longer consumes repeated logins against the real login rate limit.
Browser sessions under test remain independent and the production authentication limits remain
unchanged. All seven browser scenarios passed together in 14.1 seconds.

These are offline behavior checks, not evidence of a newly rendered five-minute film. The
existing rocket Run and its provider journal remain untouched. Deploy the updated worker and
API/frontend before preparing its bounded continuation with the documented reconciliation tool.
