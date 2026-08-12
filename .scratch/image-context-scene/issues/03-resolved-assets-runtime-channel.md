# 03 — Resolved assets as a runtime channel

Status: ready-for-agent

The resolved `AssetRef` must reach the component without becoming an authored prop and
without appearing in the generated manifest. Capabilities that need no assets keep the
same generic runtime path.

Covers spec user stories 27 and 32–34.

Done when `props` is provably untouched by resolution and the manifest publishes no
asset location.

## Comments

**Delivered** in `d34af39` as `SceneProps.assets`.

**This deviates from frozen §5.2**, which has the resolver rewrite the plan so the
`AssetRef` travels inside it. The deviation was reasoned but never recorded, which
ADR-0001 requires. Now written up in `docs/proposals/architecture-evolutions.md` under
"Resolved assets travel beside the plan, not inside it".

**Simplified after review.** `SceneRenderer` used to take the whole plan-level
`ResolvedAssets` map plus a `sceneId` prop only to index it, while its one caller already
knew the id. It now takes the scene's own `ResolvedSceneAssets`, and `resolveSceneAssets`
returns that shape directly. The plan-level map is the compiler's to build when the
compiler exists, so the unused type went with it.
