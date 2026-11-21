---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/sibling-family-sweep"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Sibling family sweep

Purpose: when a change generalizes an operation across a family of sibling
sites, find every sibling and check each was converted before you finish.
A change that converts some siblings and silently skips, or diverges on,
others lets a latent bug in a skipped one reach the maintainer.

It is the dual of keeping gratuitous edits out of a family: do not touch
siblings you were not asked to; but when you touch one on purpose, touch,
or consciously clear, all of them.

## When it applies

A change to logic replicated at more than one site that together hold one
invariant or share one dispatch shape. Worked examples, from
`endojs/endo-but-for-bots`:

- **Twin packages.** `packages/hex` and `packages/base64` are byte-codec
  twins with parallel `src/encode.js` and `src/decode.js`. On pull request
  #1099, hex gated its native `toHex` path on
  `bytes.buffer.immutable !== true` while base64 already dispatched on
  `ArrayBuffer.isView(bytes)`: one operation, two predicates, one wrong.
- **Duplicated helpers.** `packages/harden/make-hardener.js` and
  `packages/ses/src/make-hardener.js` are two copies of one hardener. On
  #1099 one was moved to `isMutableTypedArray` and the other still used
  `isTypedArray`. It was caught only when the maintainer asked for a scan
  for this kind of inconsistency.
- **Paired constructors.** In `packages/immutable-arraybuffer/src/lib.js`,
  the DataView and TypedArray emulations both keep the reverse buffer map.
  On #475 one set it up and the other did not, until both did it at
  creation.
- Any N sites sharing a dispatch shape or an invariant: a switch repeated
  across parsers, a guard repeated across facets, a codec pair, a shim
  installed twice, a flag that must pass through every wrapper.

## The rule

1. **Enumerate the family.** `git grep` the operation's identifiers and the
   old and new predicates across the whole repository, not only the file
   you started in. Name every sibling.
2. **Convert each, or clear it on purpose.** Each sibling uses the new
   shape, or the commit message says why not (it really differs, or it is a
   separate change). "I decided not to, because X" is fine; "I forgot it
   existed" is what this prevents.
3. **Converge divergent siblings in the same change.** A reviewer should not
   have to hold both twins in mind to see one is wrong. Land them
   consistent, or say plainly what is deferred.

A reviewer checks the same from the other side: when a diff touches one
member of a family, enumerate the family.

## Lesson

Adding freshness caching to fetches: follow a caller's `fresh` flag through
every wrapper between it and the shared helper. Six wrappers took the flag
and had to pass a zero maximum age on; a test for each wrapper's own
function, not only the helper, caught the one that did not.

Adapted from the prior garden's `skills/sibling-family-sweep`.
