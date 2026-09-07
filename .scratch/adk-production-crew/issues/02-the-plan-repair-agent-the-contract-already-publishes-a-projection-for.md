# 02: The Plan Repair Agent the contract already publishes a projection for

**What to build:** The third visual role. A refused plan reaches an agent that receives the
findings and the full specifications of exactly the implicated capabilities, repairs the refused
portion, and returns a plan that is validated again. A bounded number of times, after which the
Run stops or Declines. It never loops on its own spend.

## The gap

The spec asks for it twice, in the design and in the user stories:

> A **Plan Repair Agent**, reached only after a structured refusal, repairs the refused portion
> from the published checks and named SceneCapability specifications (spec.md:53)

> Plan repair is conditional and bounded … Exhausting the repair budget stops or Declines; it
> never triggers an unbounded loop. (spec.md:245-248)

Everything around it exists and nothing consumes it:

- The contract publishes the projection. `packages/production/src/contracts/generate.ts:111`
  emits `planRepair: { tiers: ['selection', 'authoring'], capabilitySelection: 'implicated' }`.
- `PublishedCatalog.for_role` already serves that projection — `implicated` is the same
  `selected`-style branch `sceneAuthor` uses, so the material a repair needs is already
  reachable by name.
- `CrewRole` has no repair member (`crew_contract.py:55-62`).
- `SplitVisualPlanner.plan` raises `ContractViolation` at
  `visual_planner.py:352-353` — precisely where a repair would begin.

`grep planRepair` over `services/agents/src` and `tests` finds nothing but contract fixtures.
US57-59 and *"Repair tests begin from a structured refusal"* (spec.md:346) are unmet.

## Why this is a ticket and not a patch

**The budget is the design, and the budget is not decided.** `converge` — the legacy scripted
path — has a repair budget. `ProductionCrew.run` deliberately has none: every `ContractViolation`
from any role is a terminal `failed`, and nothing loops on its own spend. That is defensible and
was made honest on purpose. Adding a repair role changes it, and the question it opens is not
"how many retries" but *whose money and against what evidence*:

- **What counts against the budget.** A scene-shape failure and a compiler refusal are different
  costs. One is answerable from published material with no Run (ticket 01), the other needs
  Production.
- **What the operator authorises.** `OperatorPolicy` gates research and image spend explicitly.
  A repair spends model calls that no policy field currently names, so either it is free inside
  the planning phase's existing authorisation or it needs its own — and that is a contract change.
- **Where exhaustion lands.** The spec says "stops or Declines". Those are different terminals
  with different meanings to an operator, and a repair that has run out is not obviously the same
  as a catalog that cannot serve the Brief.

Guessing any of the three produces a repair loop that works in tests and surprises someone
holding a bill.

## Blocked by

**Built ahead of 01, which is still open.** The concern below stands and is the first thing
to re-read when 01 lands: repair currently consumes the refusals the planner's own validators
produce, and 01 will make those richer. The seam is shaped for that — `PlanRefusal.findings`
carries whatever the validator returned, so better findings need no change here — but a repair
turn is only as useful as the evidence it reads, and today that evidence is thin.

The original argument, unchanged:

**01**, and not only for tidiness. Ticket 01 gives the Scene Author findings it can act on
without a Run. Until those exist, a repair role has almost nothing to repair *from*: the only
refusals available to it are `ContractViolation`s raised by the planner's own strictness, which
are malformed answers rather than the structured findings spec.md:53 says a repair reads. Build
01 first and a repair has real evidence to consume; build repair first and it will be written
against the wrong input and rewritten after.

## Not in scope

The Decline path. `UnservableBrief` now reaches `ProductionCrew.run` from the Structurer's
`unservable` finding, and an honest refusal of the whole Brief is already a Decline. A repair is
for a plan that is wrong, not for a Brief that cannot be served.

**Status:** done

## What was built, and what was decided

`SplitVisualPlanner` validates into `_refusal`, which collects **every** refusal in one pass and
names the capabilities they implicate; a refused plan then reaches `AdkPlanRepair` with the
`planRepair` projection of exactly those capabilities. `PLAN_REPAIR_BUDGET = 1`.

The three open questions, decided:

- **What counts against the budget:** a repair *turn*, not a finding. One turn sees every refusal
  at once, so a plan with four bad scenes costs one turn rather than four. Collecting them per
  scene is how a bounded budget becomes an unbounded one.
- **What the operator authorises:** nothing new. Repair runs inside visual planning's existing
  model authorisation and is capped at one turn, so the phase's worst case is two model calls
  rather than one. A budget large enough to need its own policy field would need one; this is not.
- **Where exhaustion lands:** it **stops** — `ContractViolation`, which the crew already turns
  into a `VIDEO_PLAN_CONTRACT_INVALID` failed terminal. It does not Decline. A plan that stayed
  refused says the crew could not author this Brief; a Decline says the catalog cannot express it,
  which is the Structurer's claim to make and it makes it through `unservable`.

The crew's "every `ContractViolation` is terminal" property is unchanged: repair happens before
one is raised, not after.

- [x] A repair role exists as a named `CrewRole` and appears in the crew's phase events
- [x] It receives the `planRepair` projection — the implicated capabilities' full specifications, and no others
- [x] It is reached only from a structured refusal, never from a well-formed plan
- [x] The repair budget is an explicit, named number, and its authorisation is decided and written down
- [x] Exhausting the budget produces one decided terminal, and the choice between stopping and Declining is argued in the code
- [x] No path can loop without consuming budget
- [x] Repair tests begin from a structured refusal, per spec.md:346
- [x] The crew's "every ContractViolation is terminal" property is either preserved or its replacement is stated as deliberately as the original was
