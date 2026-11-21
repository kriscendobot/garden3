---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/review-feedback-followup-commits"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Review feedback follow-up commits

Purpose: answer a review with commits a reviewer can check at a glance: what
is new since they last looked, one concern at a time.

When: inline review comments, a review's top-level feedback, or a
maintainer's "please address X" on an open pull request, reaching you as a
job whose body carries the comments.

## Rules

- **Add commits on top; do not amend.** Amending makes the reviewer recompute
  the diff since their review; a follow-up makes it trivial. Amend only a tip
  you just rebased that nobody has pushed over, or when a maintainer asks for
  an author-only or message-only amend that leaves the tree unchanged (once,
  to restore an upstream author's header).
- **One concern per commit.** A conventional-commit message with the pull
  request number: `fix(ci): restore line lost in rebase (#NNN)`,
  `refactor(pkg): clarify the mock transport's pipes (#NNN)`. A reviewer who
  agrees with three points and not the fourth can ask for the fourth to be
  dropped without unwinding the others.
- **Start from the head you were given.** Your checkout starts at the pull
  request's head as the steward fetched it. If the job asks for a rebase
  first, that is a conductor's work; even a rebase that looks like a no-op
  matters.
- **Lockfile changes ship in their own commit** (`chore: Update yarn.lock`).
- **Reply to each thread** with the commit that addressed it, and write a
  summary ([pr-review-thread-replies](../pr-review-thread-replies/SKILL.md)).

## Patterns that need a closer read

- **Pinning an external dependency.** Take the sha256 from a fresh download,
  never from memory. Without the network you cannot: say so.
- **An item that demands a major rewrite.** Land the rewrite as one commit,
  and later follow-ups as additive sharpenings a reviewer could drop without
  unwinding it. Do not split it into theatrical phases.
- **A job that summarises threads with line numbers and suggested actions.**
  The line is authoritative; the action is a hint. Read the file at the line
  yourself: whoever summarised it may have matched it to the wrong file or
  name.
- **A package rename.** Sweep the whole cascade: the directory,
  `package.json`, test files, `.changeset/*.md`, error strings, designs, the
  lockfile. Afterwards `grep -rn '<old name>'` finds only intentional
  history.
- **A style, lint or format fix on an already retconned pull request.** Make
  it `git commit --fixup=<introducing sha>`, not a standalone commit, so the
  conductor absorbs it at merge with autosquash
  ([retcon](../retcon/SKILL.md), [conductor](../../roles/conductor/AGENT.md)).
  Behaviour a reviewer would weigh on its own is still a normal `fix:` or
  `feat:` commit.
- **The pull request merged while you worked.** If the head branch is gone,
  build your commits on the base as given and say in the report that they
  need a follow-up pull request, mapping each review ask to its commit. Never
  ask for the merged branch to be recreated or force-pushed.

## Output

A stack of one-concern commits on your job branch, and in
`outbox/report.md` each review item, the commit that addressed it or the
reason it was deferred, and the thread replies. The steward pushes the branch
and posts the report.

Adapted from the prior garden's `skills/review-feedback-followup-commits`.
