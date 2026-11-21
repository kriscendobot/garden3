---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/test262-independent-assertions"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# test262: one assertion per metadatum

Purpose: when a test262-format test pins several independent facts about a
surface (method names, `.length` values, accessor shapes,
`Symbol.toStringTag`, prototype links), assert each on its own line with
its own message naming the exact property. Never join them into one string
or array and compare it once.

## When to use

- Writing or reviewing a test262 test that checks more than one property of
  an intrinsic or object: intrinsic-metadata conformance tests, method-table
  pins, `.name` and `.length` sweeps, `Symbol.toStringTag` and
  prototype-chain checks.
- A review flags a joined assertion. The fix is mechanical.

## The rule

Not this:

```js
var metadata = [
  WeakSetPrototype.add.name,
  WeakSetPrototype.add.length,
  WeakSetPrototype[Symbol.toStringTag],
  prototypeOf(WeakSetPrototype) === Object.prototype,
].join('|');
assert.sameValue(metadata, 'add|1|WeakSet|true', 'the method table … agree');
```

This:

```js
assert.sameValue(WeakSetPrototype.add.name, 'add', '%WeakSet.prototype%.add.name');
assert.sameValue(WeakSetPrototype.add.length, 1, '%WeakSet.prototype%.add.length');
assert.sameValue(
  WeakSetPrototype[Symbol.toStringTag],
  'WeakSet',
  '%WeakSet.prototype%[Symbol.toStringTag]',
);
assert.sameValue(
  prototypeOf(WeakSetPrototype),
  Object.prototype,
  '%WeakSet.prototype% chains directly to %Object.prototype%',
);
```

Where the joined form compared a boolean (`=== Object.prototype`), the split
form asserts the identity itself, which says more when it fails. Prefer
asserting the value over a boolean derived from it.

## Why

A joined assertion fails opaquely: one drifted property gives a whole-string
mismatch (`'add|1|WeakSet|true' !== 'add|1|WeakSet|false'`) that the reader
must diff by eye, which is worst across hosts, where naming the diverging
surface is the point. Separate assertions name the property that drifted,
and each message is a grep target. A few lines buy exact attribution.

Directive: @kriskowal on `endojs/endo-but-for-bots#1078`: "Please make each
metadatum an independent assertion. Please consider this a rule in general
for test262 construction going forward." It applies with
[test-title-spec-spelling](../test-title-spec-spelling/SKILL.md).

Adapted from the prior garden's `skills/test262-independent-assertions`.
