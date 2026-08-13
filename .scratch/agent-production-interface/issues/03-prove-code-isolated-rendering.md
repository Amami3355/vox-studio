# Prove code-isolated rendering

Type: prototype
Status: open
Blocked by: none

## Question

Which candidate boundary can validate, compile and render a current `VideoPlan` while keeping
the agent code-blind? Unless the map's third cut-line item has been invoked, compare both:

1. a local opaque runtime artifact placed in the agent's environment;
2. a thin local CLI invoking a production process outside the readable environment.

Report what each boundary exposes, leaks and requires. These are not two packagings of one
design: the second moves `compile` and `render` off the agent's machine, which is a different
trust model, failure surface and artifact-ownership story.

If the third cut-line item has been invoked, test the most credible candidate first. A green
result resolves the prototype without testing the other; a leak or failure requires testing
the second before the result may be red.

Build only enough to make the boundary decision concrete. Do not turn the prototype into
production packaging.

## Pass / fail

**Green** — at least one candidate renders a current `VideoPlan` with none of the following
reachable from the agent's environment: readable internal implementations, TypeScript,
sourcemaps, repository paths, retained internal comments or documentation.

**Red** — neither candidate satisfies those conditions within the permitted environment.

Isolation must be **actively falsified**, not inferred from packaging settings: search the
built artifacts for known leak markers — a JSDoc sentence known to exist in
`packages/video/src/compile/index.ts`, a `packages/video/src` path fragment, a `.map`
reference, or a distinctive internal implementation identifier. Public identifiers are
expected. An internal identifier is a signal to inspect, not an automatic failure; the green
condition fails only when an implementation is readable from the agent's environment.

**On red, code-blindness is not weakened.** It is the defining property of the destination and
the map's *Never cut* list holds it. The destination is redrawn explicitly by the user; the
prototype's author may not silently redefine "without code access".
