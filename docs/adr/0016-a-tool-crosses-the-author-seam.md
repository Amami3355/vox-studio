# ADR-0016 — A tool crosses the author seam, and nothing that locates anything does

**Status:** accepted · 2026-08-27
**Scope:** what the crew's `PlanAuthor` seam may carry, now that an author can be offered a
callable. It changes no production command, no envelope and no schema, and it says nothing
about the deployment seam ADR-0015 places at the crew's client.

## Context

`PlanAuthor` is the seam between the crew and whatever writes a plan — a live model, a
scripted stand-in, a plan handed in on the command line. Until the draft-review tool it carried
payloads only: `author(instructions, brief)` and `repair(instructions, brief, plan, refusal)`,
where every argument is data that could be serialised, printed into a bundle, or replayed.

That property was never written down as a decision. It was asserted by a test —
`test_an_author_is_handed_instructions_a_brief_and_the_tools_it_was_offered`, then named for
payloads alone — which checked that no parameter names a path, a root, a directory, a file or a
client. The test was the only record of the rule, and a test docstring is where a rule goes to
be discovered by whoever breaks it rather than by whoever is about to.

Offering the author `review` as a tool broke the literal form of that rule. A tool is a
callable. It cannot be serialised, it does not appear in a bundle as a value, and a reader of
the seam's signature can no longer assume that everything crossing it is inert data.

This is the kind of change ADR-0009 exists to make hard for the anchor grammar: a vocabulary
widening that looks local at the call site and is structural everywhere else. The crew seam had
no equivalent, so the widening happened in a commit and was recorded in a test.

## Decision

**The author seam carries payloads and tools. It carries nothing that locates anything.**

The invariant the original rule was protecting is not "everything is serialisable". It is that
**an author cannot tell where it is running and cannot reach the production sequence
sideways.** An author that knows a path knows it is on a filesystem, in a work root, beside
other Runs; an author holding a client can issue commands the crew never authorised and the
bundle never sees. Neither is true of a tool that reads a draft and answers with findings.

So the rule is restated in the terms it always meant:

1. **No parameter may name or annotate a path, a root, a directory, a file or a client.** This
   is unchanged, still asserted, and is the whole of what the seam refuses.
2. **A tool crossing the seam must be offered, never required.** `check` is keyword-only with a
   default of `None`, so an implementation written before tools existed is still a valid
   implementation of the seam. `HandedPlanAuthor` needs no opinion about tools.
3. **A tool must be reachable to a keyless machine.** `AdkPlanAuthor.agent` builds the agent
   without running it, so a machine with no model credential can assert the tool is bound. A
   seam only exercisable with a key is one that is never exercised.
4. **A tool's docstring is prompt text and is held to the leak scan.** The framework builds the
   declaration a model sees from the function's name, signature and docstring. That text
   reaches a model without passing through `instructions`, which is exactly the shape of a leak
   nothing scans, so a test scans it directly.
5. **An author holding a tool must not cost a scripted Run anything.** The preamble names the
   tool only for an author that holds one, so a scripted prefix stays byte-identical — 124,690
   characters, unchanged across this change, which is what keeps measurements taken before the
   tool comparable with measurements taken after.

### Considered and rejected

**Keep the seam payload-only and reach the tool another way.** The candidates were a module
global the tool reads, or a subclass hook that binds it out of band. Both put the capability
somewhere the seam does not describe, which means the interface stops being an honest account
of what an author is given — and rule 1's objection to a second source of truth applies to
interfaces as much as to schemas. Offering a tool *is* the whole of what binding one means; an
interface that could not express it would be an interface the capability had to go around.

**Serialise the tool as a description and let the author ask for it by name.** This preserves
the letter of the payload rule and buys nothing: something on the crew's side would still have
to hold the callable and dispatch to it, so the callable exists either way and is merely
hidden from the signature.

**Leave it recorded in the test.** Rejected on the evidence that it did not work. The widening
was reviewed twice — once by a reader who had to reconstruct the rule from the test to judge
it, and once by a reviewer who correctly flagged that a test docstring is the wrong home. A
rule that has to be reconstructed is a rule that will be broken by someone who never found it.

## Consequences

- **`check` is part of the seam and appears in its signature.** Adding a second tool later
  widens nothing further: it is the same category of argument, already decided.
- **The payload rule keeps its teeth where they matter.** The seam guard still fails on a
  parameter that names a path, a root, a directory, a file or a client, and that assertion is
  the one that stops an author learning where it runs.
- **A tool that needed a path would be refused by this ADR, not waved through by it.** The
  decision widens the seam to callables; it does not widen what a callable may take. A future
  tool wanting a work root is the same violation it always was, wearing a function.
- **This says nothing about what a tool may *do*.** `review` stays advisory because the
  compiler is the only authority on a plan, and that is a decision about authority rather than
  about the seam. A tool that made a plan acceptable would need its own ADR.
