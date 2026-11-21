---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/host-disposition-report"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Host disposition report

Purpose: show, per host and over recent windows, how the jobs each host
claimed actually ended, so a host that is quietly failing is visible at a
glance rather than found by hand.

The prior garden found two host incidents only by hand-written queries
over its job history: one host whose agent harness had gone stale (it won
claims and finished almost none), and one whose credentials had expired (a
pool finishing under 40% of what it claimed). Both would have stood out on
this report from the start.

## When to use

- A maintainer asks for fleet health, or for this report.
- Before and after a fleet-wide change (more active jobs, a new image, a
  deploy), to confirm no host was quietly starved or overloaded.
- When a host looks wrong in some other investigation: reach for this before
  writing ad hoc queries again.

## What to count

From the board and its archive ([designs/board.md](../../designs/board.md)),
read with `garden board read` and the `done/<YYYY>/<MM>/` records:

- **Claims** per host, by role: `claimed/<host>/` now, and each archived
  record's claim history.
- **Done**: archived as done.
- **Failed**: in `failed/`.
- **Expired**: claims whose lease ran out (`expired_claims`, `expiries`).
- **Late**: `late_runs`.
- **Handed off**: archived by a hand-off, with a planner in their place.
- **In flight**: claimed and not yet ended.

Trace each claim to what happened next to the same job id, not a raw ratio
of events: a claim later expired and finished elsewhere is a failure of the
first host, not a success.

## Procedure

1. Note the board commit you read; put it at the top. Staleness must be
   visible in the report, never hidden.
2. Choose windows for the question: a short one (6 hours) catches a fresh
   incident; longer ones (24 hours, 7 days) show whether a fix held or a
   problem is chronic.
3. For each window, a headline table: host, claims by role, done, failed,
   expired, late, in flight, completion rate, and a `fleet` row.
4. For each window, a per-role table: claims, done, failed, expired, handed
   off, in flight, follow-through. This is the more telling one: a host
   whose overall rate looks fine can be failing at one role while its others
   are healthy.
5. Discover hosts from the records, never from a list, so a new or renamed
   host appears by itself.

## Notes

- A host you know was active that shows nothing means the counting no longer
  matches the record shapes. Check that before trusting any number.
- The report reports. A bad number starts an investigation (a job pinned to
  that host, `requires: [ host=<name> ]`, with access to its logs), not a
  conclusion.
- A question answered in a session needs no published file. Publish only
  when the maintainer wants to share it.

## Not built yet

A deterministic, read-only report over the board and its archive, taking
the windows as arguments and printing the tables above as Markdown: a
`make*(powers)` module in `src/` beside `src/boardService.js`. Until
then, tally by hand from `garden board read` and the archive, where you can
read them.

Adapted from the prior garden's `skills/host-disposition-report`.
