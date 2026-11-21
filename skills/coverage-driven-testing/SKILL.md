---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/coverage-driven-testing"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Coverage-driven testing

Purpose: raise a package's test coverage with tests that catch real failures,
and delete code that is truly dead, one file at a time.

Tool names below (`c8`, `ava`) are the Endo projects'; use the project's own.

## Procedure

1. **Baseline.** From the package:

   ```sh
   npx c8 --reporter=text --reporter=html-spa npx ava
   ```

   Note each file's branch and line percentages. `coverage/index.html` shows
   the uncovered lines.
2. **One source file at a time.** Focus gives sharper tests and smaller
   diffs.
3. **For each uncovered line or branch, decide which it is:**
   - **Reachable from the public API, not yet exercised.** Write an
     integration test that drives the entry point with a realistic input and
     lets the branch fall out. It must catch a real failure, not just touch
     the line.
   - **Reachable only through a host hook, a platform condition or
     configuration the public API cannot trigger.** A targeted unit test is
     acceptable; say why the branch is not reachable from the surface.
   - **Reachable only by adversarial input.** That is an
     [adversarial-tests](../adversarial-tests/SKILL.md) job, not a coverage
     one; name it in the report.
   - **Unreachable.** Delete it, once it meets the threshold below.
4. **Re-run coverage after each change.** A new test that does not move the
   number is not exercising what you meant.
5. **Iterate by file, not by percentage point.** Three meaningful tests from
   78% to 92% beat twelve contortions to 95%.

## Platform-conditional arms

Coverage runs on Node. A line in a `browser`, `xs` or `endor` arm that a
Node-side spy reaches counts as covered though the arm never ran on its
platform. So whatever the report says:

- **A change that adds or alters a platform arm carries a test that runs on
  that platform.** An arm is a non-`node`/`default` condition key (`browser`,
  `xs`, `endor`, `hermes`, `react-native`, ...) in `exports` or `imports`, the
  platform-named file it routes to (`*-browser*.js`, `*-xs*.js`), or a
  `test:<platform>` script. In `endojs/endo-but-for-bots`: for `browser`, a
  case in the top-level `browser-test/` Playwright suite that bundles the
  package under the `browser` condition (precedent
  `browser-test/tests/sha256.spec.js`, #1290); for `xs` or `endor`, a real
  `test:xs` or `test:endor` run that CI invokes, not an `exit 0` stub.
- **If the platform test cannot be written**, the pull request body says so:
  the arm, why it cannot run there, and what covers it meanwhile. Silence is
  not a substitute.
- **Do not assert a shim-only shape without a detection guard.** An assertion
  that holds only while the engine lacks a feature (`ArrayBuffer.isView(view)
  === false` for the immutable-ArrayBuffer emulation) fails the day the
  engine ships it. Branch on detection (`typeof
  ArrayBuffer.prototype.sliceToImmutable === 'function'`) and assert the
  native shape in the other branch (#475's fix `0984dd89b`).
- A package whose `test:xs` is `exit 0` has no XS coverage. Touching its
  tests is a prompt to replace the stub, or to say why it stays.

Grounding: the `cross-platform-test-coverage` review misses
(`endojs/endo-but-for-bots` #836, #475, #1290).

## Tests

- Prefer integration tests: one covers more per test, breaks honestly when
  internals change, and takes the path a real consumer takes.
- Tests live beside the code: `packages/<name>/test/<file>.test.js`.
- A test that needs an elaborate mock or a dependency-injection rewrite says
  the code has the wrong shape. Report it for a builder; do not paper over it.

## Deletions

A function or branch is **dead** only when all four hold:

- no call site in the package's own non-test source (a test-only caller does
  not count: it is keeping dead code alive);
- no call site in any other package
  (`grep -rn <name> packages/ --exclude-dir=test --exclude-dir=node_modules`);
- no `@import` JSDoc reference in any `.js` or `.ts` file;
- not in the package's exported surface (`index.js`, `package.json`
  `exports`).

Anything less is "cover later", not dead.

```sh
grep -rn '<symbol>' packages/<name>/src/     # live callers
grep -rn '<symbol>' packages/<name>/test/    # test-only callers
grep -rn '<symbol>' packages/ --exclude-dir=test --exclude-dir=node_modules
```

If only the second hits, delete the symbol and its test in one commit.

- A deletion is its own commit, separate from test additions, citing the grep
  evidence for each block: `chore(<pkg>): remove unreachable <thing>`. Not
  `refactor`.
- **Never delete across a public API line.** Coverage cannot see external
  consumers. Ask, in the report.

## Pitfalls

- **Unimported files read 0%.** Add an import-only test, or note the gap.
- **A refactor can lower the line count** while raising the percentage.
  Report percentages.
- **A unit test of an internal helper with trivial assertions** often means
  the helper has no real callers. Check the caller graph first.
- **Forked packages inherit dead branches.** A small grammar change in a
  derived package can make a branch unreachable that is live in the parent.
  Delete it in its own commit; grep the parent to see what was shared.
- **"Schedule a microtask that throws" paths** are hard to test under AVA,
  which fails a file on an escaping rejection. Monkey-patching
  `Promise.resolve`, or a `process.prependOnceListener` that edits the
  rejection, are contortions. Leave the path uncovered with a one-line note,
  and report it "out of scope: contortion required".

Adapted from the prior garden's `skills/coverage-driven-testing`.
