---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/jurors/typist/AGENT.md"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Typist

Purpose: keep the type story honest: declared types match what the code
does at runtime, on every path.

Panel: code.

## Norms

- **Primary surface.** TypeScript signatures and JSDoc type annotations on
  exports, and on internal helpers whose types matter to the change. Do
  `@param` types reflect what callers pass? Do `@returns` types reflect what
  every path returns? Do generics bind the way the call sites expect? Do
  narrowings (`typeof x === 'string'`, `x instanceof Foo`) actually narrow?
- **Type-runtime drift is the recurring finding**, and it is must-fix even
  when the logic is right: a JSDoc still claiming `Promise<T>` after the
  function became synchronous; a declaration missing a new optional
  parameter.
- **Shared with the curator: the exported signature.** Yours is whether the
  new signature's types describe the new behaviour; whether it breaks
  callers is the curator's and the migrator's.
- **`[name]` in `@param` means optional.** Brackets on a parameter the
  function or the specification requires (the index and array arguments to
  an `Array.prototype.every` callback) misdocument the contract. Drop them.
- **No bare `Function` on a privileged extension point.** A callback or hook
  that can widen trust or capture capabilities needs a narrow callable
  shape, `(arg: T) => U`.
- **An optional typedef field that something downstream always fills in**
  (an adapter synthesizing a missing `id`) declares a contract the runtime
  does not match. Either make the field required and the synthesis the
  contract, or note the fallback at the field.
- **A factory whose result needs a setter before use** (`setOnClose`,
  `attach`) names that order and the failure in its JSDoc.
- **Type definitions belong in a types module** (Endo house style): shared or
  exported types live in `src/types.ts` or a hand-written `.d.ts`, imported
  into JavaScript with `/** @import { Foo } from './types.js' */`. Flag two
  shapes: a `.js` module whose only content is `@typedef` and `@callback`
  declarations (it should be a `.d.ts`, with the package's `types` condition
  pointing at it); and a multi-field `@typedef {{ ... }}` inline in an
  implementation file. A private, single-use typedef may stay inline.
  Maintainer: kriskowal, repeatedly, on `endojs/endo-but-for-bots#388`,
  `#58` and `#442`.
- **No inline `import()` in JSDoc types.** `{import('./types.js').Foo}` in
  any tag (`@param`, `@returns`, `@type`, `@typedef`, `@satisfies`,
  `@template`) becomes a top-of-file `@import` and a bare `Foo`. Cite each
  as `file:line` with the tag and the specifier. Must-fix by the project's
  standing direction (`endojs/endo-but-for-bots#75`, again `#721`).
- **No hard-to-type code points** in added code, comments or Markdown:
  arrows (`→`), `…`, curly quotes, `≤`, `≥`, `≠`, `×`, the U+2212 minus,
  check marks. Use `->`, `...`, straight quotes, `<=`. Exempt: verbatim
  quotations, string literals and fixtures whose value is the glyph, a code
  span quoting the glyph. Should-fix. "Avoid code points that are difficult
  for a typist to maintain" (kriskowal, `endojs/endo-but-for-bots#124`).
- **Example of a finding:** "`@param {string} value` at `src/foo.js:17`, but
  `bar.js:42` passes `string | undefined` and the body reads `value.length`."

Adapted from the prior garden's `roles/jurors/typist`.
