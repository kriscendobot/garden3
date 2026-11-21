---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Deadlines: hosts are honest and unreliable

The maintainer: "We trust the intentions of client hosts, but we don't trust
them to be reliable. The garden should expressly watch for deadlines elapsed
by jobs claimed, regardless of the claimant host. But, the garden may not be
able to reliably terminate a deadlined job. This should be made to fail open."
Rules: `src/board.js` (`claim`, `expire`, `fence`, `late`).

## The model

Any host may stall, crash, sleep, lose its network or run slow. None is
assumed hostile. So the design is for lateness, not for malice.

## How the priors handle stale claims

The prior garden has no lease. A leader-only reaper (`reaper.sh`, every ten
minutes) requeues any claim older than a flat `GARDEN_CLAIM_TTL` of four
hours, and a host counts as offline when its budget heartbeat is 1,800 s old.
A worker enforces its own handler timeout. A requeued job's old worker is not
fenced: `complete-job.sh` checks that the job is in `doin/`, not who or which
attempt put it there, so a late completion can land on a re-claimed job. The
deadline nudge is keyed to a digest of the claim attempt for that reason, and
nothing else is. The tower has one host and the same reaper shape.

## A claim is a lease

A claim records, on the board: `at`, `generation`, `window_s` and
`expires_at`.

```
expires_at = at + window + kill_after + grace          (2400 + 30 + 600 s by default)
```

| When | What | Who |
| --- | --- | --- |
| window − min(window/4, 15 min) | the wrap-it-up warning | the run's own hook |
| window − min(2 min, half that) | the final note | the same |
| window | TERM to the run's process group | the claimant's warden |
| window + kill_after | KILL | the same |
| `expires_at` + tolerance | the lease is expired on the board | any host |

Wrap-it-up is as found and comes first; the hard deadline is the claimant's
own; the expiry is the garden's, and comes after both, so that a host which is
merely on time is never expired.

## The watch

`expire` runs in every host's sweep, on every tick, in every phase of a
quiescence, whoever leads. It considers every claimed job, whoever holds it:
a host's own, another maintainer's, a client's. It needs nothing from the
claimant.

**It fails open.** When a lease has run out the claim is released to `open/`
at once. No attempt is made to confirm that the old run is dead, and none is
waited for: the watcher may have no way to reach that host. The work is
available again and nothing that waits on it stays blocked. (The claimant's
own warden is the best-effort stop; a host that is alive has already stopped
the run by then.)

**Clocks.** The claimant's clock writes the lease; the watcher judges by its
own. Hosts' clocks are not assumed to agree: a lease is expired only when the
watcher's clock is past `expires_at` by more than `clock_tolerance_seconds`
(300). There is no heartbeat and no renewal: a lease is as long as the job's
window says, once.

**Two watchers at once** both write the same release; one push wins and the
other, starting again from the new tip, finds nothing to do. The expiry is
counted once.

## Fencing

Because the old run may still be alive, each claim has a **generation**: the
job's count of claims so far. A re-claim raises it. Everything a run writes
back names the generation it was claimed under, and a write from a superseded
one is refused (`superseded`):

| Write | How a superseded run is kept out |
| --- | --- |
| complete, fail, hand off, requeue | `fence` checks host and generation at the tip, inside the compare-and-swap |
| the archive record | written only after the fence passes; keyed by job id, first writer stands |
| a project branch | named `job/<id>/<generation>` and `wip/<id>/<generation>`: beside the successor's, never over it |
| lessons on a plot | not landed for a superseded run |
| usage (the budget ledger) | always written: the time was spent |
| the job's cost | `late` adds it to the job if it is still on the board, and lists the late run |

**What happens to a superseded run's result: it is set aside, not applied
and not destroyed.** Its commits are in the garden's repository on that host
under its generation's branch names, its report and genome changes are in the
host's harvest directory, and the board shows `late_runs`. Nothing picks them
up automatically.

**Side effects outside the board.** A job cannot make one: it has no
credential and no remote ([slots.md](slots.md)). What reaches GitHub is done
by the steward from a *settled* run's outbox, and a superseded run does not
settle. For what the steward does, the plan is to key each act by job id (a
marker in the pull request or comment body, looked for before acting), so a
repeat is recognized. That is design only, with the rest of the publishing.

## Zombies

A run whose stop was never confirmed may still hold its slot on its host.
Three things clear it: the entrypoint razes every slot at boot; `prepare`
razes a slot before each job, killing whatever the account still runs; and
`reap`, on every tick, clears any slot whose job this host no longer holds at
that generation, which is what a host does on reconnecting.

## Visible, not punished

Each expiry is on the job: `expiries` (a count) and `expired_claims` (the
last five, with host and generation); they go to the archive with it.
`expiriesByHost` totals them over the board. Nothing is done about a host
automatically; chronic lateness is there for the accountant and the
maintainers to see, and a client host's `slots` is theirs to lower
([clients.md](clients.md)).

## Cost

Time burned by an expired or superseded run counts toward the engagement,
like a dead end ([omega.md](omega.md)): its usage row is in the ledger, and
its cost is on the job when the job is still there to carry it. An expiry is
not a planning event and changes no level.

## Status

Implemented and tested: leases and generations; expiry independent of the
claimant; release without confirmation; the tolerance for skew in both
directions; a re-claim raising the generation; every kind of late write
fenced; two watchers racing through a real remote; a superseded run through
dispatch (nothing applied, cost kept, lessons not landed); a host reaping its
own zombie (`test/board.test.js`, `test/boardService.test.js`,
`test/dispatch.test.js`, `test/supervisor.test.js`).

## Open questions

1. **The grace.** Ten minutes between the hard deadline and the expiry, plus
   five of clock tolerance. Shorter frees work sooner and expires slow
   harvests; the harvest of a large checkout over a slow filesystem (Oros's
   virtiofs) is the case to measure.
2. **A superseded run's results.** Set aside, as above. Should a finished
   late result ever be preferred over a successor that is still running? Now
   it never is.
3. **A late cost with nowhere to go.** If the job has already left the board,
   the late run's cost is in the usage ledger and not on any job record.
4. **No renewal.** A long job needs a long window stated up front. Leases
   renewed by a heartbeat would allow short leases, and bring back the
   heartbeat commits the garden just removed.
5. **Fencing is on the board, not on GitHub.** Once the steward publishes,
   idempotence there rests on the job-id marker.
