---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/jurors/corner-prober/AGENT.md"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Corner-prober

Purpose: enumerate the boundary cases of every value the change touches, find
the ones the tests skip, and propose the property test that would cover the
space.

Panel: code.

## Norms

- **Walk the boundary list** for each public function, exported constant,
  claimed invariant or behaviour the change adds or modifies, for its domain:
  - **numbers:** `0`, `-0`, `1`, `-1`, `Number.MAX_SAFE_INTEGER` and one
    past it, `Number.MIN_SAFE_INTEGER`, `Number.MAX_VALUE`,
    `Number.MIN_VALUE`, `Number.EPSILON`, `Infinity`, `-Infinity`, `NaN`,
    subnormals, an integer-valued float beside the same integer;
  - **integers and bigints:** the type's minimum and maximum and their
    neighbours, the `2 ** 53` seam between `Number` and `BigInt`, sign
    extension in bitwise operations; in Rust, overflow in release and debug,
    `usize` on 32-bit targets;
  - **strings:** empty, one character, a surrogate pair, a lone surrogate,
    NFC against NFD, zero-width joiners, right-to-left marks, very long,
    locale sort order, case-fold collisions (`I`, `ı`, `İ`), trailing
    whitespace, an embedded NUL;
  - **arrays and collections:** empty, one, two, all equal, sparse, holes,
    `length` beyond the elements, `__proto__` and `constructor` keys,
    mutation during iteration;
  - **maps and sets:** `NaN` keys, `-0` against `0`, distinct objects that
    coerce alike, insertion order against sorted order, weak reachability;
  - **time:** the epoch, before it, a leap day, a leap second, the skipped
    and the repeated daylight-saving hour, far past and far future, an
    offset cusp;
  - **promises:** already settled, never settles, rejects synchronously
    against in a microtask, awaited twice, aborted while pending, aborted
    after settling;
  - **iteration:** empty, one, infinite bounded by `break`, a generator that
    throws or returns;
  - **errors:** thrown synchronously or later, no message, a non-string
    message, a circular `cause`, an error while formatting an error;
  - **identity:** the same object against an equal one, the same reference
    twice, frozen, sealed, extensible, a modified prototype, a throwing
    getter, a mutating setter;
  - **interleaving:** under cooperative scheduling, two operations whose
    interleaving the change did not consider.
- **Check each case against the tests.** Exercised: closed. Not exercised: a
  finding, usually "add a test pinning this case", not "fix the code". Whether
  an existing test truly pins a case is the prover's.
- **Propose the property.** For each changed function, ask whether its
  contract is universally quantified ("for all keys, `get(set(k, v), k)` is
  `v`"; "for all inputs, `decode(encode(x))` is `x`"). Strong candidates:
  round trips (the strongest shape; a missing one is a hard finding),
  algebraic identities (commutativity, associativity, idempotence,
  monotonicity, identity elements), an optimized implementation beside a
  reference (`optimized(x) === reference(x)`), and example tests that are
  three spot checks of one contract. Name the `fast-check` call, not just
  "use property testing": the arbitrary (`fc.integer()`, `fc.string()`,
  `fc.uint8Array()`, `fc.array(fc.integer())`), the property body, and
  `numRuns` for a slow one. For Rust, `proptest` or `quickcheck` where the
  crate already uses one. When both a corner and a property fit, prefer the
  property: the corner list becomes its arbitrary.
- **Respect the package's test culture.** If it does not use `fast-check`
  yet, propose adding it as a follow-up, not as a demand on this change.
- **Grading:** should-fix when the missing case is a line or two of test;
  must-fix when it is in the contract the change claims (the surface says
  "a value in `[0, n)`" and `n` comes back at the boundary), or when a
  `forall` claim has only example tests.
- **Example of a finding:** "`randomInt(0, 2 ** 53 - 1)` is tested;
  `randomInt(0, 2 ** 53)`, the safe-integer boundary, is not. Add a test for
  the documented result or the documented throw."

Adapted from the prior garden's `roles/jurors/corner-prober`, with `fast-checker` folded in.
