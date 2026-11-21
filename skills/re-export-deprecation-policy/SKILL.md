---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/re-export-deprecation-policy"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Re-export deprecation policy

Purpose: never author a plain re-export that is a second, load-bearing import
path.

A plain re-export is `export … from '…'`: named, renamed, `default as`,
`export *`, `export * as ns`. It is allowed only as a **deprecated
compatibility shim**:

1. A `@deprecated` JSDoc block immediately above it names the canonical
   module to import from instead.
2. No live code in the project still imports through it.

```js
/** @deprecated Import `makeThing` from './thing.js' instead. */
export { makeThing } from './thing.js';
```

- It applies in every project the garden changes. Barrels and `index.js` are
  not exempt.
- Type-only re-exports and `.d.ts` files are exempt.
- A file with `reexport-policy-exempt` and a reason in its first five lines
  is exempt. Only a maintainer sanctions that; never add it to get past the
  rule.
- Before committing, grep your diff for added lines with the word `export`,
  and check each new re-export (not ones already there) against the two
  obligations. There is no automatic fixer and, not built yet, no detector.

Adapted from the prior garden's `skills/re-export-deprecation-policy`.
