# Ticket 04 — findings

**Run:** 2026-09-02 · **Check:** `scripts/volume-conformance/check.mjs`, driven by `run-check.sh`
**Where:** a `node:22-bookworm-slim` container on `vox-service`, `europe-west1-c`, whose identity is
`vox-production@studio-prod-7f3a.iam.gserviceaccount.com`

## The verdict

**The volume delivers all four primitives, from the container, on the real disk.** `link()`,
atomic `rename()` over an existing target, `realpath()` through the mount and through a symlink on
it, and exclusive create under a repeated race. Full result reproduced below and written locally to `positive.json`.

**Ticket 07 may mount this disk and `RunStore` will work on it.** The risk this ticket existed to
retire — that the mount is chosen while wiring the container, found wrong during ticket 09, and
fixed under deadline by weakening the store — is retired.

## The mount, named so the claim can be re-checked

| | |
|---|---|
| disk | `vox-runs`, 50 GB `pd-balanced`, `europe-west1-c`, `/dev/disk/by-id/google-vox-runs` → `/dev/sdb` |
| filesystem | `ext4`, UUID `9e0cfa13-c5ae-404c-952f-f14ebcc990a1`, `statfs` type `0xef53` |
| formatted | `mkfs.ext4 -F -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard`, run on the host |
| mounted | `/dev/sdb /mnt/disks/vox-runs ext4 rw,relatime,discard 0 0` |
| in the container | `/var/lib/vox/runs`, bind-mounted, `52,521,566,208` bytes |
| ownership | `root:root 755` |
| host | Container-Optimized OS, kernel `Linux 6.6.153+ x86_64` |
| process | uid 0, gid 0, node v22.23.2, containerized |

## What each primitive actually did

| Primitive | Result | What was observed |
|---|---|---|
| `link()` | pass | one inode (`131077`) under two names across two directories, `nlink` 2 → 1 after unlink, bytes identical both times. No `EXDEV`. |
| `rename()` over existing | pass | 200 renames of 1 MiB alternating two contents; a forked reader completed **2,482 reads** and observed exactly `{old, new}` — never partial, short or missing. |
| `realpath()` | pass | resolves to the expected child, through a symlink on the mount, and a link pointing off the mount resolves **outside** it — which is the property the containment check at `run-store.ts:1331` rests on. |
| exclusive create | pass | 200 rounds × 4 racers behind a spin barrier: **200 rounds with exactly one winner**, every loser `EEXIST`, no other error code. |

Two things recorded rather than asserted, because `RunStore` tolerates both silently:

- **directory fsync: ok.** `run-store.ts:1545` swallows a failure here, so a mount that cannot do it
  would weaken durability without failing anything.
- **`0600` is preserved.** `run-store.ts:1100` and `1524` ask for it explicitly.

## The negative control, and the part of it that is a warning

The identical `check.mjs` ran against a gcsfuse-mounted bucket — the storage this phase already
ruled out — in the same container shape on the same box. It **failed**, so the check can go red.
Full result reproduced below and written locally to `control.json`.

**But it failed on one assertion out of four, and that is the finding.**

| Primitive | ext4 disk | gcsfuse bucket |
|---|---|---|
| `link()` | pass | **fail — `EPERM`** |
| `rename()` over existing | pass | pass |
| `realpath()` | pass | pass |
| exclusive create | pass | pass |
| mode `0600` requested | `0600` | **`0644`** |

Three of the four assertions do not distinguish the right volume from the ruled-out one. They are
evidence the mount is not wrong *in those ways*; they are not, by themselves, evidence the mount is
right. **`link()` is what discriminates**, which is the reason `run-store.ts:733` publishes an
artifact by linking rather than copying, and `746` treats `EXDEV` as fatal.

**gcsfuse silently downgraded the file mode from `0600` to `0644`.** The check asked for `0600` and
the mount answered with its own configured `FileMode`. Nothing failed. On such a mount every private
temporary and every immutable artifact would be world-readable and no code path would notice. It is
recorded here rather than asserted, and it is the sharper half of what the control taught.

**Two qualifications on the control, stated because they bound what it proved.** It ran at smaller
parameters — 20 renames of 64 KiB against the disk's 200 of 1 MiB, 25 race rounds against 200 —
because every write there is an upload; a longer run might have caught the rename gap that this one
did not. And the bucket was flat with uniform access; gcsfuse 3.11.3 reported
`EnableAtomicRenameObject` and `EnableHns` true, so **"gcsfuse passed rename" is a statement about
this configuration at these parameters, not about object storage.** Nothing here softens the
exclusion — `link()` alone settles it.

## What ticket 07 inherits, unresolved on purpose

- **The mount does not survive a reboot.** No `/etc/fstab` entry was written. What owns the mount
  across a restart is ticket 07's decision, alongside what owns the container.
- **The mount is `root:root 755`.** The generic Google guide says `chmod a+w`; that is 0777 on a
  store holding attested runs and it was not done. The check ran as **uid 0**, so a non-root
  container will need the ownership decided rather than discovered.
- **`vox-runs` is now formatted and holds a filesystem.** `prepare-disk.sh` formats only a device
  with none and refuses to reformat one that has — proved by the second run of the day, which
  reported `formatted_this_run=no` against the same disk.

## Re-running it

```
bash scripts/volume-conformance/run-check.sh --yes
```

Idempotent. `--skip-control` omits the bucket; `--control-only` runs the contrast alone. The control
creates `gs://<project>-volume-control`, grants the production identity object access **on that
bucket alone**, and deletes both at the end.

**A note for whoever reads the log.** When the control fails, the remote command exits 1, so
`plink` exits 1 and gcloud prints an SSH troubleshooting recommendation. That is the check reporting
a red result through the tunnel, not a broken tunnel.

## Three things the run corrected

Each was a claim about a product surface that the run settled, in the pattern ADR-0018's session
earned.

- **Container-Optimized OS carries the filesystem tools.** `mkfs.ext4`, `mount`, `mountpoint`,
  `lsblk` and `blkid` are all present, so the privileged-container fallback in `prepare-disk.sh` was
  never taken. Recorded locally in `host-tooling.txt` and reproduced below.
- **`gcloud compute scp` on Windows does not expand `~`.** It shells out to PuTTY's `pscp`, which
  answers `remote filespec ~/vc-04/: not a directory`. The remote home is now read from the box.
- **The SDK's `gcloud.cmd` is not executable under Git Bash** — `[[ -x ]]` is false for it although
  it runs — while the extensionless `gcloud` beside it is. The wizard's `resolve_gcloud` looks only
  for `gcloud` and `gcloud.cmd` **on PATH**, and on this machine neither is: it would fail at its
  first stage claiming the SDK is missing. **That is a live defect in
  `scripts/provision-cloud-project.sh` and ticket 04 did not fix it**, having no authority there.

## The raw results

Only Markdown under `.scratch/` is versioned, so the two JSON results are reproduced here in full
rather than left as untracked files nobody downstream can read.

### `positive.json` — the real disk

```json
{
  "check": "volume-conformance",
  "ticket": "cloud-phase/04",
  "schemaVersion": 1,
  "verdict": "pass",
  "startedAt": "2026-09-02T18:38:27.452Z",
  "finishedAt": "2026-09-02T18:38:31.536Z",
  "parameters": {
    "renames": 200,
    "contentBytes": 1048576,
    "rounds": 200,
    "racers": 4
  },
  "mount": {
    "requestedPath": "/var/lib/vox/runs",
    "canonicalPath": "/var/lib/vox/runs",
    "device": "/dev/sdb",
    "mountPoint": "/var/lib/vox/runs",
    "fsType": "ext4",
    "mountOptions": "rw,relatime,discard",
    "statfsType": "0xef53",
    "statfsTypeName": "ext2/ext3/ext4",
    "sizeBytes": 52521566208,
    "freeBytes": 52504764416
  },
  "process": {
    "uid": 0,
    "gid": 0,
    "node": "v22.23.2",
    "platform": "linux/x64",
    "hostname": "1e93bd0ffb31",
    "containerized": true
  },
  "results": [
    {
      "id": "link",
      "title": "link() creates a second name for one inode",
      "status": "pass",
      "detail": {
        "inode": "131077",
        "sameInode": true,
        "nlinkWhileLinked": 2,
        "nlinkAfterUnlink": 1,
        "bytesMatchWhileLinked": true,
        "bytesMatchAfterUnlink": true
      }
    },
    {
      "id": "rename-over-existing",
      "title": "rename() over an existing target is atomic to a concurrent reader",
      "status": "pass",
      "detail": {
        "renames": 200,
        "contentBytes": 1048576,
        "reads": 2482,
        "observed": [
          "new",
          "old"
        ],
        "unexpected": []
      }
    },
    {
      "id": "realpath",
      "title": "realpath() resolves through the mount and through a symlink on it",
      "status": "pass",
      "detail": {
        "canonicalParent": "/var/lib/vox/runs/.volume-conformance-5555f824-00fc-464c-9732-52d6d8474b33/realpath/real",
        "resolvesToExpectedChild": true,
        "parentIsInsideMount": true,
        "symlinkSupported": true,
        "resolvesThroughSymlink": true,
        "escapeResolvesOutside": true
      }
    },
    {
      "id": "exclusive-create",
      "title": "exclusive create refuses the loser of a repeated race",
      "status": "pass",
      "detail": {
        "rounds": 200,
        "racersPerRound": 4,
        "roundsWithExactlyOneWinner": 200,
        "roundsWithMoreThanOneWinner": 0,
        "roundsWithNoWinner": 0,
        "loserErrorCodesOtherThanEEXIST": [],
        "modeOfCreatedFile": "0600",
        "firstFailures": []
      }
    }
  ],
  "observations": [
    {
      "id": "directory-fsync",
      "result": "ok"
    },
    {
      "id": "requested-mode-preserved",
      "result": "yes (0600)"
    },
    {
      "id": "cleanup",
      "result": "scratch directory removed"
    }
  ]
}
```

### `control.json` — the gcsfuse bucket

```json
{
  "check": "volume-conformance",
  "ticket": "cloud-phase/04",
  "schemaVersion": 1,
  "verdict": "fail",
  "startedAt": "2026-09-02T18:39:07.450Z",
  "finishedAt": "2026-09-02T18:39:20.639Z",
  "parameters": {
    "renames": 20,
    "contentBytes": 65536,
    "rounds": 25,
    "racers": 3
  },
  "mount": {
    "requestedPath": "/mnt/bucket",
    "canonicalPath": "/mnt/bucket",
    "device": "studio-prod-7f3a-volume-control",
    "mountPoint": "/mnt/bucket",
    "fsType": "fuse.gcsfuse",
    "mountOptions": "rw,nosuid,nodev,relatime,user_id=0,group_id=0,default_permissions",
    "statfsType": "0x65735546",
    "statfsTypeName": "fuse",
    "sizeBytes": 9007199254740992,
    "freeBytes": 9007199254740992
  },
  "process": {
    "uid": 0,
    "gid": 0,
    "node": "v22.23.2",
    "platform": "linux/x64",
    "hostname": "bd7a5c670fe9",
    "containerized": true
  },
  "results": [
    {
      "id": "link",
      "title": "link() creates a second name for one inode",
      "status": "fail",
      "detail": {
        "stage": "link",
        "error": {
          "code": "EPERM",
          "message": "EPERM: operation not permitted, link '/mnt/bucket/.volume-conformance-47e5fbf2-13b6-46bc-bb31-9976da8bb2e3/link/tmp/2e895c58-9d6f-4cae-9984-0eae928ee091' -> '/mnt/bucket/.volume-conformance-47e5fbf2-13b6-46bc-bb31-9976da8bb2e3/link/artifacts/artifact.bin'"
        }
      },
      "because": "link() is not available on this mount, so an artifact cannot be published without copying it."
    },
    {
      "id": "rename-over-existing",
      "title": "rename() over an existing target is atomic to a concurrent reader",
      "status": "pass",
      "detail": {
        "renames": 20,
        "contentBytes": 65536,
        "reads": 1466,
        "observed": [
          "new",
          "old"
        ],
        "unexpected": []
      }
    },
    {
      "id": "realpath",
      "title": "realpath() resolves through the mount and through a symlink on it",
      "status": "pass",
      "detail": {
        "canonicalParent": "/mnt/bucket/.volume-conformance-47e5fbf2-13b6-46bc-bb31-9976da8bb2e3/realpath/real",
        "resolvesToExpectedChild": true,
        "parentIsInsideMount": true,
        "symlinkSupported": true,
        "resolvesThroughSymlink": true,
        "escapeResolvesOutside": true
      }
    },
    {
      "id": "exclusive-create",
      "title": "exclusive create refuses the loser of a repeated race",
      "status": "pass",
      "detail": {
        "rounds": 25,
        "racersPerRound": 3,
        "roundsWithExactlyOneWinner": 25,
        "roundsWithMoreThanOneWinner": 0,
        "roundsWithNoWinner": 0,
        "loserErrorCodesOtherThanEEXIST": [],
        "modeOfCreatedFile": "0644",
        "firstFailures": []
      }
    }
  ],
  "observations": [
    {
      "id": "directory-fsync",
      "result": "ok"
    },
    {
      "id": "requested-mode-preserved",
      "result": "no — asked for 0600, got 0644"
    },
    {
      "id": "cleanup",
      "result": "scratch directory removed"
    }
  ]
}
```

### `host-tooling.txt` and the mount as the host reports it

```
user=Rabiaa22 uid=20162
home=/home/Rabiaa22
os=Container-Optimized OS from Google
docker=/usr/bin/docker
mkfs.ext4=/sbin/mkfs.ext4
mount=/bin/mount
mountpoint=/bin/mountpoint
lsblk=/bin/lsblk
blkid=/sbin/blkid

disk_name=vox-runs
by_id=/dev/disk/by-id/google-vox-runs
device=/dev/sdb
filesystem=ext4
uuid=9e0cfa13-c5ae-404c-952f-f14ebcc990a1
formatted_this_run=no
mkfs_via=n/a
mkfs_options=-m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard
mount_point=/mnt/disks/vox-runs
mounted_this_run=no
mount_line=/dev/sdb /mnt/disks/vox-runs ext4 rw,relatime,discard 0 0
ownership=root:root 755
persists_across_reboot=no
kernel=Linux 6.6.153+ x86_64
os=Container-Optimized OS from Google
```
