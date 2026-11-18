---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Omega: a job's level, and its cost

A job's magnitude is not estimated when it is posted. It is inferred from how
much planning turned out to be needed underneath it. Rules: `src/board.js`.

## What the maintainer decided

1. **The planning event** is a hand-off: a job realises it is running out of
   time and hands off to an orchestration of new jobs. It is a runtime event,
   prompted by the clock ([wrap-it-up.md](wrap-it-up.md)), not a choice made
   up front to write a plan.
2. **Level is structural.** A job that did the work itself and spawned nothing
   is at the base level, 0. Otherwise its level is one more than the deepest
   tree it handed off to.
3. **It propagates.** When a hand-off deepens a subtree, every job above it is
   recomputed.
4. **It can fall.** Level is a maximum over the trees that are there now. When
   a branch is back-tracked, it stops counting.
5. **Cost is separate and never falls.** Cost measures time spent, including
   time spent finding out that a branch was a dead end. The budget is fed by
   cost; level is only the signal of magnitude.
6. **Repeated hand-offs need judgement, not a limit.**

## Level

```
level(J) = max( 0,
                level(s) + 1   for each step s that J handed off to,
                level(d)       for each other job d that J waits on )
```

taken over what is underneath J now: jobs on the board, and jobs that finished
(remembered in J's `under` map, as `{level, step}`, when they left). A plain
dependency passes its level through without the added one: a job sequenced
after a level-2 job is itself at least level 2, because it cannot finish
before that planning has played out, but it did no planning of its own.

A hand-off puts the job back in `held/` with its steps added to `after` and
`steps`, so the job is the closing step of its own orchestration: when the
steps have all left the board the sweep reopens it. Every level on the board
is then recomputed (`recompute`), by relaxation from zero, in at most n+1
rounds.

**Back-tracking.** `abandon` removes a job and the whole subtree of its steps.
Each is archived with outcome `abandoned`; each is removed from the `after`,
`steps` and `under` of whatever waited on it and listed in its `abandoned`.
Levels are recomputed and fall to what the remaining trees support. A
maintainer withdrawing a single job has the same effect for that job.

**Finished trees still count.** A job whose steps all finished keeps the level
they gave it, through `under`; a record does not keep listing finished steps
in `after`, so it does not grow with every step it ever had.

**Malformed graphs.** A dependency cycle is refused when a post or hand-off
would create it. If one is ever found on the board, `levels` still terminates
and `cycles` names the jobs on it. This is a safety check, not a limit on
re-planning.

## Cost

Each record keeps `cost`, what its own runs spent (`tokens`, `elapsed_s`,
`engagements`), and `cost_under`, the whole cost of every step that has left
the board beneath it, finished or abandoned. An engagement's cost is `cost +
cost_under`, plus the same for its live steps (`treeCost`). When a job leaves,
its whole cost moves into its parent's `cost_under`, so abandoning a branch
takes it out of the level and leaves it in the cost. The archive record of
the top job therefore carries the cost of the whole engagement, dead ends
included.

The budget ledger is each run's usage row ([budget.md](budget.md)), which is
cost. Level is recorded beside it and decides nothing there.

## Repeated hand-offs

There is no cap. Each hand-off is counted (`handoffs`) and logged with its
reason and the clock it ran out on (`handoff_log`). From the second hand-off of
the same job on, one review job per hand-off is posted for the **accountant**
(`review-<id>-h<n>`), carrying the count and the engagement's cost so far. The
review does not block the job. The accountant's criteria are in
`roles/accountant/AGENT.md`: is the scope growing (new steps name new ground)
or is the engagement merely not ending (steps restate the same ground; cost
per hand-off is flat or rising with nothing landing)? It reports one of
continue, re-scope, or back-track, to the maintainers; only a maintainer
abandons a branch.

Hand-offs made one after another do not inflate the level: five sequential
hand-offs of single steps leave a job at level 1, with all five in its cost.

## What the prior garden's omega did

Found in `designs/omega-task-rank-and-foreman-retirement.md` (Proposed, 2026-08),
`designs/cybernetics-economic-resilience.md` and the code:

- `scripts/jobs/cnf-backlog-triple.py` derives a rank per job, never declared:
  0 for an ordinary job, 1 for a job whose `role` is one of the planning roles
  (designer, researcher, scholar and others), 2 for the orchestrator; and a
  "realized floor" of `1 + max(child rank)`, **capped at 2**, for a job that
  has spawned children, read from orchestration records.
- Its one consumer is the foreman's promotion of parked plans
  (`plan_deferred_ranked_omega` in `common.sh`): arc rank first, then lowest
  omega rank ("leaf-first"), then priority and age.
- The design's stage 5, self-promotion when a job overruns its window, was not
  built. Its own first open question says no definition of the scheme could be
  found and the reading was provisional.
- The tower lists leaf-first ranking under "Not yet carried".

What is kept: rank is derived, not declared; a parent is one more than its
deepest child; leaf-first ordering of claims. What is new: no cap; no rank
from the job's role; propagation through plain dependencies; demotion;
completed steps remembered; cost as a separate quantity; hand-offs as the
event; the accountant's review.

## Status

Implemented and tested: levels over chains, diamonds and nesting, recompute on
hand-off, demotion on back-tracking, cost retained after it, repeated hand-offs
surfaced and not blocked, the cycle guard, replay safety
(`test/board.test.js`, `test/boardService.test.js`, `test/dispatch.test.js`).

## Open questions

1. **Level and the budget.** The maintainer has not said how level should bear
   on per-arc throttles or on re-admission. Today it bears on nothing but
   claim order (lowest first, as the prior garden ordered promotions). Options:
   a level at which a job needs a maintainer's go-ahead before its closing
   run; a per-arc ceiling on level; reserving more for a deeper job.
2. **Plain dependencies carrying level.** The rule above lets a hand-off raise
   every job that waits on the planner, which is the maintainer's first
   wording ("promote the level of every dependent job"). The narrower reading
   is that only the chain of jobs that handed off counts.
3. **Leaf-first claim order** can starve a deep job's closing run behind a
   stream of small jobs. The prior garden had the same property.
