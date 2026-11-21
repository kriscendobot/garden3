---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/xs-debugging"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# XS debugging

Purpose: diagnose an XS value-stack overflow, find the JavaScript that caused
it, and choose between the targeted fix and the coarse one.

XS is the Moddable JavaScript engine. Agoric's `xsnap` worker runs on it
(`packages/xsnap`, `packages/swingset-*` in `Agoric/agoric-sdk`: a contract
bundle import or a vat upgrade runs user code under XS), and so do Endo's XS
builds and the `xs2rust-endor` port (`endojs/endo-but-for-bots#600`), where
XS behavior is what is being ported, so any divergence is an XS question.
This is engine knowledge; reproduce with the project's own harness.

## The signals

One fault, rendered differently at each layer:

| Layer | What you see |
| --- | --- |
| XS | exit code **12** (`E_STACK_OVERFLOW`), `exited: stack overflow` |
| a metered worker | `Stack meter exceeded` |
| swingset delivery | `Vat Creation Error: Stack meter exceeded`, `vat-upgrade failure` |
| slog, flight recorder | a delivery record with `{"#error":"Stack meter exceeded","errorId":"error:liveSlots..."}` |

## Width, not depth

An XS value-stack overflow is often the stack's **width**, not deep
recursion. XS gives each machine a fixed value stack (4,096 slots in the case
this was learned from). Besides deep recursion, a single expression can
materialise a very wide set of live slots at once.

The canonical offender is a wide `.flatMap(...)` (or `.map(...)`) building a
large collection during module evaluation. `@agoric/internal/src/hex.js`
built its `decodings` table with `new Map(encodings.flatMap(...))`, putting
about 1,024 live slots on the value stack together. That tipped a 4,096-slot
machine over during the bundle import, before any message was delivered.
Native XS `flatMap` spreads its intermediate arrays onto the value stack, so
the width is real.

Tells:

- It fails **at import or module evaluation**, not on a later delivery.
- The trace is **shallow**, not thousands of self-recursive frames, and sits
  in an array builtin (`flatMap`, `map`, spread).
- The code did not change; an input grew. In the case above `hex.js` was
  byte-identical between two releases, and the later bundle simply crossed
  the threshold.

## Symbolicating a native crash

When exit 12 is not enough, interleave the C stack with symbolicated JS frames
(function, file, line), so a native overflow reads as the JavaScript that
caused it:

1. Build XS patched to walk its own frame stack at the overflow and print each
   JS frame's function, file and line beside the C frames.
2. Run the failing import under that worker.
3. Read the interleaved trace: the deepest JS frames name the call site.
4. Check the slot accounting: count the live slots the offending expression
   materialises against the machine's `stackCount`.

Keep the patch and its write-up on a methodology branch of the project; this
skill is the procedure, not the patch.

## Remedies, targeted to coarse

1. **Narrow the expression (preferred).** Replace
   `new Map(coll.flatMap(...))` with a `new Map`, a bounded `for` loop and
   `.set()`. One entry at a time instead of a whole intermediate array: one
   call site, and the import goes from overflow to clean on the stock stack.
   Prove the map is built with the same entries.
   - **Caveat**: this removes the spike but not the baseline (about 2,000
     live module-function closures in that case). A later widening at module
     scope can trip the stock stack again. The structural remedy is splitting
     the bundle into sub-module functors (`bundle-source`, esbuild) so they
     are not all live at once.
2. **Raise the compiled `stackCount` (coarse).** A taller value stack also
   fixes the import. Its cost is **not** snapshot incompatibility: XS's
   snapshot reader (`fxReadSnapshot` in `moddable/xs/sources/xsSnapshot.c`)
   checks only `XS_MAJOR_VERSION`, `XS_MINOR_VERSION`, the architecture byte
   (`sizeof(txSlot)`) and the signature (`"xsnap 1"`), and `stackCount` is
   none of them. A restored machine is sized from its snapshot, so old
   snapshots stay loadable, and only fresh machines get the taller stack (a
   vat upgrade starts a fresh heap, so its import does). The real cost is
   **determinism**: a taller binary writes different snapshot bytes, so in a
   replicated system (a chain) every validator must cut over together at an
   agreed height. Use it for a systemic width problem, not one call site.

## Procedure

1. **Classify.** Map what you see to "XS value-stack exhaustion". From when
   it fires, decide width (import time) or depth (delivery time).
2. **Localise.** Read the shallow trace for the builtin at its tip, or run the
   instrumented worker.
3. **Count the slots** the expression materialises against `stackCount`.
4. **Reproduce** with the project's harness: for agoric-sdk, a `createVat`
   import A/B against real chain state, or the faithful contract
   `upgrade(bundleId)` path; for Endo, its XS tests.
5. **Fix** with the loop rewrite, and check the collection is identical. Reach
   for `stackCount` only for a systemic problem, and name the lockstep
   cut-over.
6. **Prove the flip.** A/B the control (overflows) against the patch (imports
   cleanly) on the same worker, and cite the exact difference (for example,
   one `.flatMap(` removed). "Verified" means you ran it.

Scope: analysis and runs of the open-source XS worker and public bundles, in
your checkout. No interaction with upstream repositories.

Adapted from the prior garden's `skills/xs-debugging`.
