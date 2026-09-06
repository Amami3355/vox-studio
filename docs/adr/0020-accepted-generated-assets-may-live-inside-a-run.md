# ADR-0020 — Accepted generated assets may live inside a Run

**Status:** accepted · 2026-09-06
**Extends:** ADR-0005; its deterministic prompt, identity, human-acceptance, warning-worklist, and
no-generation-during-render decisions remain binding.

## Context

ADR-0005 made a committed repository asset the only accepted generated asset so that a clone could
reproduce the same frames offline. The production crew needs to prove an accepted generated image
inside one resumable Run before an operator decides whether it belongs in the canonical library.
Forcing a repository commit into that workflow would either grant the crew repository authority or
make the live tracer bullet stop before the generated image can appear in its preview.

## Decision

Production may store a generated candidate inside one Run and return only candidate metadata, an
opaque artifact handle, and a digest. Candidate, rejected, and failed states are not `AssetRef`
states. An operator acceptance binds the exact candidate digest and promotes that Run's binding to
`AssetRef.ready`; pending or rejected candidates leave the honest placeholder, and a terminal
generation or verification error becomes `failed`.

A Run-specific accepted asset is reproducible through the Run's Production-owned bytes, checkpoint,
ledger receipts, evidence bundle, and verified digest. It is not reproducible from a fresh clone and
must not be described as a canonical library asset. Promotion to that library remains a separate
human action that commits a reviewed file. Generation never occurs during Remotion rendering.

Identity remains first: one `identityKey` produces at most one active job and one accepted digest
per project. Starting and observing a generation job are distinct published operations so recovery
can resume by job identifier without repeating spend. Image-generation receipts remain separate
from recording receipts.

## Consequences

The Production interface needs payload-shaped operations to start, observe, accept, and retrieve a
generated candidate without publishing a storage location. The resolver continues to return a
placeholder immediately and uses compiler `ASSET_PLACEHOLDER` findings as its only worklist. No
automatic canonical-library promotion is authorised by this decision.

