# Crew run helios-bay-catalog-showcase-proof-1 evidence

- Run: helios-bay-catalog-showcase-proof-1
- Brief: helios-bay-catalog-showcase-proof-v1
- Outcome: rendered
- Machine verdict: pass
- Plan versions authored: 1 (0 withheld)
- Synthesis dispatches: 1
- Context: 1 model ask over 3 model calls, 393,965 characters (~131,322 tokens) put in front of a model, of which 256,906 is the teaching surface re-sent unchanged and eligible for a provider cache the crew does not measure

## Explicit non-claims

- Isolation is not evidenced. The crew process is not sandboxed in this phase, so code-blindness is convention here and not enforcement.
- The media families are not evidenced. Nothing here inspects the preview's streams; the preview is carried by descriptor and judged elsewhere.
- The scenario families are not evaluated. A scenario is the harness's concept and the crew holds a Brief, so scoring one here would be the crew judging itself against a sheet it cannot read.
- There is no human verdict. A crew bundle is machine evidence and the watch-and-listen verdict is a person's, recorded where the proofs record it.
- Prefix caching is not evidenced. Every turn was authored against one identical prefix, which is what a provider needs in order to serve it from a cache — but no provider has told this crew that one did, so `context.cacheableChars` is an eligibility and never a saving, and `context.cacheServed` is null rather than false.
