# Vox Studio

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Adding or changing a capability

A scene capability is one folder under `packages/video/src/scenes/`, one line in
`src/scenes/registry.ts`, then `pnpm catalog`. Copy `src/scenes/_TemplateScene/`, which is a
compiling stub of that shape and is deliberately unregistered. See
`docs/adding-a-capability.md` — read it before touching a scene folder, and **update it in the
same change** whenever the shape moves: a file added to or dropped from every capability, a
step that stops being true, a gate that changes. `tests/template-scene.test.ts` holds the
doc's file table to the template folder, so that half fails loudly; the prose does not.
