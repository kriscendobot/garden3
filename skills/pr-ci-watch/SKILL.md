---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pr-ci-watch"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Reading a pull request's CI

Purpose: read the CI state the steward fetched for your pull request,
correctly: what is settled, what failed, and which failures are worth
pursuing.

A job cannot reach GitHub. The steward reads the check runs on the head
and writes them into your home before you start
([designs/pull-requests.md](../../designs/pull-requests.md)):

- `JOB.yay` under `pull_request`: the repository, number, head and base.
- `inputs/checks.yay`: each check's name, status, conclusion and run.
- `inputs/logs/<check>.log`: the tail of each failed check's log.

## Reading the checks

1. **Same head?** Compare the head the checks were read on with the head in
   `JOB.yay` and in your checkout. Checks on an older head say nothing about
   the current one. A force-push gives every check a new run under the same
   name; match on name and head, never on run id.
2. **Settled?** A check is settled only when its status is completed.
   Queued, in progress, waiting and pending are not. If any check is not
   settled, CI was not terminal when you were posted: say so, and do not
   report the pull request as green or red.
3. **Failed?** A settled check failed when its conclusion is `failure`,
   `cancelled`, `timed_out`, `action_required`, `startup_failure` or
   `error`. `neutral` and `skipped` are not failures.
4. **Green** means every check that ran succeeded; skipped ones do not
   count.

## What the failures mean

- **Matrix jobs fail fast.** When one shard fails, its siblings on the other
  dimensions are canceled in the same moment. A cancellation beside a
  sibling's failure is a consequence: report it, pursue the failure.
- **The set of checks grows during a run.** Later jobs register only when
  their prerequisites finish: a run that starts at fifteen checks can settle
  at seventy. A check absent last time is new, not necessarily a
  regression.
- **No checks at all** after a push, for a long time, usually means the pull
  request conflicts with its base: GitHub runs no pull request workflows
  without a merge ref. Check the mergeable state in `JOB.yay` if it is
  there, or try the merge in your checkout. The remedy is a rebase
  (`next: conductor`), not a re-run.
- **Green, blocked, review required** is the normal state of a pull request
  waiting for a human. It is not a CI failure.
- **A known flake.** If a failed check matches a flake a maintainer has said
  to ignore, and no re-run has happened since, say in the report that it
  should be re-run before it is treated as gating.

## What to report

The head the checks were on; total, pending and failed counts; each failed
check with the signature from its log; and which are consequences of
another. The [ci-failure-classification-loop](../ci-failure-classification-loop/SKILL.md)
says what to do with them.

## Not built yet

The steward's CI watch: reading the check runs on a pushed head (the rollup
query, not the repository's events feed, which never shows check runs),
writing `inputs/checks.yay` and the failed logs' tails, and posting the next
job only when CI is terminal, so no job waits on CI. It belongs to the
drive in `designs/pull-requests.md`, in `src/` beside `src/github.js`.
Re-running a failed job is the steward's too, and also not built.

Adapted from the prior garden's `skills/pr-ci-watch`.
