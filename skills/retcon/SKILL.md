---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/retcon"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Retcon

Purpose: reset a pull request's branch to its base and restage the same net
diff as a sensibly grouped history. What the pull request proposes to merge
does not change; only how its commits are grouped. The verb is the
maintainer's: retroactively fix the branch's continuity.

A retcon is not a rebase. It does not move the base. If the branch lags its
base, a rebase comes first (a `conductor` job does both, rebase then retcon;
[designs/pull-requests.md](../../designs/pull-requests.md)). Retcon assumes
the base is current.

## When to use

- A maintainer asks to "retcon" a pull request. The steward turns that into
  a job; this skill is the procedure.
- The history sprawled: one commit per review round, work-in-progress
  commits, lockfile churn between code commits.
- Before an upstream that reviews commit by commit sees the branch.

## What it produces

A linear history on your job's branch, grouped as:

- **One commit per affected package.** Changes under `packages/foo/` in one
  commit, `packages/bar/` in another, each with a conventional-commit
  message scoped to the package (`feat(foo): ...`, `fix(bar): ...`).
- **One `chore: Update yarn.lock` commit** for the lockfile, apart from the
  `package.json` change that caused it.
- **Implementation and tests in the same commit.** A package's behaviour
  change and the tests covering it ship together: one commit, not two.
- **Conventional-commit messages** on every commit:
  `<type>(<scope>): <imperative summary>`, and a body, when present, that says
  why, not what the diff shows.
- When a per-package split does not cover the diff, name the extra groups in
  your report:
  - top-level config or build: one `chore:` or `build:` commit;
  - a cross-package refactor that must land at once: one
    `refactor(<area>):` commit, the area naming the change, not a package;
  - documentation-only files: one `docs:` or `docs(<scope>):` commit.

### Later corrections are fixups

A minor correction to code the pull request introduced (a small bug fix, an
added test, a docs touch, a lint or formatting repair) is a follow-up to an
existing commit, not new behaviour. Write it with
`git commit --fixup=<introducing-sha>` against the package commit that
introduced the code, not as a standalone `fix:`, `style:` or
`chore: prettier` commit.

- If no panel or maintainer has reviewed the branch yet, autosquash before
  you finish, so the history the steward publishes is already tidy.
- Once a review has run, leave the `fixup!` commits at the tip, so the
  reviewer's delta stays legible. The final `conductor` stage absorbs them
  with a noninteractive `git rebase -i --autosquash`.
- Keep a separate `feat:` or `fix:` commit only for distinct, independently
  reviewable behaviour.

## Procedure

In the checkout `garden project add <org>/<name> <head>` gives you, at the
pull request's head ([project-checkout](../project-checkout/SKILL.md)). The
base commit is the one `JOB.yay` names under `pull_request`.

```sh
git status --porcelain                  # must be empty
git tag pre-retcon HEAD                 # the reference for the check below
git reset --mixed <base-commit>         # the net diff, unstaged
git add packages/foo/ && git commit -m "feat(foo): <summary>"
git add packages/bar/ && git commit -m "fix(bar): <summary>"
git add yarn.lock && git commit -m "chore: Update yarn.lock"
git diff pre-retcon HEAD                # must be empty
git diff --stat <base-commit> HEAD      # same files and counts as before
```

- Use `--mixed`, never `--hard`: `--hard` throws the net diff away.
- Run `git status` after each `git add`; stage only the group you mean.
- If a review has already run, commit the changes made since it as
  `--fixup` commits at the tip rather than folding them into the package
  commits.
- If either check fails, do not finish: `git reset --hard pre-retcon` and
  start over.

You do not push. The steward publishes your branch to the pull request's
head with `--force-with-lease` against the head it recorded; if anything
was pushed meanwhile, the publish fails rather than overwriting it.

## The net diff is invariant

The one property that matters: the diff from base to the new head is byte
identical to the diff from base to the old head. `git diff pre-retcon HEAD`
is empty: the two heads have the same tree. A retcon that changes the tree
is wrong, however good its history looks.

## When the branch is already in shape

A retcon may be a no-op. If the branch is already partitioned as above, do
not reset and restage: identical trees under fresh commit ids reset CI and
invalidate reviews in progress for nothing. Check, against the existing
history:

- each commit's files belong to one package (or one top-level group);
- no file appears in more than one commit;
- the union of the commits' files is the base-to-head diff;
- each package's implementation and tests share a commit, and the lockfile,
  if changed, is its own commit.

If all four hold, report "already in retcon shape, no change", with the
evidence, and commit nothing.

## Pitfalls

- **No pre-retcon tag.** The invariance check has nothing to compare
  against. Tag before you reset.
- **A lockfile inside a package directory** leaks into that package's
  commit. Check what is staged.
- **Implementation without tests.** Either the tests live elsewhere (a
  separate cross-package test commit) or the change is untested: that is a
  finding for the report, not something a retcon fixes.

## Report

Name the new commits and their groups, any grouping that departed from one
commit per package and why, and that the tree is unchanged (the empty
`git diff pre-retcon HEAD`).

Adapted from the prior garden's `skills/retcon`.
