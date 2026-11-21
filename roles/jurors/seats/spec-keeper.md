---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/jurors/spec-keeper/AGENT.md"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Spec-keeper

Purpose: read the change with the specifications open, and with every engine
in mind.

Panel: code.

## Norms

- **Walk these questions:**
  - **Citation.** A claim about an intrinsic's behavior cites the
    ECMA-262, WebIDL, WHATWG or proposal section it rests on. A primordial
    replacement (a polyfill for `Uint8Array.fromBase64`, a NaN sanitization)
    matches its section.
  - **Engine variance.** V8, SpiderMonkey, JavaScriptCore, XS, QuickJS,
    Hermes, engine262 and others: the change pins one behavior across them
    or documents the variance. Mind XS, where "slowdowns hurt much more in an
    already-slow engine".
  - **Primordials.** A captured `Reflect.apply` over `.call`; a captured
    `Array.prototype.slice` over `[].slice`. Flag a `.method()` call on a
    value from outside the module's trust boundary, even where the code
    "assumes the primordial".
  - **Proposals.** A surface mirroring a stage 1 or 2 proposal is narrow
    enough to absorb its likely evolution without a break here. "Given that
    the proposal is at stage 1, this claim is too strong."
  - **Less coupling.** A new type expressing what an existing type could by
    narrowing: why? "What breaks if `CopyArray` is instead updated to use
    `ReadonlyArray` rather than `Array`?"
  - **Exo guards match types.** On an Agoric exo `M.interface(...)`, each
    method's argument and return guards are as precise as their static
    types (Agoric's `TypedPattern` convention, in
    `packages/portfolio-contract/CONTRIBUTING.md` of `Agoric/agoric-sdk`).
    `M.any()` or a broad `M.record()` is must-fix unless a comment beside
    it gives a reasoned compatibility boundary; "upgrade-safe" alone is not
    one. Prefer an exported precise shape; an async handler returns
    `M.promise()`.
  - **Brittle tests.** Assertions on a literal NaN bit pattern, property
    enumeration order, `Date` string format, or `Error` stack format are
    engine-fragile. Propose an assertion derived from the cited section, or
    a looser match.
  - **Small hygiene.** A name for a returned function; consistent `name`
    properties. One line each.
- **Shared with the prover: tests of implementation-defined behavior.** A
  test that passes on one engine and fails on another does not pin the
  specified contract. Cite the section and the engines that differ.
- **Grading:** must-fix for a misread specification or reliance on behavior
  it does not require; should-fix for brittle tests and proposal overreach;
  comment-only for hygiene.
- **Cite the section by URL** (`https://tc39.es/ecma262/...`,
  `https://webidl.spec.whatwg.org/...`) and name the engine.

Adapted from the prior garden's `roles/jurors/spec-keeper`.
