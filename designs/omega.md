---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Omega: a job's level, and its cost

A job's magnitude is not estimated when it is posted. It is inferred from how
much planning turned out to be needed underneath it. Rules: `src/board.js`.

## What the maintainer decided

1. **The planning event** is a hand-off: a job realizes it is running out of
   time and hands off. It is a runtime event, prompted by the clock
   ([wrap-it-up.md](wrap-it-up.md)), not a choice made up front.
2. **Level is structural.** A job that did the work itself and spawned nothing
   is at the base level, 0. Otherwise its level is one more than the deepest
   tree beneath it.
3. **It propagates.** When a subtree deepens, every job above it is
   recomputed.
4. **It can fall.** Level is a maximum over the trees that are there now. When
   a branch is back-tracked, it stops counting.
5. **Cost is separate and never falls.** The budget is fed by cost; level is
   only the signal of magnitude.
6. **Re-planning needs judgment, not a limit.**
7. **A hand-off has one shape.** There is no single-successor continuation. A
   job that runs out of time posts a **parent** to plan the steps that remain
   all the way to completion and dispatch them as its children, so that a
   sequence is a planner over a flat set and never a linked list.
8. **Level bears on claim order only**, favoring leaves of the job tree.
   That is sufficient for now: no interaction with throttles or re-admission.

## The shape of a hand-off

`handoff` (`src/board.js`). Job J is claimed and runs out of time.

- **J leaves the board**, archived with outcome `handed-off` and `handed_to`.
  Its work is on its branch (`job/<J>/<generation>`); its claim ends.
- **A planner `J-plan` is posted in J's place** (role `planner`,
  `replaces: J`). Everything that waited on J now waits on the planner. If J
  was a step of some other planner, `J-plan` is that step.
- **J is the planner's first underlying tree**: `under: {J: {level, step:
  true}}`. So the planner's level is J's plus one at once, and everything
  above is recomputed. This is the planning event.
- **J's whole cost moves into the planner's `cost_under`.** Nothing is lost.
- The planner's body carries what was asked, what J says is done and what it
  says remains, and where its branch is.

`plan`. The planner runs, and dispatches every remaining step as **its own
children**, flat, ordered among themselves with `after`. It is then held until
they have all left the board, and is run once more to close. Only a planner
may dispatch steps: an ordinary job that tries is refused (`not-planner`), so
the chain cannot be written.

```
before            after the hand-off         after the planner plans
  J  <- D           J-plan <- D                J-plan <- D        (level 1)
                    (under: J)                  ├ s1              (level 0)
                                                ├ s2 after s1
                                                └ s3 after s2
```

Twelve steps in sequence are one planner at level 1 (tested). A step that
itself runs out of time gets a planner of its own, which takes that step's
place under the first planner: level 2. That is real depth, the evidence that
a step was not a leaf, and it is the only way the level grows.

What was awkward:

- **The engagement's identity changes.** What a maintainer knew as `issue-12`
  is `issue-12-plan` after a hand-off. Dependents are rewired, and the steward
  follows `handed_to` when reporting, but anything else that remembers a job
  by id must follow the archive record too.
- **A planner that runs out of time while planning** has no hand-off of its
  own (`is-planner`): it is requeued as an overrun, or dispatches the steps it
  is sure of and says what is unplanned.
- **The job's own suggestions.** A job often knows the next steps. It may list
  them in its hand-off; they are passed to the planner as text, not posted.
- **The planner stands on J even if every step is abandoned**: its level
  stays at least J's plus one. That seems right (the planning happened).

## Level

```
level(J) = max( 0,
                level(s) + 1   for each tree s directly beneath J
                               (a step it dispatched, or the job it replaced),
                level(d)       for each other job d that J waits on )
```

taken over what is underneath J now: jobs on the board, and jobs that finished
(remembered in J's `under` map, as `{level, step}`, when they left). A plain
dependency passes its level through without the added one.

Every level on the board is recomputed (`recompute`) after any change to the
graph, by relaxation from zero, in at most n+1 rounds.

**Back-tracking.** `abandon` removes a job and the whole subtree of its steps.
Each is archived with outcome `abandoned`; each is removed from the `after`,
`steps` and `under` of whatever waited on it and listed in its `abandoned`.
Levels are recomputed and fall to what the remaining trees support.

**Finished trees still count**, through `under`; a record does not keep
listing finished steps in `after`.

**Claim order** is leaf-first: among ready jobs, the arc's rank, then the
lowest level, then priority, then age (`order`; `test/board.test.js` pins that
a level-0 step is drawn before its level-1 planner whatever their priorities).

**Malformed graphs.** A dependency cycle is refused when a post or plan would
create it; `levels` terminates regardless. A safety check, not a limit.

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

## Re-planning

There is no cap. Each plan is counted (`plans`) and logged (`plan_log`). From
a planner's second plan on, one review job per plan is posted for the
**accountant** (`review-<planner>-p<n>`), carrying the count and the
engagement's cost so far. The review does not block. The accountant's criteria
are in `roles/accountant/AGENT.md`; it reports one of continue, re-scope, or
back-track, to the maintainers; only a maintainer abandons a branch.

Planning again does not deepen the tree: five plans by one planner leave it at
level 1, with everything in its cost.

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
completed steps remembered; cost as a separate quantity; the hand-off as the
event, always to a planner parent; the accountant's review.

## Status

Implemented and tested: the planner-parent hand-off (the job archived, the
planner in its place, dependents rewired, cost carried); only planners
dispatch; a twelve-step sequence at level 1; a second level only when a step
itself runs out of time; recompute; demotion on back-tracking; cost retained;
re-planning surfaced and not blocked; leaf-first claim order; the cycle guard;
replay safety (`test/board.test.js`, `test/boardService.test.js`,
`test/dispatch.test.js`).

## Decided

- Level affects claim order only (decision 8).
- No single-successor continuation (decision 7). This also settles the
  conflict noted in [wrap-it-up.md](wrap-it-up.md) with the prior nudge's
  distinction between a continuation and an orchestration: there is one shape.

## Open questions

1. **Plain dependencies carrying level.** A hand-off raises every job that
   waits on the planner. The narrower reading is that only the planning chain
   counts.
2. **Leaf-first claim order** can keep a planner's closing run waiting behind
   a stream of small jobs. The prior garden had the same property.
3. **A planner's own time.** A planner that cannot finish planning in one run
   is requeued. Should it instead be allowed to dispatch a partial plan and be
   run again, as it can today, or be given a longer window?
