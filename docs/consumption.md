# Film consumption

Each film exposes consumption below its production controls, including during production and
after delivery. Expand **Production consumption** for operation counts, token measurements by
model and role, and a downloadable JSON report. The existing workspace polling refreshes this
view when production saves a checkpoint. A pending call can therefore appear only at the next
checkpoint; this is not a live provider billing feed.

## Measurement and pricing

The durable provider journal is the source. Each dispatch counts once; repairs are new dispatches,
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
input requiring separate tariff treatment remain unpriced. Image generation, ElevenLabs narration,
Parallel search fees, hosting/rendering, cache storage, taxes and credits are excluded. The subtotal
is labelled partial even if all measured model calls have a price. It must not be presented as the
film's final cost or an invoice. The report includes coverage and the pricing reference.

The implementation deliberately reuses the journal instead of adding a second analytics service
or estimating token use from text length. SDK metadata is the per-request observation; a future
complete billing integration should add image/voice receipts at the Production boundary and
reconcile provider invoices separately. Existing authorization and consumption limits are unchanged.

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
- [Google Cloud model pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing),
  verified September 9, 2026: global standard input/cache/output per million tokens are
  $0.75/$0.075/$3.75 for Gemini 3.6 Flash through December 31, 2026, and $1.50/$0.15/$9 for Gemini 3.5 Flash.
- [ElevenLabs timestamped speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps):
  the current voice adapter retains audio/alignment; it does not yet persist provider billing receipts.
