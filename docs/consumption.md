# Film consumption

Each film exposes consumption below its production controls, including during production and
after delivery. Expand **Production consumption** for operation counts, token measurements by
model and role, and a downloadable JSON report. The existing workspace polling refreshes this
view when production saves a checkpoint. A pending call can therefore appear only at the next
checkpoint; this is not a live provider billing feed.

## Measurement and pricing

The durable provider journal and Production recording ledger are the sources. Each dispatch counts once; repairs are new dispatches,
while cached steps and refreshing the browser add nothing. Disjoint image journals are aggregated
with the coordinator journal, including previous correction branches. Reported failures and
unanswered calls remain visible. An operation count is an attempt, not proof of a billable success.

Gemini measurements come from response `usage_metadata`: input, cached input, candidate output,
reasoning, tool input and total tokens. Cached input is a subset of input. Reasoning is separate
from candidate output. We retain counts only, never the model's reasoning content. Unknown
measurements stay null; the report states how many calls have token totals and pricing.

The partial USD estimate uses standard global Google Cloud list prices checked on September 9,
2026. Supported exact model IDs are `gemini-3.6-flash` and `gemini-3.5-flash`. A versioned tariff
is saved with each dispatch, in integer nano-USD per token; refreshing or changing future rates
cannot reprice that dispatch. Cached input is charged at the cache rate; output includes reasoning.
Rates expire January 1, 2027, so future calls remain unpriced until the table is reverified.

Regional endpoints, other models, explicit provisioned-throughput responses and calls with tool
input requiring separate tariff treatment remain unpriced.
Parallel search fees, hosting/rendering, cache storage, taxes and credits are excluded. The subtotal
is labelled partial even if all measured model calls have a price. It must not be presented as the
film's final cost or an invoice. The report includes coverage and the pricing reference.

The implementation deliberately reuses the journal instead of adding a second analytics service
or estimating token use from text length. SDK metadata is the per-request observation; a future
complete billing integration should reconcile provider invoices separately.
Existing authorization and consumption limits are unchanged.

## Image generation

The Production image adapter captures a tariff before dispatch and normalizes the provider's
`usageMetadata`. The signed ImageJob retains an optional `consumption` receipt for both valid
candidates and completed invalid responses that include usage. It contains the actual model,
endpoint, token counts, estimated nano-USD and pricing version. Credentials, prompts, images and
reasoning content are excluded. Old jobs without this optional field remain valid.

For `gemini-3-pro-image` on the global Google Cloud endpoint, input/cache/text-output prices per
million tokens are $2/$0.20/$12 for input up to 200,000 tokens, and $4/$0.40/$18 above that threshold.
Image output costs $120 per million tokens. A 2K output is documented as 1,120 tokens, or $0.1344,
before its input, text and reasoning costs. We use the actual complete modality breakdown rather
than multiplying image attempts by a fixed price. Text and image output have separate columns.
Missing or inconsistent modality measurements, unknown tariffs and unanswered operations remain
unpriced, with coverage shown explicitly. API-key Gemini requests are not priced with Cloud rates.

The worker copies this verified receipt into the existing dispatch journal; an observed completion
after transport loss preserves the same measurement. Reusing an existing job adds no second price.
Rejected illustrations and their new correction candidates each retain their own consumption.
The Studio shows an image subtotal and includes it in the overall partial generation estimate
and JSON export. HTTP errors with no usage are not guessed to be billable or free.

Deploy the updated Production service and regenerated contracts with the worker/API/frontend to
enable new image measurements. Historical image jobs without measurements cannot acquire a price
from their saved PNG alone; publishing their old journals does not invent those missing receipts.

## ElevenLabs narration

The timestamped speech adapter reads `character-cost` and `request-id` from HTTP response
headers. Production durably stores a normalized receipt on the recording attempt in its private
authenticated ledger **before reading the response body**. Audio decoding, alignment validation,
publication failures and HTTP errors therefore retain any received measurement. A connection lost
before headers provides no measurement; an absent, blank, invalid or unsafe integer header remains
unknown. An explicit zero is a measured zero. Text length and audio duration are never substitutes.

The receipt records the configured model, provider character cost, request ID, estimated nano-USD
and tariff version. It does not alter the Take or its audio/alignment identity. `run.status` exposes
an optional `recordingConsumption` list of all attempts and receipts, including failed recordings
and replacements. Older ledgers without receipts and older status responses remain valid.

The worker saves this status in its existing production snapshot, including after observing a lost
record command response. The public consumption projection replaces the journal's Recording rows
with these authoritative attempts; it never sums successive snapshots. Reusing a Take, recovering
a saved response, refreshing the page and replaying a cached workflow add no second expense.
Separate replacement dispatches each count, even when they produce identical audio. The public
report exports only aggregated measurements and tariff versions, not attempt IDs or request IDs.

`character-cost` is documented as the generation cost in characters, not USD or a token count.
For exact model IDs `eleven_v3` and `eleven_multilingual_v2`, the estimate uses the public API rate
checked September 9, 2026: $0.10 per 1,000 reported characters. The tariff is captured before
dispatch and expires January 1, 2027; saved receipts are never repriced. Other models, including
Flash/Turbo, retain their characters but remain unpriced until their header-to-tariff conversion
has been verified. This is a public list-price estimate, not the account's subscription charge,
negotiated price or invoice; promotions, credits and taxes are not applied.

The Studio displays an ElevenLabs subtotal in the overall partial estimate, the measured character
count and recording coverage, model details and the pricing link. These values are included in the
JSON export and refresh with checkpoints. No paid API call was made to validate header availability
on this endpoint; the implementation and tests explicitly cover missing headers.

Deploy Production with regenerated contracts and the updated worker/API/Studio to enable capture
and display. Historical audio alone cannot recover missing measurements. No synthesis is dispatched
to populate consumption, and no deployment is implied by this change.

## Existing films

Old checkpoints keep their operation counts. Existing journal token measurements can be published
without resuming a film. Stop the worker supervisor, then run in the worker environment:

```sh
python -m vox_crew.studio_worker consumption --state /persistent/studio --crew-state /var/lib/vox-crew --job <submission-id>
```

Use the actual mounted paths for that installation. The command holds both executor locks,
checks that the coordinator and image journals belong to the same submission and Run, and writes
only the allowlisted `consumption.json` Studio projection. It sends no provider or Production
request, changes no status, and rewrites neither checkpoints nor journals. Restart the supervisor
afterwards. Historical calls without a captured tariff remain unpriced; historical missing cache
counts remain unavailable. Imported films without matching original journals retain their counts.

New checkpoints carry their own consumption projection and take precedence over a historical
sidecar. The API and downloaded report expose only counters, model/role names and rate metadata,
not provider answers, requests, credentials or journal contents.

## Sources

- [Google Gen AI Python SDK usage metadata](https://github.com/googleapis/python-genai/blob/main/google/genai/types.py),
  retrieved through Context7 using `find-docs` on September 9, 2026.
- [Google Gen AI JavaScript usage metadata](https://googleapis.github.io/js-genai/release_docs/classes/types.GenerateContentResponseUsageMetadata.html),
  retrieved through Context7 on September 9, 2026, including `candidatesTokensDetails` by modality.
- [Google Cloud model pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing),
  verified September 9, 2026: global standard input/cache/output per million tokens are
  $0.75/$0.075/$3.75 for Gemini 3.6 Flash through December 31, 2026, and $1.50/$0.15/$9 for Gemini 3.5 Flash.
- [ElevenLabs generation metadata](https://elevenlabs.io/docs/api-reference/introduction#tracking-generation-costs)
  and [timestamped speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps),
  retrieved through Context7 using `find-docs` on September 9, 2026.
- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api), verified September 9, 2026.
