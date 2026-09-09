# Studio admission is durable and separate from Production authority

The first Studio uses the private workspace selected by the user on September 8, 2026.
A Studio submission is committed before its HTTP response and owns an idempotency key;
the corresponding Brief uses `studio-<submission-id>`. SQLite on the crew's persistent local
volume stores admission, sessions and image decisions. The existing Production Run store stays
private and authoritative. A separately running worker executes queued work; browser refresh,
HTTP request duration and browser disconnection do not own execution.

An OS lock excludes other Studio workers and the existing hosted crew entry point. A unique
database constraint permits one queued/running/awaiting-image submission. A new worker can mark
interrupted work only after acquiring the locks, never based on an expired observation alone.
Generic operator recovery may requeue a nonterminal checkpoint only with no pending action or unanswered provider
dispatch, unchanged ceilings, unchanged original request and language, unexpired authorization,
and a matching fresh signed Production snapshot. It preserves every checkpoint and counter.
An interrupted render with unknown completion remains paused for diagnosed reconciliation.

The separate operator tool `deploy/studio/reconcile_render.py` can adopt a completed render
after a worker crash, only from an interrupted, nonterminal Studio submission. It requires
the exact pending render identity, unchanged original authorization/ceilings, no unanswered
provider call, and fresh signed Production status showing rendered output with every other
input artifact and status field unchanged. It verifies the preview digest and fully decodes
audio/video, then rechecks signed status before archiving the checkpoint and journal bytes.
Explicit application records a status-derived completion and requeues film review; it sends
no render command and grants no audiovisual acceptance. Generic reconciliation still refuses
pending actions. Terminal blocks, uncertain provider outcomes and changed inputs remain refused.
If interruption occurs after checkpoint adoption but before queueing, generic reconciliation
can verify that completed checkpoint; no allowance is reset.

September 8 amendment: the user chooses Production limits in the Studio. This supersedes the
initial operator-only budget admission decision. Saving a Brief with selected limits authorizes
the trusted worker to start within those totals; a historical saved Brief can receive that
decision through its start control. Saving the HTTP request never calls a provider. Provider
configuration, signing keys, ledger ownership and image acceptance remain separate authorities.

The worker initializes the same request-bound Production Run before paid preparation and signs
its user decision with a dedicated Studio authorization key. `run.authorize` verifies that
signature, the original request and Run identities, expiry and the preceding decision. It records
the authorization in the existing authenticated receipt chain. Extensions preserve all totals,
image jobs, consumed grants, recording dispatches and earlier receipts. Production enforces image
and Take ceilings; the persistent worker journal enforces total calls and searches. Technical
upper bounds are published from one Production schema, which also generates the Studio validator.
The former 40 calls / 4 searches / 5 images / 1 Take values are initial defaults, not fixed
operator-owned product choices. Raising a Take ceiling does not request a replacement recording.

A user correction binds an idempotency key, the exact reviewed checkpoint and, for an image,
the latest rejected candidate digest. Its instruction and new totals commit together in SQLite
before acknowledgment and queue under the same exclusive-worker rules. Before application the
worker verifies the provider journal and fresh signed Production state, archives the exact
checkpoint and journal bytes, installs the signed extension, and records the previous terminal
in correction history. It then resumes the corresponding preparation, image or visual correction
stage. Narration and unaffected accepted images survive; changing recorded speech still requires
a separate recording workflow. Unknown Production actions or provider outcomes cannot be
cleared through this control. A known refused dispatch or a completed model-contract failure is
distinguished from an uncertain side effect; its archived evidence remains available.

A lost authorization response is reconciled against the exact signed decision without provider
dispatch. A crash between checkpoint adoption and database acknowledgment completes that same
decision. Pending decisions can be retried but cannot be silently superseded. Browser refresh
retains a submitted correction's payload/key; replay acknowledges the same decision. Model and
human image reviews and final audiovisual acceptance are never implied by a correction or budget.

New Studio image intentions assign renderer elements only through references to actual scene
properties or events. The bitmap request excludes those resolved renderer values and includes
the user's image correction verbatim. Full observations and the correction also reach the image
creator and reviewer. Existing request bytes remain available for historical reconciliation.

This adds an explicit Studio image-review mode to ADR-0024, fixed at checkpoint creation.
The model first reviews candidate bytes; only candidates it accepts reach human approval.
An image decision names the exact digest, persists before acknowledgment, and is immutable.
Human rejection returns to the existing bounded correction loop without changing the Take.
Human acceptance cannot bypass a model rejection or the final audiovisual review. Existing
autonomous checkpoints keep their original mode and cannot acquire a human-review mode on resume.

Only explicit public projections reach the browser: phases, cited sources, narration, image
decisions and media handles. Media is cached only after descriptor verification, served under
workspace authentication with byte ranges, and rechecked before delivery. A ready film requires
its final reviewed digest and audio/video decoding; imported historical work is labelled recorded.
The application cookie is HttpOnly and SameSite Strict; hosted access requires HTTPS, and
mutations require the configured Origin plus the Studio header. The frontend never receives
provider or signing credentials. Deployment and full live browser-to-film evidence remain separate
gates from this implementation decision.

The hosted API and static frontend run on the existing crew VM with their own persistent
Studio directory and access-code environment, separate from the worker's provider environment.
A stateless Cloud Run reverse proxy provides the HTTPS entry point. Its dedicated VPC subnet
may reach only the Studio API port on that VM under the ingress rule; the proxy service identity
receives no application IAM roles or secrets. SQLite and paid execution never move onto Cloud
Run's ephemeral filesystem. Google-managed HTTPS reaches the private workspace's own login;
all job and media routes still require its cookie. Production's existing SSH-only access and
signed bridge remain unchanged.

## September 9 amendment: unlimited Studio production

The user explicitly removed every Studio spending ceiling, including those of existing films,
and selected automatic media review and correction. This supersedes the September 8 limits
and mandatory human image approval described above. Creating a film authorizes its production;
existing blocked films wait for an explicit Resume action. No deployment automatically resumes them.

Signed limits and expiry can be null, meaning unlimited rather than a larger numeric allowance.
Historical requests, finite authorizations, receipts and consumption remain intact. On a trusted
worker continuation, the same Run receives an unlimited signed successor before new provider work.
Decision IDs belong to authorization history, not image-intention work identity: an identical
correction reuses its saved preparation, including preparations written by the previous version.

Corrections continue when a concrete different change can improve the result. A progress review
asks the user when attempts repeat without improvement, critiques conflict or an editorial choice
is needed. Identical rejected image instructions and cyclic technical plans also stop without
new dispatch. This is a convergence decision, never an attempt allowance. Received temporary
provider failures retry with progressive visible delays; permanent errors suspend. Unknown
image results are observed through the existing job before considering another dispatch; an
unverifiable result remains suspended. Provider limits and timeouts remain provider constraints.

A durable stop request prevents the next operation and retains the current result. A generated
candidate can be saved before verification and resumes at that verification. Progress distinguishes
preparation, generation and review; saved instructions are not presented as generated images.
The final reviewed and decoded film becomes watchable and downloadable automatically. Human
appreciation and further visual corrections remain available; publication is an explicit action.
