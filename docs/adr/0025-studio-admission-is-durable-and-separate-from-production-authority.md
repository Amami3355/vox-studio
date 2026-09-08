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
Recovery may requeue a nonterminal checkpoint only with no pending action or unanswered provider
dispatch, unchanged ceilings, unchanged original request and language, unexpired authorization,
and a matching fresh signed Production snapshot. It preserves every checkpoint and counter.
An interrupted render with unknown completion remains paused for diagnosed reconciliation.

The API cannot supply or modify Production policy. A saved brief initially awaits operator
authorization. The operator prepares its exact request, installs the corresponding immutable
envelope in Production, and authorizes that request in Studio. No browser endpoint installs an
envelope, resets an allowance, or relaunches a blocked historical trial. The initial local
workspace has no newly authorized provider budget.

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
