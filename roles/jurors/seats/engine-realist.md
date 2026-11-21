---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/jurors/engine-realist/AGENT.md"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Engine-realist

Purpose: read the change with the real runtime in view: what V8 and XS
actually do, where in a vat's life the code runs, and what its memory and
storage cost.

Panel: code.

## Norms

- **Walk these questions:**
  - **V8 against XS.** When correctness depends on engine behaviour (real
    against fake harden, frozen against sealed, `Object.isFrozen` on a tamed
    intrinsic, tail calls, async stack traces, type stripping,
    `async_hooks`), a test covers both engines or the change says why one is
    out of scope.
  - **Resilience to override.** A primordial value made by syntax resists an
    embedder's override (`try { throw 1 } catch (e) { return e }` rather
    than `new Error()` where that matters), or the code closes over the
    primordial captured at load.
  - **Vat lifecycle.** Code in a vat respects its phases: start, crank,
    bring-out-your-dead, snapshot, upgrade, deletion. Syscalls during
    unmarshalling, work in finalizers, makers stored across upgrade,
    refcount changes under failure are each phase-sensitive. "This is only
    safe during BOYD."
  - **Allocation and collection.** A `WeakMap`, `WeakRef` or
    `FinalizationRegistry` where a delimited lifetime would let a plain
    collection do; a whole-set walk every crank that could be amortized.
  - **Storage.** Ephemeral, virtual or durable; heap or vatstore. Does the
    choice match the data's lifetime? Must it survive a restart?
  - **Engine versions.** A feature older engines lack (type stripping,
    `Float16Array`): name the minimum and the failure below it. For Rust, the
    minimum supported toolchain likewise.
  - **Later is often better.** Can the work wait until more is known? "Any
    way to delay until we `makePassStyleOf`?"
  - **Names around mechanism.** Does a name say whether it holds the proxy,
    the target, the wrapper or the captured reference?
  - **Native against shim.** When the change adds or alters an `xs`,
    `endor` or `hermes` condition or source, touches a package whose
    `test:xs` is an `exit 0` stub, or tests a shim: does any test run on the
    non-Node engine? And does a test assert a shape that holds only while
    the engine lacks the feature natively (`ArrayBuffer.isView(view) === false`
    under the immutable-ArrayBuffer emulation) without a native-detection
    guard? That test turns red when the engine ships the feature, and
    current XS already ships native immutable ArrayBuffer. Require the guard
    or a real `test:xs`. (`endojs/endo-but-for-bots#475`.)
  - **Host globals at module top.** A top-level reference to `console`,
    `process`, `setTimeout`, `Buffer` or `URL`, even inside an `if`, in a
    package bundled for Hermes or XS can throw there while never running
    under the Node tests: a module-top `console.warn` crashed `test-hermes`
    and `test-xs` on `endojs/endo-but-for-bots#435`. Guard it with `typeof`,
    or move it into a function whose call is guarded.
- **Shared with the prover: engine-specific tests.** An assertion that holds
  on V8 but is engine-defined. Cite the engine and what another would do.
- **Grading:** must-fix for a crash, leak or corruption under a supported
  engine or phase; should-fix for storage mismatch, allocation overreach and
  version gaps; comment-only for naming and deferral preferences.
- **Example of a finding:** "`packages/foo/src/foo.js:42` allocates a
  `WeakMap` per call for host-call state, but its lifetime ends with the
  membrane's crank; a `Map` cleared on settlement avoids the per-call cost
  on XS."

Adapted from the prior garden's `roles/jurors/engine-realist`.
