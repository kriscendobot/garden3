---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/stacked-pr-build"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Stacked pull request build

Purpose: build a change that depends on pull requests not yet merged, on top
of exactly the code they deliver, so it can be developed and reviewed against
that code rather than against a base that lacks it.

The branch is the implementation base, then each dependency's head merged in
with `--no-ff`, then the change's own commits. Its pull request targets the
implementation base, not the top dependency, so a reviewer sees everything in
one place while each dependency stays its own merge unit.

## Inputs

From the job's `body` or `JOB.yay`:

- the implementation base (for `endojs/endo-but-for-bots`, `master`);
- the stack: each dependency's pull request number, head commit and design,
  deepest first;
- the design the change implements.

The dependencies' head commits must be in your checkout: the steward fetches
them with the project. Check each with `git cat-file -e <sha>^{commit}`. One
missing is the end of what you can do: report which.

## Procedure

1. **Start at the base.** `garden project add <org>/<name> <base>`
   ([project-checkout](../project-checkout/SKILL.md)) puts you on your job's
   branch at the base.
2. **Merge each dependency, deepest first, by the recorded commit**, not
   whatever its branch says now:

   ```sh
   git merge --no-ff <head-sha> \
     -m "stack: merge <org>/<name>#<n> head <short-sha> (<design-slug>)"
   ```

   `--no-ff` is load-bearing: the two-parent merge is what tells a reviewer,
   `git log --graph` and a later bisect that this is a stack. The message
   names the pull request and its design.
3. **Resolve conflicts small.** A one-line marker fix may stay in the merge.
   Anything more goes in its own commit after the merge,
   `chore: reconcile stack with #<n>`, saying what it adjusted, so the
   resolution can be reviewed on its own.
4. **Commit the change on top**, in the project's commit shape. Do not touch
   the dependencies' files unless the change needs to; never reformat them.
5. **Run the project's checks** on the whole stack.
6. **Report the stack.** In `outbox/report.md`, the pull request body the
   steward should use, and the stack as data:

   ```yay
   stack:
     base: "master"
     pulls:
       - number: 101
         head: "<sha>"
       - number: 102
         head: "<sha>"
   ```

   The body says what the change implements, lists the stack with each
   design, and says that the dependencies are pinned at those commits and
   merge on their own.

## When the stack moves

- **A dependency merges.** Nothing to do: its commits become ancestors of
  the base, and the next rebase drops its merge.
- **A dependency's head advances.** Usually leave it: the stack is a
  snapshot, and the reviewed surface has not changed. If the new commits
  change an interface the change uses, rebuild: a new job merges the new
  head, and its report updates the pinned commit.
- **A dependency closes unmerged.** The stack is broken. Stop and report it,
  naming the dependency; the change goes back to whoever decides what it
  depends on.

## Pitfalls

- **Targeting the top dependency's branch** hides the stack: the diff shows
  only your commits. Target the base.
- **Deeper than two.** Each level multiplies review and rebase cost. With a
  third unbuilt dependency, build the deepest one first as its own job, and
  say so; a maintainer may allow a deeper stack of mature dependencies.
- **A dependency on a different base** (during a base migration) cannot be
  stacked: its commits are on another line. Report it.

## Not built yet

The steward pushing the branch and opening the draft pull request against
the base, and rebuilding stacks when a dependency moves
([designs/pull-requests.md](../../designs/pull-requests.md)).

Adapted from the prior garden's `skills/stacked-pr-build`.
