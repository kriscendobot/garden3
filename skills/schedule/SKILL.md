---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/schedule"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Schedule

Purpose: say what a recurring or future job should be, so that one scheduler
posts it on its cadence exactly once per period, rather than anyone keeping a
crontab on one host.

A job asked to add, change or remove a schedule writes the schedule as a
record and leaves it in `outbox/` for the steward. It does not post the
recurring job itself.

## The record

One record per schedule, written with `stringify`:

```yay
name: "weekly-dependency-recheck"
cadence: "weekly-at-Tue-13:00-America/Los_Angeles"
prefix: "dependency-recheck"
role: "builder"
arc: "endo"
occupancy: "skip"
body: |
  The task, as a worker should read it.
```

Or, for one future job, `once: "2026-12-01T17:00:00Z"` in place of `cadence`.

## Cadence

- **Interval**: `hourly`, `daily`, `weekly`, or `<N>s`, `<N>m`, `<N>h`,
  `<N>d`. Fires that long after the last dispatch, so a late tick drags every
  later fire with it. Right for "every six hours".
- **Anchored**: `daily-at-HH:MM-<zone>` or `weekly-at-<Day>-HH:MM-<zone>`,
  with an IANA zone (`daily-at-00:00-America/Los_Angeles`). Due when the most
  recent wall-clock anchor is after the last dispatch, and the last dispatch
  is recorded as that anchor, not the fire time: a late tick never shifts the
  schedule, and daylight saving is the zone database's problem. Right for
  "at midnight" or "every Tuesday afternoon", which a plain `weekly` cannot
  say without creeping.
- An anchored daily job's body is given the window it covers (the prior 24
  hours, start and end in UTC, and the local date), so a worker claiming it
  late need not re-derive it from its own clock.
- **Once**: fires when due, then the schedule is removed. Its job id is the
  prefix itself, so a retried post is a no-op.

A recurring job's id is `<prefix>-<YYYYMMDD-HHMMSS>` of the period it serves.

## Options

- **Occupancy**, for a job that can outlive its cadence (unset, every period
  posts a fresh instance, and four generations of one job ran at once in the
  prior garden):
  - `skip`: the previous instance is still live; advance the clock and post
    nothing. For periodicals, where the next period subsumes a missed one.
  - `carry-forward`: post nothing and leave the clock, so it fires the moment
    the previous one ends.
- **Interchangeable** (default true): a stale run superseded by a newer run of
  the same schedule is retired, not retried. Set false when every period must
  finish on its own.
- **Preflight**: a deterministic check, run before posting, of whether there
  is any work. Work: post and advance. No work: advance only. Cannot tell
  (for example, a rate limit): neither, try next tick. A check that errors or
  is missing fails open and posts; a missing one is reported once, not every
  tick.
- **Budget**: a recurring job that is long by nature names its own time
  budget, within the board's claim limit.

## Rules the scheduler keeps

- **Exactly once per period.** The post and the clock advance are one board
  commit.
- **A budget hold parks, a drain skips.** When the budget is exhausted, a due
  job is posted held and released when quota returns; it is not dropped.
  During a quiescence nothing is posted and no clock moves; each schedule
  fires once for the current period when it lifts.
- **Never revive a retired schedule** that a self-continuing job replaced.

## Not built yet

The scheduler. It is a steward-side service: a `makeScheduler(powers)` module
in `src/scheduler.js`, run on the supervisor's tick, reading schedules from
the board's side and posting due jobs through the board service, with the
clock advanced in the same commit. Until it exists, a schedule left in
`outbox/` is a request a maintainer acts on by hand.

Adapted from the prior garden's `skills/schedule`; its scripts, timers and
journal layout stay behind.
