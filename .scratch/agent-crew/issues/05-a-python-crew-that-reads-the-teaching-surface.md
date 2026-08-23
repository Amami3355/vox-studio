# 05: A Python crew that reads the teaching surface

**What to build:** A Python ADK project in the reserved agents area that, run headless
with one command against a bootstrapped workroot, asks the production interface for its
contract index and each published category, and prints the result envelopes verbatim.

This is the tracer bullet: the thinnest complete path from a crew process to the
production boundary and back. It establishes three things every later ticket depends on.

**The production client is the deployment seam (ADR-0015).** One interface, with a local
implementation that invokes the launcher as a subprocess. Its methods are payload-shaped
in both directions from this first commit: callers pass objects and name a Run by its id,
never a path, and artifacts are retrieved through a client method taking a Run id and an
envelope's artifact descriptor. The local implementation is the only module that knows
paths exist. A tool that accepts or returns a path is a defect against this ticket even
when it works.

**Envelopes pass through verbatim.** Outcomes, errors with their `means` and `repair`,
and the `next` suggestions reach the crew unmodified. The crew's own instructions must not
re-explain what a refusal already teaches.

**Contract projections arrive in the result envelope and are held in the crew's context.**
They are never written into the workroot, which is what keeps its "nothing but its run
directories" invariant true.

The project is self-contained: its own dependency file and test runner, not a member of
the TypeScript workspace, and the repository's existing checks stay untouched.

**Blocked by:** 04 (Bootstrap a crew workroot in one command)

**Status:** done

- [x] One command runs the crew headless against a bootstrapped workroot
- [x] The crew asks for the contract index and every published category, and prints each envelope verbatim
- [x] The production client is one interface whose methods take and return objects, never paths
- [x] Artifact retrieval is a client method taking a Run id and an artifact descriptor
- [x] No contract projection is written into the workroot
- [x] Tool tests run against recorded envelope fixtures, needing no service, key, quota or network
- [x] A network sentinel fails any test that attempts egress
- [x] The repository's existing TypeScript checks and test suites are unaffected
