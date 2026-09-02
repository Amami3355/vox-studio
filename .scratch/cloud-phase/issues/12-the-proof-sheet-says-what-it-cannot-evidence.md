# 12: The proof sheet says what it cannot evidence

Status: ready-for-agent
Type: grilling
Blocked by: 02

## Question

`DELIVERY.md` states the constraint plainly: *the proof sheet is re-scored, and what the cloud cannot
evidence is reported as not evidenced. Not omitted.* That is the right rule and it is not yet a
decision — nobody has said which claims survive, which are replaced, and which are simply gone.

Three of the four isolation properties the sheet scores hang off the transport clause ticket 02
supersedes. The pipe ACL answered *who may connect*; the restricted Windows account answered *what
the caller may read*; the absence of a socket answered *who may reach the service at all*. In the
chosen topology there is no pipe, no Windows principal, and reachability is answered by an SSH tunnel
and a closed firewall instead. The isolated-OS-principal probes and the pipe-path assertions in
`proof/harness.ts` score a mechanism that will not be present.

The pressure this ticket exists to resist is obvious and it arrives on the 9th: a sheet with three
red rows looks worse than a sheet with three rows quietly dropped, and the deadline is the day the
temptation peaks. **The sheet's value is that it is honest about a boundary, and a sheet that omits
what it could not measure is worth less than no sheet.**

## What the answer must settle

- **Which recorded probes stop meaning anything**, named individually rather than as a category.
  Ticket 02's ADR names them; this ticket decides what the sheet then prints in their place.
- **What the substitute measurement actually is, and that it is not claimed to be equivalent.** The
  container is a stronger separation than the local topology achieves — the crew and the service
  share no filesystem, where locally they share a disk and the boundary is an ACL over it. That is
  worth claiming as a strength. It is not the same measurement as the one it replaces and must not
  be scored as though it were.
- **What is reported as not evidenced on the 9th**, in the sheet's own words, decided in advance.
  Deciding this before the run is what stops it being decided by whoever is looking at a red row at
  four in the afternoon.
- **That the distribution leak scan is unaffected** and continues to apply to both topologies, so the
  re-scoring does not sweep it up with the rest.
- **That the local proof harness remains the authority for the local topology.** It is not ported —
  `DELIVERY.md` ships that limit deliberately — so the sheet has two topologies in it and must say
  which rows belong to which.
