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
path. A plain re-export is allowed only as a deprecated compatibility shim,
with its importers moved to the original.

This is the garden's one statement of the rule. Roles point here rather than
restate it. It applies in every project the garden changes, not only the Endo
ones, unless the project's own contribution rules say otherwise.

Origin: @erights asked on `endojs/endo-but-for-bots` #475 that the garden not
only follow the project's re-export policy but prevent every future violation
and never author a new one. @kriskowal approved the proposal and settled five
questions; they are the decisions marked below.

## What a plain re-export is

A module surfacing a binding it does not define, re-emitting another module's
export unchanged: the `export … from '…'` family.

```js
export { x } from './original.js';           // named
export { x as y } from './original.js';      // renamed: still plain
export { default as x } from './original.js';
export * from './original.js';               // wildcard
export * as ns from './original.js';         // namespace
```

## The rule

The rule is not "never re-export". It is: **a plain re-export must be a
deprecated compatibility shim, not a load-bearing second import path.** Two
obligations travel together.

1. **The re-export carries a deprecation.** A `@deprecated` JSDoc block sits
   immediately above the re-export (decision 2) and names the canonical
   module importers should use instead.
2. **Importers are migrated to the original.** No live code in the project
   still imports through the re-export. The shim exists only to spare
   external callers that have not moved yet, on a path to removal.

Why: hardened JavaScript and Endo value explicit provenance. Each binding has
one canonical origin, so the dependency graph, tree-shaking, and a reader's
"where does this come from?" all reach the real definition, not a barrel that
launders it.

A compliant shim:

```js
/**
 * @deprecated Import `makeThing` from './thing.js' instead; this re-export is a
 * compatibility shim scheduled for removal.
 */
export { makeThing } from './thing.js';
```

## Scope and exemptions

- **Every project (decision 4).** Not only the Endo forks. Apply it to
  whatever project your job changes.
- **Barrels and `index.js` are not exempt (decision 1).** A new barrel that
  re-exports a package's surface is a plain re-export like any other: make it
  a deprecated shim, or mark the file (below). There is no automatic
  entry-point exemption.
- **Type-only re-exports are exempt (decision 5).** `export type { T } from
  '…'`, `export type * from '…'`, a per-specifier `export { type A } from '…'`,
  and any `.d.ts` file. Types have no runtime provenance to launder. Only value
  re-exports are policed.
- **The file marker.** A file may opt out with the literal
  `reexport-policy-exempt` in its first five lines, with the reviewed reason.
  This is the only escape hatch: a deliberate, reviewed exception, including a
  barrel a maintainer has sanctioned. There is no per-project opt-out. Do not
  add the marker yourself to get past the rule; add it only where a
  maintainer has sanctioned the exception, and say so in your report.

```js
// reexport-policy-exempt: <the reviewed reason>
export { a, b, c } from './surface.js';
```

## Checking your own change

Before you commit, check what you added (decision 3, in the order the
maintainer set: cheap first).

1. **Heuristic.** Does the diff add a line with the bare word `export` in a
   source file (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.tsx`, `.mts`, `.cts`;
   never `.d.ts`)? A new `export … from` always does. If no added line has
   it, there is nothing to check.

   ```sh
   git diff <base>...HEAD -U0 -- '*.js' '*.mjs' '*.cjs' '*.jsx' '*.ts' '*.tsx' '*.mts' '*.cts' \
     | grep -E '^\+.*\bexport\b'
   ```

2. **Only what is new.** Compare the file's re-exports before and after. A
   re-export that was already there is not yours to police. One that changed
   only by a binding rename, at the same place, from the same source module,
   with the same form and the same number of bindings, is the old one. One
   that gained a binding is new.
3. **Deprecated or not.** Drop any new re-export with a `@deprecated` JSDoc
   block immediately above it. What remains is a violation: make it a shim
   and migrate its importers, or remove it and import from the original.
4. **Judge the shim.** Does the deprecation name the right original module?
   Have the importers in the project actually moved? A shim whose importers
   still use it is not compliant.

There is no automatic fixer. Complying takes judgment: which importers to
move and what the message says.

## When reviewing

A reviewer applies the same four steps to the change under review, and
reports each violation with its `path:line`, the form (named, wildcard or
namespace), and what the shim or the migration should be.

## Not built yet

A deterministic detector for steps 1 to 3 (a parse of the file before and
after, the set difference of value re-exports, dropping the deprecated ones),
run before a change leaves a job. The prior garden ran one as a pre-push
probe with a vendored Babel parser; neither the probe nor the parser is
carried here. Until it exists, check by hand as above.

Adapted from the prior garden's `skills/re-export-deprecation-policy`.
