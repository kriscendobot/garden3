---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Wrap it up

A running job is told when its time is nearly gone, and what to do about it.
Preserved from both priors. Code: `src/wrapup.js`, the hook in `src/cli.js`,
the deadline in `rust/warden`.

## How it works in the priors

**The prior garden** (`scripts/jobs/deadline-nudge.sh`, `designs/deadline-nudge.md`).
A leader-only timer scans claimed jobs once a minute. When a claim has the
lesser of a quarter of its handler timeout and 15 minutes left
(`GARDEN_DEADLINE_NUDGE_FRACTION=4`, `GARDEN_DEADLINE_NUDGE_CAP=900`), it commits
one message to the job's inbox on the journal branch, once per claim attempt:
"Deadline nudge: about N minutes remain in this attempt. Wrap up now." The
message carries budget fields and names the ways out: finish if the remaining
unit fits; post one successor for a continuous unit; park children as an
orchestration for separable stages; and never claim clean completion of an
unfinished deliverable. A hand-off is declared with a
`<<<GARDEN-JOB-HANDED-OFF: ...>>>` marker and is rejected without a durable
successor. The agent sees the message only when it next reads its inbox. A job
that does nothing is killed by the handler's `timeout`; the reaper counts a
deadline overrun and requeues or splits it.

**The tower** (`scripts/jobs/handlers/deadline-hook.sh`, `handlers/prompt.sh`,
`designs/fleet.md` § Deadlines). Same lead for the first note
(`deadline_leads`), plus a final note at the lesser of 2 minutes and half that
lead. Delivery is a Claude Code `PostToolUse` hook: after each tool call the
hook may add a note to the conversation, so it arrives in the turn the agent is
in, with no write to a branch and no polling. The prompt states the clock up
front. On the first note the agent lands what is proven, commits the rest to
`<base>-wip`, parks what remains as follow-on parts and ends with a hand-off
marker; on the final note it commits at once. The worker runs the handler under
`timeout --signal=TERM --kill-after`, and saves uncommitted work to
`<base>-wip` itself if the run is stopped. Runs on harnesses without the hook
get only the prompt's clock.

**Differences.** Delivery (an inbox commit that is polled, against a hook in
the turn); one note against two; who saves work in progress at the wall (the
agent only, against the worker as a backstop); the tower drops the budget
fields. **Neither** uses wrap-it-up to drain a host before a restart: a drain
in both is a moratorium on new claims while running jobs finish.

Also found: the prior garden's `CLAUDE.md` names a maintainer idiom, "wrap up
#N", among its compound chain idioms and says it is defined in the liaison's
role; no definition of it is in `roles/`, `skills/` or `context/` at the
commit read.

## What the garden keeps

- **The leads**, exactly: a warning at min(window / 4, 15 min) left; a final
  note at min(2 min, half the warning's lead) (`leads`).
- **The tower's delivery.** A note that is a push to the busiest branch is the
  churn the board no longer carries, so notes come through the hook
  (`garden hook`), once each per run, and the clock is in the prompt
  (`clockNote`). The hook says nothing if it has no clock and never fails.
- **The wording and the ways out.** "Wrap up now": land what is proven; then
  finish if the rest fits, or hand off and say what remains; never report an
  unfinished job as complete. The priors' "post one successor" is gone (see
  below).
- **The wall.** The warden stops the whole process group at the window (TERM,
  then KILL after `kill_after_s`). At harvest, uncommitted work is saved to
  `wip/<id>` in the project's repository.
- **A run that did neither** is an overrun: it is requeued with its cost
  charged and its attempt counted, never completed (`outcome`).

## How it relates to the hand-off

Wrap-it-up is the signal; the hand-off of [omega.md](omega.md) is one of the
three things a run can amount to after it:

| The run left | It is | The board does |
| --- | --- | --- |
| `outbox/report.md`, exit 0 | done | archive, leave the board |
| `outbox/handoff.yay` | a hand-off: the planning event | archive the job as handed-off, post a planner in its place, recompute levels (a planner's own `handoff.yay` lists the steps it dispatches) |
| neither, stopped at the wall | an overrun | requeue; no level changes |

A job may also hand off before any note, as soon as it sees the job will not
fit, as the tower's prompt allows.

**Where the two did not fit, and how it was settled.** The prior garden's
nudge distinguishes a *continuation* ("for one continuous, sequential unit ...
post one successor") from an *orchestration* of separable stages. The
maintainer has removed the first: a job that runs out of time names no
successor. A planner is posted as its parent to plan the remaining steps to
completion ([omega.md](omega.md)). The note's wording was changed to say so,
and that is the one change to wrap-it-up as found: the signal, the leads, the
wall and the wip save are as they were.

## Quiescence

Wrap-it-up is not used to drain. A quiescence stops claims and waits for
running jobs, each of which meets its own deadline and gets its own notes; the
longest window bounds the wait ([quiescence.md](quiescence.md)).

## Status

Implemented and tested: the leads, once-only notes, the hook's output, the
classification, and the three outcomes end to end through the warden
(`test/small.test.js`, `test/cli.test.js`, `test/dispatch.test.js`). Not
exercised: a real harness calling the hook.

## Open questions

1. **Should a quiescence be able to pull deadlines in**, sending the warning
   early so that a restart need not wait a whole window? Neither prior does.
2. **Harnesses without a hook** get only the prompt's clock, as in the tower.
