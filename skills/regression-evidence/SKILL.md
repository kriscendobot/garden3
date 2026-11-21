---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/regression-evidence"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Regression evidence

Purpose: prove each new test is load-bearing by showing it fails when the
code it covers is broken. A test that passes whether or not the code is
right is not a regression test.

The same holds for any claim of equivalence the code, comments or documents
make: it needs a test that would fail if it stopped being true.

## Procedure

After committing a new test:

1. **Break the smallest unit** of the code path it covers. For a lint rule,
   comment out a branch and see an invalid fixture change. For a visitor,
   mis-assign one intrinsic. For a diagnostic, remove the new check and see
   the old, cryptic error come back.
2. **Run the test.** It must fail, with a message you recognize.
3. **Revert the break.** `git stash` before it makes this mechanical.
4. **Run it again.** It must pass.
5. **Write a regression-test note** in your report (and in the pull request
   text, if you write one): the break, the failure you saw, the revert.

## What it catches

- A test asserting something trivially true (a reflexive identity) that
  never reaches the new code.
- A test that leans on another test's side effect, so removing the new code
  fails the other test first.
- A fixture covering a pattern the new code does not actually handle.

## Pitfalls

- **Small and reversible breaks.** Stash first.
- **Property-based tests** need another demonstration: narrow the property
  to hit the boundary deterministically, or seed the generator.
- **"An existing test covers this" is not evidence.** Async iterators alone
  have several teardown shapes (done on resolution, not done because the sink
  stays open, rejection mid-stream, a `throw` from upstream). A test of one
  will not catch a regression in another. Name the shape the borrowed test
  covers, and check that the fix's failure mode matches it.

## Equivalence claims need a test

When a comment, JSDoc, README or commit message says one form is
"equivalent to" another (`random()` returns `randomUint53(source) * 2 **
-53`; the IETF nonce form is equivalent to the 8-byte form at counter 0; a
new helper produces "the same bytes" as the code it replaced), that is a
contract, whether or not its author meant one. Without an assertion it
drifts: either side changes in a refactor and the claim goes silently false.

1. State it as a test: a small input, or a fixed seed, both sides computed,
   compared with the strongest comparator available (identity for
   primitives, deep equality for byte arrays, a golden vector for large
   outputs).
2. Run it. If it fails, the comment was wrong: fix comment and test
   together.
3. Then break one side and see it fail, as above.

Lesson: @kriskowal on `endojs/endo#3232`, on a JSDoc line claiming
`random()` equalled `readU53() * POW2_M53`: "Let's add an assertion to the
test suite to make sure this equivalence sticks."

### A dependency upgrade is an equivalence claim

A major version bump claims, without saying it, that the project's own call
sites behave the same before and after. Green CI only shows the existing
tests still pass; the call site may be reached only by a path the suite
mocks or skips. Show it differentially:

1. Find the project's call sites into the package (grep the import; the
   headline API is often not the one used).
2. Write one probe that drives the project's real function against a local
   fake of what the package talks to (an HTTP server on port 0, a stub
   transport), recording what the dependency sent and asserting on what it
   parsed back.
3. Run it on the incoming version, then on the outgoing one. Both must pass
   the same way. The second run is what makes it evidence: passing only on
   the new version says it works, not that nothing changed.

Your slot has no network. The outgoing version must already be on hand (in
the checkout's history or a cache the job provides); if it is not, say the
second run could not be made rather than skipping it silently.

Prefer this to reading a changelog whenever the upgrade crosses a major
version. A changelog lists the breaks its author knew of; the probe
measures the wire. Lesson: `openai` 4 to 6 on
`endojs/endo-but-for-bots#870`. The changelog scoped the one breaking change
to an API the package did not use, so a reading would have said
"compatible". Driving the real provider against a fake server on both
versions gave eleven matched assertions each, and showed the detail a
reading would most likely have got wrong: `max_tokens`, deprecated at the
API, is neither removed nor rewritten by the v6 client and still reaches
the wire.

## Output

A regression-test note per new test (the break, the failure, the revert),
and for an equivalence or an upgrade, the test or the two probe results
side by side. A reviewer treats a missing note as a finding.

Adapted from the prior garden's `skills/regression-evidence`.
