---
author: "designer"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pull requests

How the garden works on pull requests in a project it does not own, across many
jobs: a shepherd round on each, then one at a time onto the base branch. The
first use is the Ironhorse test262 ratchet on `endojs/endo-but-for-bots`,
where about twenty-five pull requests lie open against `llm`, all red for one
shared reason, several overlapping, the ratchet halted until they are gone.

A job has no credential and no remote ([slots.md](slots.md)). So everything
that touches GitHub is the steward's, and a job only ever sees a pull request
through what the steward fetched for it and changes it only through a branch
the steward publishes. This design is mostly about that seam.

## The shape

A **drive** is a steward-side record on the board: a repository, a base
branch, a set of pull requests, and a state per pull request. It runs in two
phases, then hands back to whatever it interrupted.

1. **Scatter.** One `shepherd` job per pull request, all at once. Each drives
   its pull request's CI to green, or stops at an impasse and names the next
   role ([roles/shepherd](../roles/shepherd/AGENT.md)).
2. **Reduce.** One pull request at a time, while any remain: take a green
   one, rebase it onto the base's tip and retcon it (a `conductor` job), push
   it, shepherd it once more if CI goes red, and merge it. A pull request
   that a rebase shows was carried by an earlier merge is closed, with a
   comment naming what carried it.
3. **Resume.** When none remain, the drive ends, and the arc it paused (here
   the ratchet's next crank) is posted again.

Only the reduce is sequential: each merge moves the base, and every later
rebase starts from it. That is the prior conductor's rule, kept: one merge in
flight per base.

## The seam

What the steward does, around each job, is the part not built
([roles/steward](../roles/steward/AGENT.md): "publishing branches and pull
requests is not built yet").

- **Before a job: fetch.** The project's bare repository under
  `repositories/<org>-<name>.git` is fetched, with the pull request's head
  and the base's tip. The job's record names the pull request, its head and
  base commits, and the CI on that head: each check's name, conclusion and
  run, and, for each failed check, the tail of its log, written into the
  home under `inputs/` (plain files, mode 0644, like a lent file but not a
  key). A job never reaches GitHub for these.
- **After a settled run: publish.** The harvested `job/<id>/<generation>`
  branch is pushed to the pull request's head branch with
  `--force-with-lease=<head>:<recorded head>`, so a push that raced anything
  fails rather than overwriting it. Its report is posted as one comment
  carrying a marker with the job id, looked for first, so a repeat is
  recognised ([deadlines.md](deadlines.md) § Side effects).
- **Between jobs: watch CI.** The drive's tick reads the check runs on each
  pushed head. A head is green when every check that ran on it succeeded;
  skipped checks do not count. A job is not woken to wait: the next job is
  posted when CI is terminal.
- **Merging.** The steward merges, never a job: `gh pr merge --merge` with
  `--match-head-commit`, only when the head contains the base's current tip,
  CI on that head is green, and the drive's authority covers it (below).

## Rebasing in this project

`endo-but-for-bots` keeps a pull request's base on a frozen snapshot,
`llm-<sha>`, and moves it with the head ("pin the merge base"; the prior
garden's weaver). A conductor job rebases onto the base's tip as fetched;
on publish, the steward creates `llm-<short sha>` at that tip if it does not
exist, moves the pull request's base to it with the push, and after the merge
removes snapshots no open pull request uses. The rebased branch is retconned
(the same net diff in sensibly grouped commits, [skills/retcon](../skills/retcon/SKILL.md))
before it is pushed.

Ratchet pull requests each grow a recorded floor, a list of test262 cases
the engine passes. Two of them always conflict there. A conductor resolves
it by regenerating the floor from the rebased engine, never by taking either
side, and the regenerated floor must contain the base's floor: coverage only
ever grows.

## Authority

Merging into `llm` without a maintainer's approval on each pull request is
what the prior garden's `ironhorse-test262-ratchet` delegation allowed
(authorized by kriskowal, 2026-09-28, marker
`<!-- garden-arc: ironhorse-test262-ratchet -->`). It is paused there. The
drive records its own authority: who asked (a maintainer, and where), which
repository, base and pull requests, and that it ends with the drive. The
steward refuses to merge a pull request the record does not name.

Closing a pull request as carried is in the same authority, and its comment
names the merge that carried it and any rows it alone added (carried over
first, by a conductor job, if there are any).

## Reporting

After each merge, and when the drive ends, the steward comments on the arc's
original pull request (for this drive, #1364, which ratchets hardened262):
the merged pull request, the base commit, and the hardened262 coverage at
that commit, beside the last reported count. The count is read from the
floor on the base, never from a job's account of it. A count lower than the
last is not reported as progress: it stops the drive and is reported as a
regression.

## What a job sees

- `JOB.yay`: the role (`shepherd` or `conductor`), and under `pull_request`:
  the repository, number, head and base names and commits.
- `inputs/checks.yay`: the check runs on the head, written with `stringify`.
- `inputs/logs/<check>.log`: the last lines of each failed check's log.
- `garden project add <org>/<name> <head>`: the checkout, on the job's
  branch, starting at the pull request's head.
- Its report says what it changed, how it verified it, and, for a shepherd
  that stopped, `next:` the role that should go on.

## Ported from

The prior garden's `roles/shepherd`, `roles/conductor`, `roles/weaver`,
`skills/retcon`, and the gauntlet in outline (`scripts/jobs/gardening/`):
the stages and their rules, not its scripts. The prior gauntlet was one job
holding a credential through every stage; here each stage is its own job and
the credential never leaves the steward.

## Status

Design only. Nothing in this document is built. To build, in order:

1. The roles: `shepherd`, `conductor`, and the `retcon` skill, adapted.
2. The fetch: a project's bare repository, a pull request's head, its
   check runs and failed logs, into a job's home.
3. Publishing: a settled run's branch to the pull request's head, under a
   lease, and its report as one marked comment.
4. The drive: the record, scatter, the CI watch, the reduce, merging,
   closing as carried, frozen bases, and the coverage report.
5. A first run, against one pull request, by hand.

## Open questions

1. **Where the drive ticks.** In the supervisor beside the watcher, or as a
   steward command run on a timer. The supervisor is not running in the box
   today.
2. **How long a log tail.** Enough to diagnose, small enough to read; the
   prior shepherd read whole logs over the network.
3. **The shared red.** Every ratchet pull request fails the oracle lanes on
   `Math.asinh` and `Math.acosh` differing from XS in the last digit. It is
   fixed first, as a pull request of its own, shepherded and merged before
   the scatter; the drive's first member.
