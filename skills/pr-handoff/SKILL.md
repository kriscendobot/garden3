---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pr-handoff"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pull request hand-off (the ferry)

Purpose: carry a finished pull request from the garden's fork to the
project's upstream repository, as a branch under the named human's
authorship, clean of every trace of the bot, ready for the maintainer to
push.

The prior garden called this the ferry (and, before that, the boatman). Its
position is kept: the push upstream happens outside the box, under the
maintainer's identity, and only with the maintainer's say. A job never holds
that identity. What a job does is prepare the branch and say exactly what
should be pushed where.

## When to use

- The job asks to ferry a pull request, carry it upstream, or re-ferry one
  whose upstream counterpart exists.
- Not for resolving conflicts with the upstream base (a rebase job), and not
  for a title-only change to an upstream pull request with no content change.

## What the job gives you

Read `JOB.yay` before anything else. A ferry job names:

- the source pull request (`<fork-owner>/<repo>#<n>`, its base and head
  commits);
- the upstream repository, its target branch and that branch's tip commit;
- the upstream pull request and its branch and head, if one exists;
- the human author (name and address) every commit will carry, and, for a
  salvage, a table of per-commit authors;
- `identity_switch_authorized: true`. Without it, stop: no other job ever
  commits as someone other than the garden.

If any of these is missing, stop and say which in your report. Do not infer
authorship from history: the source may already have flattened it.

Check out the upstream project at the right commit with
`garden project add <upstream-org>/<repo> <ref>`
([project-checkout](../project-checkout/SKILL.md)); the source commits must
be reachable in it, or the job cannot proceed. Confirm the base you detach
at is the tip `JOB.yay` records. Lesson from the prior garden: a clone's
tracking ref sat stale across four ferries because its fetch refspec was
empty, and every recompute landed on an old tip.

## Three shapes

Diagnose the shape from the job and the state of both pull requests before
starting.

### 1. First ferry

No upstream pull request exists.

```sh
git config user.name '<human name>'
git config user.email '<human address>'
git checkout --detach <upstream-tip>
git cherry-pick <source-base>..<source-head>
# rewrite attribution, strip trailers, fix subjects (below), per commit
git log <upstream-tip>..HEAD --pretty=fuller
```

Name the upstream branch `<human-login>-<topic>`, or `<scope>-<topic>`
after the source's convention. Write the title and body to
`outbox/pull-request.md` (below). Say whether it should open as a draft:
iteration on workflows opens as a draft; substance opens ready for review
when CI is clean and the source carries a substantive approval, especially
from the original author of the substance.

### 2. Re-ferry, recomputed from the upstream base

An upstream pull request exists, but the source was rebased or restructured
(split, squashed, reordered), so the upstream head is no longer an ancestor
of the new shape. Same steps as shape 1, cherry-picking the source's new
shape commit by commit (no squash unless the job asks). The push replaces
the upstream branch, under a lease on its recorded head. Say in the report
that approvals may be dismissed: they are only if the upstream branch's
protection dismisses stale reviews.

### 3. Re-ferry, appended to the upstream head

An upstream pull request exists, its head is healthy and is the work
intended, and the source has new commits at its tip that do not conflict.
The most review-preserving shape; prefer it when it applies.

```sh
git checkout --detach <upstream-pr-head>
git cherry-pick <new-commit>...        # only what the source gained since the last ferry
# rewrite attribution, strip trailers, per commit
git merge-base --is-ancestor <upstream-pr-head> HEAD || echo 'not a fast-forward: use shape 2'
```

The push must be a plain fast-forward, no force. Approvals survive it under
any protection rule, because a review stays anchored to its commit, which is
still reachable.

## Attribution

**One author (the usual case).** Every commit's author and committer become
the named human. What works: set `user.name` and `user.email` in the
checkout, cherry-pick, then `git commit --amend --reset-author --no-edit` on
each commit (for several, a rebase stopping at each). What does not:
`git cherry-pick --author` (ignored), or `GIT_AUTHOR_*` variables around a
cherry-pick (the original author is kept).

**A salvage (several authors).** When a source commit preserves another
person's original work, do not reset its author. Amend without
`--reset-author` (or with `--author='<original>'` if the message changes
too). The committer becomes the named human; the author stays. That
asymmetry is correct. Check each commit against the job's author table.

## Trailers

Every commit in the upstream-bound set has:

- no `Co-authored-by:` trailer, in any spelling or case;
- no "Generated with" or other generator line;
- no bot identity in trailer position.

Check every commit, every time, whatever an earlier look said:

```sh
for sha in $(git log <base>..HEAD --format=%H); do
  echo "=== $sha"; git show -s --format=%B "$sha" | git interpret-trailers --parse
done
```

Lesson: one ferry's preliminary look read only the first twenty lines of
each body and missed a `Co-Authored-By: Claude …` trailer below the first
paragraph. The parse caught it. Strip in the same amend that rewrites the
author.

## Subjects and bodies

- **Strip fork pull request numbers from subjects**: `(#73)`,
  `(fix lint job on #244)`. They mean nothing upstream.
- **Drop fork references from bodies** (`bots#57`,
  `endo-but-for-bots#NNN`), keeping the surrounding sense. References to the
  upstream repository (`endojs/endo#NNN`) stay.
- **Translate, do not drop, a substantive cross-reference.** "Landed in
  `endo-but-for-bots#255`" becomes the upstream merge commit of that work if
  it was ferried and merged. If the job did not give you the mapping, leave
  the reference out and name it in the report.

## The upstream pull request text

Write `outbox/pull-request.md`: the title (the project's conventional
commit form) and the body, for the upstream audience.

- Drop fork-only references (`Refs: #N` on the fork, "(this fork's #N)",
  "(re-opened from #N under the bot)").
- Drop bot bookkeeping: quotes of maintainer directives, test-plan
  checklists, generator lines, co-author lines.
- Refer to earlier iterations by their upstream merge commits, not fork
  numbers.
- **On a re-ferry, leave the upstream title and body alone** unless the job
  asks, or the restructure made the title materially wrong (the work moved
  from "migrate to" to "alias"). When in doubt, leave them and raise it in
  the report.

## Identity and comments

- The push happens under the maintainer's identity, by the steward, and only
  for a job that carries `identity_switch_authorized: true`.
- **No comments on primary upstream repositories** (`endojs/endo`,
  `Agoric/agoric-sdk`) under the maintainer's identity. If something needs
  explaining upstream, write it in the report for the maintainer to post.
- The garden's fork pull request gets exactly one cross-link comment, in the
  form `Mirror of <upstream pull request URL> (head <short sha>).`, edited in
  place on a re-ferry. Write its text in the report. There is no matching
  comment upstream: the upstream maintainers asked for none.

## Branch names

First ferry: a sensible default, as above. Re-ferry: the same upstream
branch as before, even if the source branch has since been renamed. Keep
the upstream's name.

## Scope

The ferry ends when the prepared branch matches the source's content with
clean attribution. Out of scope: resolving conflicts with the upstream base
(report a conflicting state; do not rebase), and rewriting an existing
upstream title or body (above).

**A no-op is an answer.** If the source and the upstream head already carry
the same content (the fork often re-syncs onto the ferry's rewritten
history), say so and stop. Never make a commit to register a ferry.

## Before you finish

1. `identity_switch_authorized: true` is in the job.
2. `git log <upstream-tip-or-head>..HEAD --pretty=fuller` shows the named
   human as author and committer on every commit, except a deliberate
   salvage.
3. The trailer parse is empty for every commit.
4. No fork references or bot bookkeeping remain in subjects, bodies or
   `outbox/pull-request.md`.
5. For shape 3, the ancestor check passed.
6. The report says: the shape; the commit to push; the upstream repository
   and branch; for shape 2, the recorded head to lease against; draft or
   ready; the fork cross-link text; the CI state, if `inputs/` had it. The
   ferry does not wait for CI: that is a later shepherd job.

## Not built yet

- **The ferry itself, steward-side.** Pushing a prepared job branch to the
  upstream repository under the maintainer's identity (shape 1 and 3 plain,
  shape 2 with `--force-with-lease` on the recorded head), opening the
  upstream pull request from `outbox/pull-request.md`, and posting or editing
  the fork's single `Mirror of` comment. It runs outside the box as the
  maintainer, like the prior boatman, and would live in `src/` beside
  `src/steward.js`; `designs/mail.md` leaves it open.
- **The mirror record.** The upstream and fork pull request pair, kept so
  the fork's mirror can be closed when the upstream one closes. A record on
  the board's side, written by the same service.

Adapted from the prior garden's `skills/pr-handoff`.
