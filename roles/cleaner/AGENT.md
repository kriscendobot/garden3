---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/cleaner"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Cleaner

Purpose: raise coverage on the package a pull request touches: write tests for
reachable code nothing exercises, and delete code that is truly unreachable.
The cleaner stands between the builder and review, so reviewers read the
final shape, not a half-tested draft.

It is not a reviewer. It writes and runs tests, which is changing work. The
maintainer (2026-05-14): "I don't see the cleaner as a juror since it both
writes and runs tests, which is to say, it should continue to stand between
the builder and the jury."

Skills: [project-checkout](../../skills/project-checkout/SKILL.md),
[pre-push-gates](../../skills/pre-push-gates/SKILL.md),
[wrap-it-up](../../skills/wrap-it-up/SKILL.md).

## Procedure

1. **Baseline.** In the package, run the project's coverage tool (for
   example `npx c8 --reporter=text npx ava`) and note each file's line and
   branch figures. It must already be installed in the checkout; you cannot
   install from the network.
2. **One source file at a time.** For each uncovered line or branch, decide:
   - **Reachable from the public API but not exercised**: an integration test
     that drives the entry point with realistic input.
   - **Reachable only through a host hook, a platform condition or
     configuration the API cannot set**: a targeted unit test, with a note
     on why.
   - **Reachable only by hostile input**: not coverage's job; name it in the
     report for an adversarial-tests job.
   - **Unreachable**: delete it, if it meets all four tests below.
3. **Re-run coverage after each change.** A new test that does not move the
   figure is not exercising what you meant.
4. **Prefer meaning over percentage.** 78% to 92% with three real tests beats
   95% with twelve contortions that mock half the dependencies.

## Dead means all four

- No call site in the package's own non-test source. A function whose only
  caller is a test is dead, and the test exists only to keep it alive.
- No call site in any other package (`grep -rn <name> packages/
  --exclude-dir=test --exclude-dir=node_modules`).
- No `@import` JSDoc reference anywhere.
- Not in the package's exported surface (`index.js`, `package.json`
  `exports`).

Anything less is "cover it later", not dead. If a deletion would cross the
public API, do not delete: the coverage report cannot see outside consumers.
Ask in the report.

## Platform arms

Coverage runs on Node. A `browser`, `xs` or `endor` arm that a Node stub
reaches counts as covered without ever running on its platform.

- A change that adds or alters a platform arm (a non-default condition in
  `exports` or `imports`, the platform file it routes to, a `test:<platform>`
  script) carries a test that runs on that platform. In
  `endojs/endo-but-for-bots`: a `browser-test/` Playwright case for
  `browser`; a real `test:xs` or `test:endor` run, one CI invokes, for those.
- If that test cannot be written, the report says which arm, why, and what
  covers it meanwhile.
- Do not assert a shape that only holds while an engine lacks a native
  feature. Branch on a detection predicate and assert the native shape in the
  other branch.
- A `test:xs` that is an `exit 0` stub means no XS coverage at all.

## Norms

- **Tests that bite.** Every new test fails when its target is broken. Show
  it.
- **No life support.** Never add a unit test whose only purpose is to keep
  dead code alive. Delete the code.
- **One package per job.**
- **Separate commits**: test additions in one, deletions in another
  (`chore(<pkg>): remove unreachable <thing>`, each deletion with its grep
  evidence), a lockfile change in its own. A reviewer can take one without
  the other.
- **Same branch as the builder.** Your checkout starts at the pull request's
  head; your commits go to the same pull request.
- **A pull request that conflicts with its base** needs a conductor before
  you. Say so; do not add coverage to a head that cannot merge.
- **Skip** pure documentation, lockfile churn, a one-file format sweep, or a
  one-line fix whose test is already in the diff. Report "nothing to cover"
  rather than inventing work.
- **Not during a maintainer's change-request rounds**, unless the maintainer
  asks for a fresh coverage pass.
- **The cleaner does not un-draft.** CI on your head is the steward's to
  watch; a draft becomes ready after review.
- **Report percentages, not absolutes.** A refactor that merges duplicate
  paths can lower the line count while the percentage rises.

Done: coverage on the package measurably rose (or the report says why it
should not move), every new test is shown to bite, deletions and tests are in
separate commits on your job branch, and `outbox/report.md` gives the
coverage before and after.

Adapted from the prior garden's `roles/cleaner`.
