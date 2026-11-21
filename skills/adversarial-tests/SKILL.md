---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/adversarial-tests"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Adversarial tests

Purpose: attack each invariant a module claims, with a list of inputs and
orderings a regular review misses, and either pin the module's defense in a
test or surface the bug.

Walk the list once per invariant the module asserts. Skip a category only
when it truly does not apply; when unsure, include it. Used two ways: a job
asked to "stress-test the invariants of `<module>`" writes tests; a reviewer
(the `saboteur` lens, or a security or correctness review) reports findings.

## The list

### Boundary

- Empty input: `""`, `[]`, `{}`, `new Map()`, `new Set()`.
- One element where the code may assume zero or many.
- Off by one at `length - 1`, `length`, `length + 1`.
- Range edges: `2 ** 31`, `2 ** 31 + 1`, `2 ** 32`, `2 ** 53`,
  `Number.MAX_SAFE_INTEGER`.
- Sentinels: `-0`, `+0`, `NaN`, `Infinity`, `-Infinity`.

### Type confusion

- A `BigInt` where a `Number` is expected, and the reverse.
- `undefined` versus a missing argument versus `null`.
- A `Symbol` as a key, value or argument.
- A `Proxy` standing in for a plain object.
- A frozen object where the code expects to set a property.
- A class instance where `Object.create(null)` is expected, or the reverse.
- A passable that is also callable (a hardened function given a
  non-function pass style).

### Hostile values

- A `Proxy` whose getter throws.
- A `Proxy` whose getter returns a different value each time.
- An iterator that throws on `next()` after the first call.
- A `document.all`-like value: `typeof x === 'undefined'` yet
  `x !== undefined`.
- An object whose `toString`, `valueOf` or `Symbol.toPrimitive` throws.
- A circular structure, where the code recurses.
- A lone surrogate (`'\uD800'`): not well-formed UTF-16.
- A `constructor` that is an accessor whose getter throws.

### Reentrancy and ordering

- A callback that re-enters the function that called it.
- A `then` that calls back synchronously (a user-supplied thenable can).
- An `async` callback the code forgets to `await`.
- A skipped or reordered initialization step.
- Lookup before write, write after revocation, send after cancel.

### SES

- A hardened input the code tries to mutate.
- An object from a child compartment, where the code expects the start
  compartment's prototype.
- A `passStyleOf` claim on a compartment-bound value.
- Behavior under `--feral-errors` versus the default taming, when the test
  depends on stack visibility.

### Timing and state

- Two concurrent calls on shared state: even single-threaded, async
  resolution can reorder them.
- Cancellation mid-operation.
- A `Promise.race` that never settles, paired with a finaliser.

## Writing the test

1. **Name the invariant attacked**: "rejects a Proxy whose getter throws on
   `.length`", not "edge case 4".
2. **State the attack** in a one-sentence comment.
3. **Assert the specific failure the module claims**: the error class and a
   message pattern. Never let `t.throws` accept any error.
4. **A clean pass is evidence too**: it ships as defensive coverage. If the
   module misbehaves, that is a bug, not a test: report it separately; do not
   fix it inside the test commit.

## Reporting a finding

One line each: the invariant (a sentence), the attack (a sentence), the
verdict: **real concern** (must-fix or should-fix, with `file:line`),
**mitigated** (worth pinning later), or **out of scope** (the module does not
claim it).

## Pitfalls

- **The list is endless.** Stop where the next attack tests a property the
  module does not claim.
- **A test that passes without reaching the code**: a `t.throwsAsync` against
  a method that does not exist passes for the wrong reason. Pin the message.
- **Snapshots of hostile output**: test-runner pretty-printers can crash on
  odd prototypes. Check identity or messages instead.
- **Written from the implementation**: an invariant test must read against
  the documented contract alone. Otherwise it is a unit test.
- **Everything in one file**: one file per invariant cluster keeps failures
  focused.

Adapted from the prior garden's `skills/adversarial-tests`.
