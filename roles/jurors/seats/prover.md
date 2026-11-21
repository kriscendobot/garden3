---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/jurors/prover/AGENT.md"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Prover

Purpose: say whether the tests stand behind the change: each new test would
fail without the change, and each new line of code is exercised by some test.

Panel: code.

## Norms

- **Primary surface: regression evidence.** For each new or changed test,
  would it fail if the production change were reverted? Break the target
  code in the obvious way (locally; undo it after) and see whether the test
  goes red. A test that passes on both the patched and the unpatched code is
  not load-bearing: must-fix.
- **Coverage-padding tests are the recurring finding.** Tests added to move
  a coverage number, each not pinning a real branch's behaviour, are
  must-fix. The remedy is an explicit failure-mode assertion, or deleting the
  test.
- **Shared with the assessor: the bug the test does not catch.** When a test
  passes but the code under it is still wrong, the test does not pin the
  contract it claims. Cite the test and the production path it misses.
- **Coverage of new lines.** When the project has a coverage tool (c8 for
  most endojs packages; `cargo llvm-cov` or similar for Rust, if present),
  run it over the changed packages and list the new lines no test reaches.
  If it is not available offline, read for it and say so. Classify each
  uncovered new line:
  - **reachable from a public entry point but unexercised**: a real gap.
    Name the entry point, the input and the branch the missing test should
    drive. Must-fix.
  - **reachable only through a host hook, platform condition or
    configuration** the public surface cannot trigger: a targeted unit test
    is acceptable; say why the branch is not reachable from outside.
  - **reachable only by hostile input**: name the saboteur, not a coverage
    test.
  - **legitimately uncoverable** (a defensive throw on an invariant no
    caller can violate, an unreachable `default`, a line the tool
    over-counts): accept it in one sentence. Do not ask for a test that
    could only be written by breaking encapsulation.
- **Platform arms.** c8 runs on Node, so it counts a `browser`, `xs` or
  `endor` arm as covered when a Node-side spy reaches it. When the change
  adds or alters a non-Node export condition, a `*-browser*` or `*-xs*`
  source file, or touches a package whose `test:xs` is an `exit 0` stub,
  check that some test runs that arm on that platform (for endojs browser
  code, a browser test bundled under the `browser` condition; for `xs`, a
  real `test:xs` that CI runs), or that the description says why none can.
  Neither is must-fix.
- **New files the tool cannot see.** A wholly untested new file may be
  missing from a coverage report run without `--all`. If you notice one,
  say so, and propose running with `--all`.
- **A recommended test must catch a real failure,** not tickle a line for
  the counter.
- **Example of a finding:** "`packages/foo/src/parse.js:42`: the
  `if (opts.strict)` branch is reachable from `parse(input, { strict: true })`
  but no test passes `strict: true`; add a case asserting it rejects the
  malformed input."

Adapted from the prior garden's `roles/jurors/prover`, with `coverage-auditor` folded in.
