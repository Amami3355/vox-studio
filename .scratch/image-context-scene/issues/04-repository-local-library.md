# 04 — The repository-controlled local library

Status: ready-for-agent

Spec: "Resolution checks an `identityKey` cache, then a repository-controlled local
library". `identityKey` is the thing this increment exists to demonstrate, and a
committed folder demonstrates it as well as a generator would.

Done when a clone resolves the canonical example to real committed media with no
credentials, no network and no test fixture.

## Comments

**Missed in `d34af39`, delivered in review.** The library was injectable only — a
caller-supplied array whose sole production caller passed nothing — so user story 22
("a local-library hit returns a `ready` AssetRef") was reachable from tests and nowhere
else.

`packages/video/src/assets/library.ts` is now the repository-controlled library, wired as
the default in `ExampleScene`. It answers `housing-city-context` with committed inline
media and carries the `verify` that decides what "verified" means for it.

**One judgement call worth knowing about.** The media is vector artwork, not a
photograph: an offline MIT repository cannot ship stock photography, and the increment
needs the *path* demonstrated rather than the picture finished. It is a deliberate
stand-in — the identity key is the contract, the bytes are not, and a licensed or
generated asset replaces it later without touching a single SceneInstance.
