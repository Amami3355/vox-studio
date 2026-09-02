# 04: The volume proves POSIX semantics, or it is the wrong volume

Status: done
Type: task
Blocked by: 03

**Done 2026-09-02. The disk delivers all four primitives and the check is proved to fail.** Evidence
in [`../ticket-04/FINDINGS.md`](../ticket-04/FINDINGS.md), with the raw results in `positive.json`
and `control.json`. The check is `scripts/volume-conformance/check.mjs`, driven by `run-check.sh`.

Three things the run settled that the criteria below do not capture, and one qualification on them:

- **`link()` is the only one of the four that discriminates.** The gcsfuse control passed
  `rename()`, `realpath()` and exclusive create; it failed `link()` with `EPERM`. The other three
  assertions show the mount is not wrong in those ways, not that it is right.
- **gcsfuse silently downgraded `0600` to `0644`** and nothing failed. Recorded as an observation,
  not asserted. On such a mount every private temporary and immutable artifact is world-readable.
- **Container-Optimized OS carries `mkfs.ext4`, `mount`, `mountpoint`, `lsblk` and `blkid`**, so the
  privileged-container formatting fallback was never taken.
- **"Mounted as ticket 07 will mount it" is a bind mount at `/var/lib/vox/runs` chosen here, not by
  ticket 07**, which has not decided it. The check ran as **uid 0**; the identity is the production
  service account in the Google sense, since that is the VM's, but the container's uid and the
  mount's `root:root 755` ownership are ticket 07's to settle, along with persisting the mount
  across a reboot — no `/etc/fstab` entry was written.

**Amended 2026-09-02, after the topology was chosen. This ticket shrinks, and it should be read
knowing why rather than assumed to be unchanged.** The volume is a persistent disk attached to a
Compute Engine VM and formatted `ext4` — not a managed network filesystem, and not a mount whose
semantics are delivered by a protocol implementation between the store and the kernel. `link()`,
`rename()`, `realpath()` and exclusive-create are properties of the filesystem itself, so the
question this ticket was written to answer is largely answered by the choice of disk.

**What survives, and why it is still worth an hour.** The check still runs, from the container, as
the production identity, against the real disk — because ADR-0015's warning was about *the mount as
the runtime delivers it*, and a container bind-mounting a host disk is still a layer between the
store and the kernel. What is retired is the reason this was the phase's largest unknown. It is now
a short conformance check rather than a risk, and **ticket 11 has taken its place as the largest
unknown.**

**The negative control is now free and should not be dropped.** `DELIVERY.md` offered deferring it
to buy back a day. That trade was priced against a check that needed a second provisioned mount; a
FUSE-mounted bucket is a contrast this topology can produce cheaply, and the discipline is worth more
than the hour. Take the cut only if the day is genuinely gone.

Everything below stands as written, reading "mount" as the disk as the container sees it.

## Problem Statement

`RunStore` is built on four filesystem primitives that object storage does not have. `run-store.ts`
calls `link()` once at line 733, `rename()` at 1504 and 1537, `realpath()` at 1314, 1319, 1331 and
1372, and `open()` with an exclusive-create flag at 1100, 1465, 1524 and 1545. Those are not
incidental conveniences. They are how a Run's identity survives a crash: a hardlink is how an
artifact is published without being copied, an atomic rename over an existing target is how a
checkpoint advances without a torn read, `realpath()` through the mount is how the store refuses a
path that escapes the Run, and exclusive create is the lock.

ADR-0015 decision 4 and this spec's decision 6 both say the same thing, and the spec says it in the
form of a warning rather than a specification: *"the chosen network filesystem, as mounted by the
chosen runtime, actually delivers `link()` and atomic `rename()` from the service process. 'The
protocol specifies it' and 'this managed mount delivers it' are different claims and only the second
matters."*

**A bucket behind FUSE is ruled out and the exclusion is the point of the decision.** No hardlinks;
`rename()` implemented as copy-then-delete, which is neither atomic nor cheap for a rendered video;
`O_EXCL` that does not reliably exclude. A run store on that mount does not fail loudly — it fails
as a torn checkpoint under concurrency, months later, in the one place this system claims
auditability.

The risk this ticket exists to retire is that the mount is chosen in ticket 07 by whoever is wiring
the container, discovered to be wrong during ticket 09's end-to-end proof, and fixed under deadline
by weakening `RunStore` — which is the exact trade ADR-0015 decision 4 was written to prevent.

## Solution

Choose the volume, then prove it, before anything is deployed onto it.

**A conformance check that runs against the real mount, from the service's own process shape.** Not
a unit test with a temp directory, and not a check run from a developer's shell over the same mount
— from a container in the chosen region, mounted the way ticket 07 will mount it, running as the
production identity. Each of the four primitives is exercised against the behaviour `RunStore`
depends on rather than against its mere presence:

- `link()` creates a second name for the same inode, and unlinking one leaves the other readable.
- `rename()` over an **existing** target is atomic — a concurrent reader sees the old bytes or the
  new bytes and never a partial file, and never a missing file.
- `realpath()` resolves through the mount and through a symlink on it, returning a path the store's
  containment check can compare.
- Exclusive create refuses the second of two racing creators, and refuses it reliably rather than
  usually. This is the one that a loop finds and a single attempt does not.

**The result is recorded as evidence, whichever way it falls.** A mount that fails one of the four
is a finding that redirects ticket 07, and it is worth as much as a pass.

## Implementation Decisions

- **The check is an operator-run verification, not a CI test.** It asserts a property of a
  provisioned resource, and a CI job that reaches a real mount is a CI job that holds a cloud
  credential. Same reasoning the spec gives in decision 6.
- **It runs from a container in the chosen region, mounted as ticket 07 will mount it.** The claim is
  about the mount *as the runtime delivers it*, and every layer between the protocol and the process
  is part of what is being tested. A check run from anywhere else proves something adjacent.
- **The exclusive-create case is run as a race, not as a sequence.** Two creators started together,
  repeated enough times to catch a mount that is usually exclusive. Everything else can be a single
  pass; this one cannot, and a check that runs it once will pass on a mount that is wrong.
- **The atomic-rename case is observed by a concurrent reader.** A rename that returns success proves
  nothing about what a reader saw mid-flight. A reader loop that records every distinct content it
  observed, and an assertion that the set contains exactly the two expected values, is the test.
- **`RunStore` is not modified, weakened, or given a fallback path.** If the mount fails, the mount
  changes. This ticket has no authority to relax the store and its criteria say so, because the
  deadline pressure to do exactly that is foreseeable.
- **The check lives in the repository and is re-runnable.** A one-off verification performed in a
  shell is a claim in a handoff. This one will be re-run when the region changes, when the runtime
  updates, and when someone proposes a cheaper volume.

## Testing Decisions

The conformance check *is* the test, so what needs deciding is how it is trusted.

**The check is proved to fail.** Run it against a mount known to lack the semantics — a FUSE-mounted
bucket is the obvious one and is already ruled out, which makes it the free negative control. A
conformance check that has never gone red is a conformance check nobody should believe. This is the
mutation probe applied to a verification script, and it costs one extra run.

**No production code is exercised and no Run is created.** The check writes into a scratch prefix on
the mount and removes it. It does not construct a `RunStore`, because a check that depends on the
store cannot be trusted to tell you the store's assumptions are met.

**The result is written down with the mount's identity attached** — filesystem, tier, region, mount
options — because "the volume passed" is not a claim anyone can re-check without knowing which
volume.

## Out of Scope

- **Provisioning the project and the region.** Ticket 03.
- **Deploying the service onto the volume.** Ticket 07.
- **Backup, snapshots, retention or lifecycle for the run store.** Real, and not on the path to a
  working deployment.
- **Sizing the volume.** A capacity question, answered when a render's artifact sizes are known.
- **Exported artifacts in object storage.** Decision 6 permits it explicitly; it is not the run store
  and it is not this ticket.

## Further Notes

**This ticket can retire the largest single unknown in the phase for a few hours of work, and it
should run early — in parallel with ticket 05, as soon as ticket 03 provides a project.** If the
chosen mount fails, every subsequent ticket's shape changes, and the difference between learning it
on day two and learning it on day eight is the difference between a delivery and a scramble.

**Blocked by:**
`.scratch/cloud-phase/issues/03-the-project-is-a-trust-boundary-and-is-provisioned-as-one.md`

- [x] A network filesystem is chosen, with its tier, region and mount options written down
- [x] A conformance check exists in the repository and is re-runnable
- [x] `link()` creates a second name for one inode, and unlinking one leaves the other readable
- [x] `rename()` over an existing target is atomic, observed by a concurrent reader that never sees a partial or missing file
- [x] `realpath()` resolves through the mount and through a symlink on it
- [x] Exclusive create refuses the loser of a race, asserted over repeated races rather than one attempt
- [~] The check runs from a container in the chosen region, mounted as ticket 07 will mount it, as the production identity — **the first two hold; the third is now recorded rather than asserted.** The 2026-09-02 run captured no identity at all: `check.mjs` records uid, gid, node and hostname, and `PRODUCTION_SA` was read from `~/.vox-cloud.env` and used only for the control bucket's IAM binding, so `FINDINGS.md`'s named service account was the operator's declaration and not a measurement. The driver now writes `identity.txt` from the VM's own metadata server beside the result, and the container still runs as uid 0, which is ticket 07's to settle
- [x] The check is proved to fail against a mount known to lack the semantics
- [x] `RunStore` is unmodified, and no fallback path was added to accommodate a mount
- [x] The result is recorded with the mount's identity attached, whether it passed or failed
