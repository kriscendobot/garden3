---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/frozen-base-branch"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Frozen base branch

Purpose: keep each fork-side pull request's base on a frozen snapshot of the
trunk, `<base>-<short sha>`, so its review never drifts and no other pull
request's merge moves it.

- **Never a floating base.** A fork-side pull request targets
  `master-abc1234`, `llm-abc1234` or `main-abc1234` (`git rev-parse --short=7`
  of the captured tip), never a bare trunk. Upstream pull requests use
  upstream's natural branch.
- **The job** works against the base commit in `JOB.yay`. A conductor
  rebases only its commits onto the new base commit,
  `git rebase --onto <new base commit> <old base commit>`, then checks that
  `git diff --stat <base>..HEAD` lists only its files and the commit count is
  what it expects, verifies locally, and reports the snapshot name the
  steward should create.
- **After rebasing onto new dependencies, reinstall before verifying.** An
  autostash conflict on a file the installer reformatted is not yours:
  restore it, do not commit it.
- **The steward** creates the snapshot at the captured commit, pushes the head
  under a lease, moves the base, unfreezes to the live trunk before any merge,
  and on close removes snapshots no open pull request uses, checking the REST
  list right before each delete.

## Not built yet

The steward's half: snapshot branches, leased pushes, base moves,
unfreezing and the sweep, in the drive of designs/pull-requests.md.

Adapted from the prior garden's `skills/frozen-base-branch`.
