---
author: "designer"
created: "2026-11-17"
updated: "2026-11-22"
---

# The job board

The `board` branch holds the job board and nothing else. Rules:
`src/board.js` (pure). Service: `src/boardService.js`.

## Records

A job is one YAY file whose directory is its state:

| Path | State |
| --- | --- |
| `open/<id>.yay` | posted; claimable when every job in its `after` has left the board |
| `held/<id>.yay` | waiting: for a maintainer (`hold.reason`), or, a planner, for the steps it dispatched |
| `claimed/<host>/<id>.yay` | claimed; the accepted push is the claim |
| `failed/<id>.yay` | failed terminally; still blocks its dependents |

Fields: `id`, `role`, `title`, `body` (a block string: what the worker reads),
`arc` (the envelope it draws on: an arc, `maintainer` or `foreman`;
[budget.md](budget.md)), `tier` (a model tier from `config/garden.yay`
`worker.tiers`, such as `mentat`, posted only when a maintainer asks), `priority` (0 soonest to 9), `after`, `requires`, `projects`, `plot`,
`window_s`, `posted_at`, `posted_by`, `source`; then what the board maintains:
`level`, `steps`, `under`, `abandoned`, `planner`, `replaces`, `plans`,
`plan_log`, `origin`, `cost`,
`cost_under`, `attempts`, `generation`, `claim` (a lease: `at`, `generation`,
`window_s`, `expires_at`), `expiries`, `expired_claims`, `late_runs`, `hold`,
`go_ahead` ([omega.md](omega.md), [deadlines.md](deadlines.md)), and `envelope`,
the envelope that admitted the current claim.

`watch.yay` beside the jobs is the watcher's cursor and its list of issues
still to report on ([watcher.md](watcher.md)); `quiescence.yay` is the fleet's
restart state.

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
| `handoff` | a job out of time is archived and a planner takes its place: the planning event ([omega.md](omega.md)) |
| `plan` | a planner dispatches the remaining steps as its children |
| `release` | back to `open/`: a requeue, or a maintainer's go-ahead on a held or failed job |
| `abandon` | back-tracks a job and its subtree |
| `sweep` | deterministic upkeep, on every host: reopen a job whose steps are done, drop a claim the archive already has, expire every claim whose lease has run out ([deadlines.md](deadlines.md)) |

Claim order is the arc's rank on the slate, then lowest level, then priority,
then age. A job is skipped when it requires a capability the host has not
verified, is pinned to another host (`host=<name>`) or plot, or its arc cannot
admit it ([budget.md](budget.md)). A host installs what the next job needs
*before* claiming it, and a job no host can run is shown as unplaceable
([capabilities.md](capabilities.md)).

## Between hosts

Any host may post and claim. Contention is settled by the push
([shards.md](shards.md)); two hosts racing for one job is tested. A host's
claims live under its own directory, so a host that vanishes is visible. Every
claim is a lease that any host expires once it has run out, without waiting
to learn that the run stopped ([deadlines.md](deadlines.md)); a quiescence
that marks a host absent releases its claims at once
([quiescence.md](quiescence.md)). A result from a run that no longer holds
its claim is refused (`superseded`, `not-held`) and set aside.

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
Issues and comments on the garden's own repository become posts and verbs
through the watcher ([watcher.md](watcher.md)).

## Open questions

1. **Messages to a running job.** There is no inbox. Is a maintainer's comment
   on an in-flight issue to reach the running job, or the job's next run?
2. **Failed jobs block forever** until a maintainer acts. The prior garden
   requeued, doomed and parked by rule. Is plain blocking, surfaced weekly at
   the quiescence, enough?
