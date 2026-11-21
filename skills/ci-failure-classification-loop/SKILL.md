---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/ci-failure-classification-loop"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# CI failure classification loop

Purpose: drive a pull request with red CI to green, or to a clean impasse,
across as many CI cycles as it takes, without a maintainer asking "what
next?" at every red result. Each cycle classifies every failing check into
one of four classes, decides which to act on, and acts.

The discipline is the shepherd's: "pursue all tests passing in CI by
whatever means necessary until reaching an impasse or success." One job is
one cycle. The loop is the chain of jobs the steward posts as each CI run
settles ([designs/pull-requests.md](../../designs/pull-requests.md)).

## When to use

- The job names a pull request with failing checks, and the garden owns
  getting it merged (a drive, or a maintainer said "drive this to green" and
  has not taken it back).
- Not when the pull request conflicts with its base: no CI runs on a
  conflicting pull request. Say `next: conductor` (a rebase).
- Not when every remaining failure is already expected or an impasse: the
  loop has ended.

## Inputs

- `JOB.yay` under `pull_request`: the repository, number, head and base.
- `inputs/checks.yay`: each check's name, conclusion and run.
- `inputs/logs/<check>.log`: the tail of each failed check's log.
- The previous cycle's classification, if the job carries one. Without it
  you cannot see regressions; say so.
- The authority to push to the pull request's branch, from the directive
  that opened the loop. Without it, the fix cannot be published: report the
  gap, do not do work that cannot land.

## 1. Observe

Read the checks ([pr-ci-watch](../pr-ci-watch/SKILL.md) says how). If any is
still pending, do not classify: report that CI had not settled. For each
failure, read its log only far enough for the signature: the error message,
the failing test, the assertion, the exit code.

## 2. Orient: four classes

Every failing check gets exactly one class. A check may move between classes
from cycle to cycle as evidence grows.

**A. Expected (skip).** A maintainer has said, on this pull request, that
this check is expected to fail. Example: a documentation job failing because
the documented application pins an older Endo. Without that explicit word,
it is not A; default to C.

**B. Structural impasse (surface).** A real cause whose fix is beyond the
job: a public API rewrite, a workspace restructure, a decision affecting
other pull requests or shipped artifacts, a workaround strategy the
maintainer must choose. Example: deploy tests failing because SES 2 cannot
read bundles written under SES 1; the fix is the maintainer's call on
migrating released bundles. Most reliable when an earlier fix attempt
reached the same conclusion.

**C. Real and tractable (fix).** A real cause within reach: a change inside
the pull request's own diff, a dependency pin, a missing fixture, a
workaround for a transitive interaction. Group checks that share a likely
cause and fix them as one. Examples: a test reading `null == true` because
the lockfile installed AVA twice; type-check residue fixed with
`@ts-expect-error` at the call sites. Your hypothesis is a starting point;
if your diagnosis differs, follow it.

**D. Regression (flag first).** A check that was green, or was expected,
and is now red. The latest push or a base update is the prime suspect.

**Uncertain is C.** The fix attempt is the refinement. Termination is for
evidence.

### Atop every class: should this have been caught locally?

For every failure, ask: should the project's own local checks have caught
this before the push? A lint error, a type break, a unit test, a format nit:
any such CI failure is a defect in our checking, so greening the pull
request is half the fix (@kriskowal, 2026-07-20).

- The local checks did not run what CI ran: a coverage gap. Say which check
  to add.
- Both ran and disagreed: a parity defect (a missing tool, a version skew).
  Say what differs.

Put this in the report as a follow-up of its own. A failure that could not
be caught locally (a CI-only integration test, an infrastructure flake, an
expected skew) carries none.

## 3. Decide

In order:

1. **D is not empty**: fix the regression first. It says which recent change
   broke what worked, and fixing it often unblocks the rest.
2. **Else C is not empty**: fix the largest coherent group, one cause per
   job. The next cycle takes what is left.
3. **Else only A and B remain**: the loop ends. Write the summary below.
4. **Else everything is green**: the loop ends on success.

B is never fixed from this loop. A is never fixed, by definition.

**No progress.** If a C group keeps the same signature across two
consecutive fix attempts, the third cycle promotes it to B. Two failed
attempts mean a deeper problem; stop iterating.

## 4. Act

Fix the chosen class in your checkout, on your job's branch, and verify the
fix the way CI would, as far as you can locally. Commit. Write the cycle's
table to `outbox/classification.yay` (with `stringify` from `src/yay.js`)
and to the report, so the next cycle has it:

```yay
cycle: 3
head: "<sha>"
checks:
  - class: "A"
    check: "test-dapp (node-new)"
    signature: "docs application pins an older endo"
    disposition: "skip: maintainer said expected"
  - class: "C"
    check: "multichain-testing imports"
    signature: "AVA installed twice"
    disposition: "fixed in this job"
```

End the report with `next:`: `shepherd` (another cycle, once CI settles on
what you committed), `none` (green), or the maintainer (impasse).

## Regressions, in detail

Compare each failing check with the previous cycle:

- **Green before**: regressed. D.
- **A before**: either the expectation was wrong or no longer applies.
  Re-read it. Still valid and same signature: keep A. A new signature: D.
- **B before, same signature**: still B.
- **C before**: not yet fixed. Same signature: count toward no-progress. A
  new signature: progress uncovered a new layer; keep C.
- **Absent before**: new. Usually a check that appeared once its
  prerequisite passed (the set of checks grows during a run). Classify
  normally; do not assume a regression.

A regression's report names the commits since the previous cycle.

## Ending

- **Green.** Every check succeeded, or was neutral or skipped. Record the
  run. `next:` is a review or the merge.
- **Only A and B.** List each remaining failure by class, with a paragraph
  of reason and a recommended step (a maintainer decision, accept as
  expected, a follow-up pull request). That list is what the maintainer
  reads.
- **No progress.** As above: promote to B and list it.
- **No authority** for the next step: say which.

## Not built yet

The loop across jobs: the steward reading check runs on each pushed head,
writing them and the previous cycle's classification into the next job's
`inputs/`, and posting the next shepherd job when CI is terminal. It is the
drive's CI watch in `designs/pull-requests.md`, and would live in `src/`
beside `src/steward.js`.

Adapted from the prior garden's `skills/ci-failure-classification-loop`.
