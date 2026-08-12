# ADR-0004 — The voice provider

**Status:** accepted · 2026-08-12
**Scope:** which service turns a beat plan into timed beats, how beat boundaries are
recovered from what it returns, and what language the slice speaks. Nothing about the
compiler, and nothing about time downstream of `TimedBeat`.

**Supersedes** ADR-0002's first decision — "SSML marks, not a forced aligner" — and the
second, "n beats need n+1 marks, not n−1", in its mechanism but not in its shape. Every
other decision in ADR-0002 stands unchanged, including the two this document depends on.

## Context

ADR-0002 decided Google Cloud TTS `v1beta1` with `enableTimePointing: ['SSML_MARK']`, one
`<mark>` per beat boundary, n+1 marks. The provider is now ElevenLabs, and that mechanism
is not available there: its SSML surface is `break` — absent from Eleven v3 — and
`phoneme` on Flash and Turbo v2. There is no `<mark>`, and no mark timepoints to read.

Two reasons for the change, and only one of them is technical.

The practical one is that `packages/voice` has been named the largest deadline risk in
every handoff since 2026-08-11, and in that time not one synthesis call has been made. An
ElevenLabs API key is minutes. A Google Cloud project is billing, a service account and
IAM, and every one of those steps is a place the slice stops. Lowering the cost of the
*first* call is worth more right now than any property of the audio, because the thing
being bought is the answer to whether the contract in `compile/timings.ts` survives
contact with real output.

The technical one is that ADR-0002's *argument* survives the change of mechanism. That is
what makes the switch safe rather than merely convenient, and it is the substance of
decision 2.

## Decisions

**1. ElevenLabs `/v1/text-to-speech/{voice_id}/with-timestamps`.** The response carries
`audio_base64`, `alignment` and `normalized_alignment`. Each alignment is three parallel
arrays — `characters`, `character_start_times_seconds`, `character_end_times_seconds` —
so the timing granularity is **per character, in seconds**.

**2. Character timings are not a forced aligner, and ADR-0002's rejection does not reach
them.** This is the load-bearing decision, because the surface reading of the switch is
that a document which rejected alignment has adopted it.

ADR-0002 rejected WhisperX and the Montreal Forced Aligner for being *probabilistic where
marks are exact*, and named the resulting class of bug precisely: "a boundary off by a
syllable — that has to be *debugged*". That failure comes from matching an audio signal
against a text after the fact, and inferring where in the waveform each word must have
been. Nothing of the sort happens here. `with-timestamps` returns the synthesiser's own
account of what it just spoke: the model emitted those characters, at those times, and is
reporting rather than inferring. Exactness was the property ADR-0002 bought with marks,
and it is still bought — by a different mechanism, at a finer grain.

ElevenLabs also publishes a separate **Forced Alignment** API, which takes existing audio
plus a transcript and returns a time-aligned transcript. That is precisely the thing
ADR-0002 rejected, and it stays rejected, for ADR-0002's reasons and not for new ones.

**3. n+1 boundaries, derived from character start-offsets only.** ADR-0002's n+1 structure
is kept exactly; only the source of the boundaries changes. A beat carries its text
verbatim and the script is the ordered concatenation of beat texts, so the first character
of each beat is at a known offset into the synthesised string, and there are n+1 such
offsets counting the end.

The boundary of beat *i* is `character_start_times_seconds[offset(i)]`. Beat *i*'s
`toMs` **is** beat *i+1*'s `fromMs`, by construction. The tail — the last beat's `toMs` —
is the only value read from `character_end_times_seconds`, taken from the final character.

The naive derivation is wrong and worth stating so nobody rediscovers it. Reading each
beat's `toMs` from the end time of *its own* last character leaves the inter-beat silence
owned by nobody: the last character of "a decade." ends before the first character of
"London" begins, so every take would report a gap and `checkTimings` would reject it. The
silence between two beats belongs to the beat before it. Start-offsets give that for free;
end-times do not.

This preserves the invariant `checkTimings` already enforces, so **no code written in
`0c6eca9` changes**. What changes is that amendment's justification: n beats from n+1
marks becomes n beats from n+1 character offsets. The invariant is the same invariant, and
it is still an invariant rather than a policy — a take built the way this document
describes cannot have a gap, and one that does was not built this way.

**4. `alignment`, never `normalized_alignment`.** Text normalisation rewrites the
character sequence — "2026" spoken as "twenty twenty-six", "£1,200" as "twelve hundred
pounds" — and `normalized_alignment` is indexed against the rewritten string. Beat
boundaries are offsets into the text the *agent wrote*, so indexing them against the
normalised array shifts every boundary in any script containing a number, silently.

This is the same class of failure as ADR-0002's seconds-versus-milliseconds warning, and
earns the same treatment: written down before it is met. `packages/voice` reads
`alignment` and never `normalized_alignment`.

A difference in length between the two is **not** a usable signal that something normalised
— see the amendment below, where it was measured firing on prose containing nothing to
normalise. The assertion that does hold is against the input: `alignment.characters` must
have exactly as many entries as the script has UTF-16 units, and joining them must
reproduce the script.

**5. The slice speaks English.** This was never decided, and the absence has been read as
a decision in both directions: §12 of the frozen document writes its example beats in
French, while every fixture in the repository is English. §12's Frenchness carries no
weight — the entire frozen document is French, so its example text says nothing about the
product. The fixtures are therefore not a deviation, and English costs nothing to adopt:
no fixture changes, and `checkTimings`' text-equality gate stays valid.

It is recorded here rather than left implicit because the next reader of §12 will draw the
same inference, and because the language decides the voice, the model, and which reference
films the premium verdict can even be compared against.

**6. What ADR-0002 keeps, and what this ADR depends on.** Three of its decisions are
load-bearing here and are unchanged:

- **Timings are converted at the edge of `packages/voice`.** ElevenLabs reports seconds,
  as Google did; the conversion to `fromMs`/`toMs` happens once, and nothing downstream
  sees seconds. ADR-0002's warning about the silent absurdity of the failure — every event
  within a frame of zero, a video that looks like it has no animation — applies verbatim.
- **A beat carries its voice-over text verbatim.** Decision 3 is only possible because of
  it: a beat boundary is a position in a string this agent owns.
- **`VoiceTake = { beats: TimedBeat[]; audio: AssetRef }`.** `audio_base64` is the same
  obligation `audioContent` was — the compiled document's `audio.voiceover` has nothing to
  point at if the audio is dropped.

**7. The contract is tested against real output before the package is built.** One script,
one call, the response folded by hand into a `TimedBeat[]` and put through `checkTimings`.
`compile/timings.ts` was written against a mechanism that no longer exists; whether it
survives real data is a fact, it is half a day, and it is worth knowing while this document
is still being written rather than in the last week of August.

## Considered options

**Google Cloud TTS `v1beta1` with SSML marks**, as ADR-0002 decided. Not rejected on the
merits — marks at beat boundaries remain an exact and slightly simpler mechanism than
character offsets, because the boundaries arrive already computed. It is rejected on cost
of first contact, above, and that is a deadline judgement rather than an architectural one.
Should the deadline stop being the binding constraint, the mechanism is a candidate again:
decision 3 is the only thing that would change, and it is one function.

**ElevenLabs Forced Alignment.** Rejected, as ADR-0002 rejected aligners, and for its
reasons. It would additionally require synthesising first and aligning second — two calls
where one carries the timings already.

**The WebSocket streaming endpoint**, which reports word-level timestamps as audio
arrives. Rejected: it buys latency, and nothing in this pipeline is interactive. The batch
endpoint is one call, one response, and one fold, against a stream that would have to be
accumulated and reassembled before the first boundary could be computed.

## Deviations from the frozen document

§7.2's "TTS + alignement forcé" was already recorded as becoming "TTS + timepoints"; that
entry in `docs/proposals/architecture-evolutions.md` is updated in the same change to name
the provider it actually is. The PRD's Audio section — "Google/Gemini TTS ou
infrastructure Google appropriée retenue pour la V1" — is updated in the same change, as
ADR-0002 updated §41, §17.3 and §47 when it superseded the separate-`Script` model.

## Consequences

- **No compiler code changes.** `compile/timings.ts` and `INVALID_TIMING_INPUT` stand as
  written. Only ADR-0002's amendment text needs its justification restated, and it is
  restated here rather than edited there.
- **Open question 1 gets cheaper, not harder.** ADR-0002 left arithmetic anchor snapping
  open and observed that word timings would cost "one more mark". Character timings give
  word onsets for free — scan `characters` for word boundaries — so the snapping rule, if
  adopted, needs no change to the synthesis call at all. It stays open, and becomes
  answerable the moment the spike lands.
- **`packages/voice` needs an `ELEVENLABS_API_KEY` and no Google Cloud account.**
  ADR-0002's guarantee is unchanged and slightly strengthened: nothing in CI or in a
  contributor's checkout requires a cloud account to run the tests, and the credential that
  does exist is a single environment variable.
- **The model is not chosen here.** Which models expose `alignment`, and whether the most
  expressive one does, is a fact nobody in this repository has yet checked. It is the first
  question of the spike, and if the answer is "only the older models" it is a
  quality-versus-timing trade to be made knowingly rather than discovered.
- **Character offsets assume UTF-16 code units line up with the `characters` array.**
  English stays in the BMP so the assumption holds trivially, but it is an assumption, and
  it is the kind that survives until the first accented or emoji character reaches a
  script. Assert it rather than trust it: the length of `characters` should equal the
  length of the string that was sent.
- **The PRD's Visual assets line — "Google image-generation capabilities lorsque
  nécessaire" — is now also out of date**, for a different reason and by a different
  decision. It is left alone here deliberately; it belongs with whatever documents the
  asset generation loop.

## Amendments

**2026-08-12 — decision 7 reporting back.** The spike was run the same day this document
was written. Everything below is measured against the live API rather than argued, and it
closes two of the consequences above and corrects one sentence of decision 4.

**Decision 3 is validated end to end.** Both fixture beats were synthesised as a single
script — `"Rents have climbed for a decade."`, a space, `"London is the extreme case."`,
60 UTF-16 units — and folded into a `TimedBeat[]` by the rule above. Put through the real
`checkTimings`: **zero errors**. The same alignment folded the naive way, each beat ending
at the end of its own last character, fails with exactly the error this document predicted:
*"Beat b2 starts at 2240ms where b1 ended at 2160ms."* The inter-beat silence is **80ms** —
2.4 frames at 30fps, a black flash of two or three frames between two scenes, on a
two-sentence script. The hazard is not theoretical and the interval is not small.

**The script is beat texts joined by a separator, and the separator has to be in the
arithmetic.** ADR-0002 says the script is "the ordered concatenation of beat texts", which
taken literally would have the voice read "a decade.London". A single space between beats
is what was synthesised, so `offset(i)` advances by `text.length + separator.length` and
the separator's own time falls inside the preceding beat's window — which is correct, and
is the reason the derived beats are contiguous rather than merely close. `packages/voice`
owns the separator, and it must be the same string used to build the request and to compute
the offsets. Two sources for it would be rule 1's violation in miniature.

**`eleven_v3` returns full character alignment**, which closes the open consequence above.
There is no quality-versus-timing trade to make: the most expressive model is also the one
with timings. Its 5 000-character ceiling is what distinguishes it from
`eleven_multilingual_v2`'s 10 000, and that is a *video length* constraint rather than a
timing one — which is worth its own line, below.

**The UTF-16 assumption holds and is now asserted rather than trusted.** 32 characters in,
32 entries out; 60 in, 60 out; joining the array reproduced the input exactly, in both
runs.

**Decision 4's suggested guard was wrong, and the measurement is the reason.**
`eleven_multilingual_v2` returned **34** entries in `normalized_alignment` against 32 in
`alignment` — for a sentence containing no number, abbreviation or symbol. `eleven_v3`
returned 32 and 32 for the same input. So a length difference between the two arrays is
ordinary, varies by model, and would have been a false alarm on the first call. The
decision to read only `alignment` is strengthened by this; the assertion built on top of it
is removed, and replaced with the one that held.

**A video is capped by one synthesis request.** Because boundaries are offsets into a
single alignment array, two responses cannot be stitched — their offsets have no common
origin. The whole script therefore goes in one call, and `maximum_text_length_per_request`
becomes a ceiling on narration length: roughly 5 000 characters under `eleven_v3`, 10 000
under `eleven_multilingual_v2`. Nothing near the 30-second slice, and a real constraint on
the product. Whether long videos are synthesised per section, with each section's alignment
independent, is a question for whoever first needs one.

**2026-08-13 — decision 7 reporting back a second time: synthesis is not reproducible, and
that decides how this package is built.** The amendment above measured whether the
*contract* survived real output. It never asked whether two calls agree, and every plan
made since has quietly assumed they do.

They do not. The four beats of the shipped slice went out as one 304-character script,
twice, same model, same voice, no seed:

| | first differing character | worst beat boundary | audio |
|---|---|---|---|
| no seed | index 1, 53ms vs 67ms | **213ms** (6.4 frames at 30fps) | different bytes, different length |
| `seed: 7` | none | 0ms | different bytes, same length |
| `seed: 42` | index 174, mid-script | 80ms, at the tail | different bytes, different length |

So a seed pins the synthesiser much closer and **not** all the way. The seeded pairs are the
more useful measurement, because they show the failure is not a coarse one to be rounded
away: under a fixed seed the arrays still diverge in the middle of the script and
re-converge, and the seed-42 pair agreed on every internal boundary only because the beat
offsets happened to fall outside the region that moved. Nothing guarantees the next script
is so lucky. The times are on a 1ms grid, so there is no quantum to snap to either; 80ms
recurs in this data as a coincidence, not as a unit.

**What follows is the whole design of `packages/voice`.** A take is something you
**record**, deliberately, and commit — not something a build step regenerates. Three
artifacts come out of *one* response and only mean anything together: the `TimedBeat[]` the
compiler reads, the mp3 those timings describe, and the alignment the fold is tested
against. `scripts/record-take.mts` writes all three in one pass for exactly that reason;
assembled from two takes they would look perfectly well-formed and cut every picture
against words the audio does not say, failing nothing anywhere.

It also fixes where the testable seam goes. Nothing in the suite calls the API: a test that
did could assert almost nothing, would spend quota on every run, and would need the
credential this ADR's consequences promise no contributor needs. `foldAlignment` is a pure
function of a recording and carries every property this package promises; `synthesise` is
the thin impure shell around it. The fold test asserts that the shipped beats *are* the
fold of the shipped alignment, so a beats file and an mp3 from different takes cannot both
pass — the one failure that is otherwise undetectable, since the numbers look correct and
the frames are identical.

**Open question 1 is now cheap and worth taking.** Character timings give word onsets for
free, as this document predicted, and the first thing that fell out of having them was a
defect in the shipped plan that no test could previously see: `highlightBar` on London
fires at frame 310, which is the exact frame the narrator begins the word **"Berlin"**, and
`revealAll` lands 2.2 seconds after "London" was spoken. That is §12's *"les événements
tombent sur les mots attendus"* failing, and it is the class of bug §12 named when it made
a real take an imperative constraint. Whether the repair is arithmetic snapping, a different
anchor, or an editorial rewrite of the beats is not decided here.

**A recording ages against its plan.** `checkTimings` already refuses a take whose beat text
no longer matches the plan, which is the protection that matters, and it is now the *only*
one: edit a word and the correct response is to re-record, which moves every boundary in
the video and not only the edited beat's. That is the true cost of this mechanism and it is
worth stating plainly. It argues for recording late rather than often.
