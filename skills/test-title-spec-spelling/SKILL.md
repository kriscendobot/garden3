---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/test-title-spec-spelling"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Spell spec names in test titles as the spec does

Purpose: when a test title names a method, class, property or other surface
defined by a published specification (ECMA, W3C, WHATWG, IETF), spell it
exactly as the specification does.

## When to use

- Writing or reviewing test titles that name spec-defined surfaces:
  `TypedArray` and `Array.prototype` methods, the `Promise` API, the
  iterator protocols, `Object.*` statics, well-known symbols, DOM
  interfaces, fetch, Streams, URL, RFC-defined headers.
- A review flags a misspelt surface in a title. The fix is mechanical; this
  makes it citable.

## The rule

The spec is the source of truth for casing, hyphenation and punctuation of
every named surface:

- `TypedArray` (the abstract class), not `TypeArray` or `Typed Array`.
- `subarray` (on `Uint8Array.prototype` and its siblings), not `subArray`.
- `Promise.withResolvers`, not `Promise.WithResolvers` or
  `Promise.with_resolvers`.
- `Array.prototype.toSorted`, not `Array.prototype.toSort`.
- `Iterator.prototype[Symbol.iterator]`, not `Iterator[Symbol.iterator]`.

This governs the names inside the title. The surrounding prose follows the
project's usual style.

## Why

Titles are grep targets. Someone searching the suite for `subarray` should
find every test of `Uint8Array.prototype.subarray`; a `subArray` hides one.
Failure output is easier to read too: a reviewer seeing
`'(TypedArray|Buffer).(slice|subArray) on freezable TypeArray'` cannot tell
at once which surface failed. And a title that diverges from the spec
suggests, wrongly or not, that its author did not read the spec.

Lesson: that title, on `endojs/endo-but-for-bots#417`
(`packages/immutable-arraybuffer/test/immutable-arraybuffer-shim-slice.test.js`),
had both misspellings; review caught them and the rule followed.

It composes with [regression-evidence](../regression-evidence/SKILL.md) (what
the test proves) and
[test262-independent-assertions](../test262-independent-assertions/SKILL.md)
(how its facts are asserted). Adversarial tests follow it too.

Adapted from the prior garden's `skills/test-title-spec-spelling`.
