---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pre-push-gates"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pre-push gates

Purpose: before you leave a branch for the steward to push to a pull request,
run the checks a maintainer would otherwise have to ask for, and fix what they
find.

## Stages, in order

1. Choose the runner from `package.json` `packageManager` (or the lockfile).
2. `format`, then stage its changes.
3. Build (`build`, `compile` or `build:js`) before lint. Do not stage what the
   build produces.
4. `lint --fix`, then stage its fixes.
5. Probes on the added lines (below).
6. `typecheck`. A failure here is terminal: fix it and run the gate again.

Run each stage once, and bound its time and memory. A stage that runs out is
resource-exhausted: narrow it to the changed packages. Never retry with a
larger heap.

## Probes

Check these by reading and grepping the diff. Each has an escape marker for
the file's first five lines.

- No inline `import('...')` types in JSDoc. Use a top-of-file `@import`.
- No types-only `src/**/*.js` module. Write a `.d.ts` instead.
- No typist-hostile code points in markdown
  ([typist-friendly-code-points](../typist-friendly-code-points/SKILL.md)).
- No abbreviated identifier segments (`dir`, `tmp`, `args`, `ctx`, `idx`,
  `msg`, `db`, `err`, `id`, `ms`, `p` and the rest of the list).
- No hand-rolled primitive an `@endo/*` package provides, and no bare `Far`
  (use `makeExo`).
- No re-authoring of an export another workspace package already has.
- No plain re-export without a `@deprecated` shim.
- No literal NUL bytes in text files.

Name every stage and its result in `outbox/report.md`. A gate you did not run
has not passed.

Not built yet: the gate as a `src/` module, which the steward would run before
it publishes a branch.

Adapted from the prior garden's `skills/pre-push-gates`.
