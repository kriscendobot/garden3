---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# The job board

The `board` branch holds the job board and nothing else. Rules:
`src/board.js` (pure). Service: `src/boardService.js`.

## Records

A job is one YAY file whose directory is its state:

| Path | State |
| --- | --- |
| `open/<id>.yay` | posted; claimable when every job in its `after` has left the board |
| `held/<id>.yay` | waiting: for a maintainer (`hold.reason`), or for the steps of its own hand-off |
| `claimed/<host>/<id>.yay` | claimed; the accepted push is the claim |
| `failed/<id>.yay` | failed terminally; still blocks its dependents |

Fields: `id`, `role`, `title`, `body` (a block string: what the worker reads),
`arc`, `priority` (0 soonest to 9), `after`, `requires`, `projects`, `plot`,
`window_s`, `posted_at`, `posted_by`, `source`; then what the board maintains:
`level`, `steps`, `under`, `abandoned`, `handoffs`, `handoff_log`, `cost`,
`cost_under`, `attempts`, `claim`, `hold`, `go_ahead`, `reaped`
([omega.md](omega.md)).

A dependency is satisfied by absence. A finished job goes to the archive; a
failed one stays in `failed/` and keeps blocking until a maintainer releases or
withdraws it. A dependency cycle is refused when it would be created.

## Operations

| Method | Does |
| --- | --- |
| `post` | adds a job; idempotent by id |
| `claim` | takes the first ready job this host may run |
| `complete(id, done)` | archive first, then leave the board; only the holding host may |
| `complete(id, failed)` | moves to `failed/` |
| `complete(id, withdrawn)` | a maintainer's act, in any state |
| `handoff` | the planning event ([omega.md](omega.md)) |
| `release` | back to `open/`: a requeue, or a maintainer's go-ahead on a held or failed job |
| `abandon` | back-tracks a job and its subtree |
| `sweep` | deterministic upkeep: reopen a job whose steps are done, drop a claim the archive already has, requeue a claim older than the TTL |

Claim order is the arc's rank on the slate, then lowest level, then priority,
then age. A job is skipped when it requires a capability the host has not
verified, is pinned to another host (`host=<name>`) or plot, or its arc cannot
admit it ([budget.md](budget.md)).

## Between hosts

Any host may post and claim. Contention is settled by the push
([shards.md](shards.md)); two hosts racing for one job is tested. A host's
claims live under its own directory, so a host that vanishes is visible, and
the leader's sweep requeues what it held once the TTL passes, or at once when a
quiescence marks it absent ([quiescence.md](quiescence.md)). A result from a
host that no longer holds the claim is refused (`not-held`): its work is in its
`wip/` branch, not on the board.

The archive is `done/<YYYY>/<MM>/<id>.yay`: the record as it left, with
`outcome` (`done`, `withdrawn`, `abandoned`), `completed_at`, its level, its
cost and its report.

## Ported from

- The prior garden: `scripts/jobs/claim-job.sh`, `complete-job.sh`,
  `post-job.sh`, `reaper.sh` (`GARDEN_CLAIM_TTL=14400`), the lane names in
  spirit (`todo`, `doin`, `tada`, `plan`), `requires:` with `host=`.
- The tower: jobs as strict YAY with the body a block string; the jobs branch
  apart from the journal.

## What changed

- One file per job, in YAY, written canonically (sorted keys), so two writers
  produce the same bytes.
- No `plan/` lane with gates and a promoter: a job is open or it is held with
  a reason. The prior garden's foreman, auction, reputation, gauntlet,
  orchestration records and reaper doom logic are not ported.
- `work/`, `inbox/`, `msgs/` and `jobs/index/` are gone from the board. A
  running job's inbox was how the prior garden delivered deadline nudges;
  those now arrive in the turn ([wrap-it-up.md](wrap-it-up.md)).
- Completed jobs leave the branch instead of accumulating in `tada/`.

## Status

Implemented and tested (`test/board.test.js`, `test/boardService.test.js`).
Design only: turning GitHub comments into posts (the watchers; see
[hosts.md](hosts.md)).

## Open questions

1. **Messages to a running job.** There is no inbox. Is a maintainer's comment
   on an in-flight issue to reach the running job, or the job's next run?
2. **Failed jobs block forever** until a maintainer acts. The prior garden
   requeued, doomed and parked by rule. Is plain blocking, surfaced weekly at
   the quiescence, enough?
