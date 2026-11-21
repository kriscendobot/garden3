---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/rebase-before-followup"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Rebase before a follow-up

Purpose: before adding fix-up commits to an open pull request, rebase its
branch onto its current base, so CI does not run against a stale base and
the pull request does not fall behind.

Applies to every follow-up on an open pull request: review fix-ups, rebase
passes, corrections to your own build.

## Procedure

Your checkout starts at the pull request's head
([project-checkout](../project-checkout/SKILL.md)); the base's tip is the
one `JOB.yay` records under `pull_request`, fetched for you. There is no
remote to fetch from.

```sh
git rebase <base-commit>               # linear, if there are no conflicts
# apply the fixes
git commit -m "fix(pkg): address review on ..."
git diff --stat <base-commit>..HEAD    # your files only
```

The steward pushes your branch to the pull request's head under a lease on
the head it recorded, so a push that raced anything fails rather than
overwriting it. If the lease is refused, a later job starts again from the
new head.

## Rebase onto the pinned base, never a moving trunk

Some projects keep a pull request's base on a frozen snapshot
(`endo-but-for-bots` uses `llm-<sha>`). A follow-up rebases onto **that**
base, never onto the live `master`, `llm` or `main` tip. Re-parenting onto a
moving trunk entrains its commits: one pull request
(`endojs/endo-but-for-bots#831`) dragged in seventy-nine unrelated ones.

- **Only a rebase job moves the base.** A follow-up keeps the same frozen
  base. Moving to a new snapshot at the fresh tip is a conductor's job
  ([designs/pull-requests.md](../../designs/pull-requests.md)).
- **Check the delta before you finish.** `git diff --stat <base>..HEAD`
  must show your files only. A count that ballooned means the rebase took in
  the base's own commits: redo it with `git rebase --onto <base> <old-base>
  HEAD`.

## Pitfalls

- **Never resolve a conflict with `--ours` or `--theirs` wholesale.**
  Resolve each hunk by understanding both sides.
- **Silent drops.** Commits on the branch that landed independently on the
  base are skipped by the rebase. Check the rebased diff still carries the
  pull request's intent.
- **Changing base branches** (`llm` to `master`, say) can surface
  modify/delete conflicts on files that exist only on the old base. Skip the
  commits that belong only to the old side, then check with
  `git diff --name-only <new-base>..HEAD` that what remains belongs on the
  new base.
- **Across bases, use `--onto`.** A bare `git rebase <new-base>` replays
  every commit between the new base and HEAD, which can be hundreds. Replay
  only the pull request's own:

  ```sh
  git rebase --onto <new-base> <old-base> HEAD
  ```

- **Duplicates skip only when the trees match cumulatively.** If the new
  base has `A; A'` and the branch carries equivalent `B; B'`, the rebase
  replays them one at a time, and `B` (the draft) conflicts with `A'`.
  Either drop the duplicates after confirming the cumulative tree matches,
  or take the base's content for each conflict and let the second commit
  empty out.
- **Workflow files.** A push that touches `.github/workflows/` needs a
  credential with workflow scope. That is the steward's concern; name it in
  your report if you changed one.

Adapted from the prior garden's `skills/rebase-before-followup`.
