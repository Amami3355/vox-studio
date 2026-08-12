# 02 — The minimal Asset Resolver

Status: ready-for-agent

Three paths and no fourth: identity cache, local library, placeholder fallback. Offline,
credential-free, deterministic. A miss is a placeholder, not an exception.

Covers spec user stories 22–27 and 35.

Done when resolution is a pure function of the requirement and the library, and repeated
requirements sharing an `identityKey` return the same reference.

## Comments

**Delivered** in `d34af39`. `packages/video/src/assets/resolver.ts`.

**Two defects found in review and fixed.**

1. *Resolution depended on call order.* The identity cache stored `placeholder` and
   `failed` results, so resolving a miss first pinned a placeholder under the key and a
   later requirement sharing that key was answered with it instead of its library hit —
   the same inputs producing different outputs. The fix is **identity first**: when a
   requirement carries an `identityKey`, that key alone selects the library entry and
   derives the pending id. Subject matching is now the keyless path only. Regression test:
   "resolves an identity to the same reference whichever requirement arrives first".
2. *A valid local asset could resolve to `failed`.* `verifyLocalAsset` was an optional
   callback, and its absence turned a well-formed `ready` entry into `failed` — an outcome
   the spec does not define. Entries and their verifier are now one `LocalAssetLibrary`
   value, so a caller cannot supply entries without a verifier, and "present but
   unverifiable" stops existing.
