---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Quiescence: one coordinated restart

Once a week, by default, every host stops, the garden's history is cut short,
every host refreshes itself, and work resumes. One procedure does all three.
Code: `src/quiescence.js`, `src/host.js`, `src/supervisor.js`.

## Why

- **History.** The prior garden's journal performance fell with the length of
  its history (142,839 commits; about 1,900 a day). Shallow clones are kept
  ([shards.md](shards.md)); in addition the high-churn shards are rewritten to
  a fresh root regularly, and records that only grow are folded down.
- **Upgrades without a new image.** Everything above the base image is
  refreshed in place, together, while nothing is running ([image.md](image.md)).

## The phases

The state is one document, `board:quiescence.yay`. A host that was away reads
the whole story in one fetch.

| Phase | Who | Does | Moves on when |
| --- | --- | --- | --- |
| `idle` | | normal work | the leader (or a maintainer) calls a quiescence, naming its id, the expected hosts and the shed commit to rejuvenate to |
| `quiesce` | every host | claims nothing; lets its running jobs end; presses its journal; acknowledges | every expected host has acknowledged and no job is claimed |
| `truncate` | the leader | consolidates, then truncates `archive`, `journal`, `board` | the leader records the new epochs |
| `rejuvenate` | every host | fast-forwards its shed, refreshes **its own** capabilities and drops those it has not used, rebuilds the warden, razes slots, drops its clones, truncates its own host branch, republishes what it is; acknowledges with the shed commit it reached | every host acknowledged, at the named commit |
| `verify` | every host | verifies what it has against its own set, without repairing; acknowledges with `ok` and its pins | every host ok by its own set; and, the one cross-host check, no two hosts hold different pins of a capability both have. Hosts holding different capabilities is normal |
| back to `idle` | | `last` records the id, shed and epochs | |

Claims stop the moment the phase is not `idle` (the claim reads the document
at the tip it claims from). Running jobs are not interrupted: each meets its
own deadline and gets its own wrap-it-up notes
([wrap-it-up.md](wrap-it-up.md)), so the longest window bounds the wait.

## Hosts that are not there

- **Offline at the call.** The leader waits `ack_timeout_seconds`, then marks
  the host **absent**: it stops counting, and its claims are released to
  `open/` at once.
- **Comes back mid-quiescence.** It is listed absent, so its duty is to wait.
- **Comes back after the resume**, or is a new host. Its local marker of the
  last quiescence it completed differs from `last.id`, so its duty is
  **catch-up**: rejuvenate to `last.shed` and verify, alone, and only then
  claim. A stale host never works on an old shed.
- **Comes back with a stale shallow clone.** Its next sync is a forced fetch
  of a branch whose `EPOCH` has changed; it adopts the new root and drops the
  superseded objects. Nothing reads history, so nothing breaks.
- **Comes back with unpushed commits on the old history.** Its push is not a
  fast-forward of the new root and is rejected; the retry starts from the new
  tip. A completion for a claim that was released is refused (`not-held`).

## Truncation

`truncate(branch)`: read the remote tip; build a parentless commit of the same
tree with `EPOCH` advanced to `{epoch: n+1, previous: <old tip>, at}`; then in
**one atomic push** park the old tip at `refs/archive/<branch>/epoch-<n>` and
move the branch, with `--force-with-lease` pinned to the tip that was read. If
anyone wrote in between, the lease fails and nothing moves. Old history is
never deleted by the garden: it stays reachable under `refs/archive/` until a
maintainer prunes it.

It is a dry run unless `apply` is given, refuses outside the `truncate` phase,
and refuses while any job is claimed. A host truncates its own `host/<name>`
branch during its rejuvenation; that branch has one writer.

## Consolidation

Run by the leader before truncating. Each rule is keyed, so repeating it
changes nothing.

| Append-only record | Rule |
| --- | --- |
| `archive:done/<YYYY>/<MM>/` | months older than `archive_retention_months` (2) become one `rollup/<YYYY>-<MM>.yay`, an entry per job without body, report or hand-off log; level and cost are kept |
| `journal:entries/<YYYY>/<MM>/` | months older than `journal_retention_months` (6) become one `entries/<YYYY>-<MM>.md` |
| `host/<name>:usage/` | rows before the current budget week become totals in `journal:budget/weeks/<date>.yay`, per host; the host then drops files every row of which a statement covers |
| `board` | not append-only; jobs leave it. Job records are bounded: finished steps move into `under`, and `handoff_log` grows only with real hand-offs |
| a client host's applied-order ids | the last 200 are kept |
| plot genomes | lessons accumulate in role files. No automatic rule: pruning them is a job |
| `library`, `shed`, `clients`, `gate` | low churn; not truncated |

## Ported from

- The prior garden: drain (`drain-fleet.sh`: a moratorium on new claims while
  running work finishes), `rolling-deploy.sh`, `self-deploy.sh` and
  `deploy-garden.sh` (a follower fast-forwarding to a released commit),
  `tada/` date-sharding.
- The tower: `refresh-root.sh` (fast-forward only, refuse a dirty or diverged
  checkout), `receive.denyNonFastForwards` as the thing truncation must work
  around.

## What changed

The prior garden deploys continuously, one host at a time as canaries, and
never rewrites history. Here deploys are batched into the quiescence, all
hosts move to the same commit together, and history is rewritten on purpose.

## Status

Implemented and tested: the protocol including an absent host, a host on the
wrong shed, a failed verify and capability drift; truncation (dry run, apply,
parked history, the lease refusing a concurrent write, a stale clone and a
straggler recovering); the three consolidation rules; a whole quiescence
between two hosts through the service; the supervisor's duty in each phase;
the shed fast-forward and its refusals (`test/quiescence.test.js`,
`test/supervisor.test.js`, `test/cli.test.js`). **Not run against any real
repository.** Design only: calling a quiescence on a schedule (the cadence is
configured as `cadence_days: 7` and nothing reads it yet), and the leader
giving up on a host after the timeout by itself.

## Open questions

1. **The cadence.** Weekly was "perhaps". It is a setting.
2. **Does GitHub accept `refs/archive/*`?** Pushing refs outside `heads` and
   `tags` generally works there, but it was not tested (no network in this
   pass). The prefix is a setting; tags under `archive/` are the fallback.
3. **When may parked history be deleted?** Never, by the garden. Each epoch
   costs storage on the remote.
4. **Truncating plot branches.** Their history is how a genome came to be; it
   is kept for now.
5. **Batching deploys** means a fix waits for the next quiescence unless a
   maintainer calls one. The prior garden's canary roll is not ported.
6. **A quiescence in the middle of a hand-off chain** is harmless (held jobs
   survive in the tree), but long windows delay it by up to a window.
