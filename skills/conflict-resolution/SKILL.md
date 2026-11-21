---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/conflict-resolution"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Conflict resolution

Purpose: resolve every merge, rebase or cherry-pick conflict by reading both
sides. Never `--ours`, never `--theirs`, never `-X ours` or `-X theirs`.

## The rule

A real conflict is two intentions touching the same lines. Read both sides
of every hunk, understand what each branch meant, and write the resolution
that honours both. It is usually a third state, both intentions woven
together, not either input verbatim. `--ours` and `--theirs` are right about
one time in twenty, and you cannot tell which time without reading both
sides.

## Procedure

1. List the conflicted files: `git status --short`, the `UU`, `AA`, `DD`,
   `AU` and `UA` lines.
2. For each, look at three things in order:
   - the markers (`<<<<<<<`, `=======`, `>>>>>>>`) in the working tree;
   - `git log -1 --stat HEAD -- <file>`: what the other side was doing;
   - `git log -1 --stat REBASE_HEAD -- <file>` (rebase) or
     `MERGE_HEAD` (merge): what your branch was doing.
3. Read both commits whole: `git show <sha>`. A conflict that looks
   semantic is often mechanical (one constant renamed in two places).
4. Write the file as if from scratch, knowing both intents. If they truly
   cannot both hold, prefer the side that fits the project's current
   direction and say so in your report, so the other author can review.
5. `git add <file>`; run the affected package's tests; continue
   (`git rebase --continue`, `git merge --continue`,
   `git cherry-pick --continue`).

## Recompute, do not choose

Three cases where neither side is kept, and even here read both first:

- **Generated files** (`yarn.lock`, `package-lock.json`, `dist/`): drop
  both sides and regenerate. A lockfile goes in its own
  `chore: Update yarn.lock` commit.
- **A changelog owned by release tooling** (Changesets): drop one side and
  let the release flow regenerate it.
- **Whitespace from a formatter rerun**: rerun the formatter; the conflict
  goes away.

In all three you delete both sides and recompute. Pretending another case
is one of these is the dishonest shortcut.

## Bringing a change across: cherry-pick

When a doc, style or policy change already landed on another branch, apply
it with `git cherry-pick <sha>` rather than writing it again, resolve any
conflict as above, and check with `git log --oneline -2`.

- The same commit picked onto two branches has two ids. Compare messages or
  trees across branches, not ids.
- When one project keeps its rules in `CLAUDE.md` and another in
  `AGENTS.md`, a blind pick leaves the rule unwritten where the file is
  missing. Put it in the right file instead.

## Pitfalls

- **Resolving from the markers alone.** They show disagreement, not intent.
  Read the surrounding function and both commit messages.
- **Silent loss.** A resolution that drops one side's new function is a
  regression even if it compiles. Run the tests after each file.
- **Repeated aborts.** Aborting a rebase twice is a sign a merge commit may
  be more honest than a rebase. Stop and say so in your report, with a
  `next:` line, rather than thrash.
- **Renames.** `UA` and `AU` mean both sides may have edited the file under
  different paths. Read with extra care.
- **`HEAD` changes meaning.** In a rebase, `HEAD` is the target and
  `REBASE_HEAD` is your commit being replayed. In a merge, `HEAD` is yours
  and `MERGE_HEAD` is incoming.
- **A clean rebase can still break the branch.** A lint, policy or schema
  check may fail because the new base added a file it covers. Run the
  project's checks on the rebased tree.
- **Two sides each add a parameter to one signature.** The commonest
  trivial-looking conflict and the most error-prone. Keep both: the base
  side's in its slot, so existing callers do not break, the branch's new one
  after it; and check positional callers in any shared implementation, so a
  placeholder for the base side's new parameter lands too.

Adapted from the prior garden's `skills/conflict-resolution`, with
`skills/cherry-pick-followup` folded in.
