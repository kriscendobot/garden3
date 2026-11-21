---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/orchestration"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Orchestration

Purpose: for a multi-part job, plan every part as its own job, ordered,
so the follow-ups happen and a failure stops what depends on it rather than
stalling unseen. A maintainer's standing direction: for a multi-part job,
always plan the whole, never post a loose pile and hope.

## What the board already does

There are no orchestration records here. The board is the substrate
([designs/board.md](../../designs/board.md)):

- **Order** is `after`: a job is claimable when every job it names has left
  the board. A chain is serial; jobs with no `after` between them run in
  parallel.
- **A failure blocks.** A failed job stays in `failed/` and blocks every job
  after it until a maintainer releases or withdraws it. That is the halt
  policy, and the only one: completion is never inferred from absence.
- **A planner owns the whole.** A planner dispatches its steps as children
  and is held until they have all finished; then it runs once more to close
  ([roles/planner](../../roles/planner/AGENT.md)). That closing run is the
  completion record.
- **Budget** is the arc's: steps inherit the arc, and an arc with no
  headroom admits nothing ([designs/budget.md](../../designs/budget.md)).

## Procedure

1. **Decompose** into steps, each a whole job a worker can do in one run
   with room to spare, its `body` saying what it starts from (a branch, a
   commit, what is proven).
2. **Order** with `after`. Serial unless the steps truly do not touch.
3. **Dispatch** them in one go: a planner writes them all under `steps` in
   `outbox/handoff.yay`; the steward, outside a slot, posts them with
   `garden board post ... --after [ ... ]`.
4. **Name a recurring verb uniquely.** A step that is a verb against a
   target (`rebase`, `shepherd`, `retcon` pull request N) carries a date
   suffix, `-YYYYMMDD`: posting is idempotent by id, so a bare
   `<project>-pr<N>-retcon` can be taken for an earlier job of that name, and
   the fresh stage silently never runs.
5. **Close.** On the planner's closing run, check the whole request against
   what the steps produced, believing their branches over their reports. If
   something is missing, plan it.

## Splitting one design across steps

When a build step implements some phases of a design and later phases
(canaries, enabling it in production) belong to a later step, say so in the
build step's body, naming the later step. The build's pull request still
gets its review; it stays a draft until the later step's evidence lands.
Never write "the build stays draft with no review" into a step.

## A step that cannot finish

- **Failed at its goal:** the report says so plainly, first. The job fails;
  what is after it stays blocked for a maintainer.
- **Stopped at a maintainer's boundary** (an interactive login, an
  approval): finish every check you can, then say exactly what the
  maintainer must do, as `next: maintainer`. What is after it waits.
- **Out of time:** hand off ([wrap-it-up](../wrap-it-up/SKILL.md)).

## Not built yet

- **Continue on failure.** Only halt exists. A step that should not block
  its successors when it fails needs a policy on the job and a rule in the
  board's `src/board.js`.
- **A token cap for one plan** inside its arc, checked before each step is
  admitted and reported with its overshoot at the close: a field on the
  planner's record and a check in `src/budget.js`.
- **A step waiting on a deployed shed commit** (a step that needs its
  predecessor's garden change running): today it waits for the next
  quiescence by hand.
- **Progress notices** to the maintainer as each step finishes or fails:
  the steward reporting from the board, in `src/steward.js`.

Adapted from the prior garden's `skills/orchestration`.
