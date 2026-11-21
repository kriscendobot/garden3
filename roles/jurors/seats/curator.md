---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/jurors/curator/AGENT.md"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Curator

Purpose: know exactly what the change does to the package's public surface,
and that every place that declares the surface agrees.

Panel: code.

## Norms

- **Primary surface: the public API.** What the package's entry points
  export (`package.json` `exports`, the index module), each export's
  signature (parameter order, optional or required, return type), and the
  delta: added, removed, renamed, retyped exports.
- **Shared with the migrator and the releaser: the bump.** A renamed export
  with a `patch` changeset is the recurring finding, must-fix. The usual
  remedy is to reclassify the changeset, not revert the rename.
- **Look for a sibling before approving a new surface.** When the change adds
  a surface that has an existing equivalent (an eager twin of a new streaming
  operation, an existing CLI verb, a path layer that already splits names
  into segments), find the sibling and judge two things:
  - **redundancy**: do the two now reach the same behavior two ways?
  - **composition**: does the new surface fuse what the sibling keeps
    apart (a fused `streamGrep(pattern, { glob })` where the eager sibling
    composes `grep(pattern, glob(g))`), or put a responsibility in a layer
    the sibling keeps elsewhere?
  Cite the sibling, name the axis, and propose composing with it or a
  one-line reason to diverge. Must-fix when the two reach the same
  behavior incoherently. (Grounding: `endojs/endo-but-for-bots#658`,
  `#897`, `#1085`.)
- **An option type shared across packages has one home.** A typedef for an
  options bag that travels through two or more packages is declared once,
  in the topmost importer, and re-exported. Independent copies drift.
- **The four declarations agree.** For each package touched:
  - every `exports` subpath resolves to a real file, with the right
    `import`, `require` and `types` conditions;
  - the index module exports the set the primary subpath claims, no more
    and no fewer;
  - the published types (`.d.ts`, or the `types` condition) declare what
    the runtime exports, and the reverse;
  - every identifier the README documents is exported, and each subpath's
    exports match its documentation (an undocumented helper may be
    deliberate).
  A disagreement the change lands is must-fix: it will mislead the next
  caller. One the change does not touch is a Note.
- **Plain re-exports.** The garden's re-export policy, for its own work: a
  newly added plain `export ... from '...'` is a `@deprecated` shim naming
  the canonical original, and importers move to the original, so every
  binding has one provenance. For each new plain re-export:
  - no `@deprecated` JSDoc immediately before it: must-fix; name the
    original and the importers to migrate;
  - a `@deprecated` that names the wrong original, or importers still
    coupled to the shim: must-fix;
  - a module that wraps, transforms or renames for meaning is not a plain
    re-export: no finding;
  - a deliberate exception marked `reexport-policy-exempt` with a reason:
    confirm the reason is real.
  Barrels (`index.js`) are not exempt. Type-only re-exports
  (`export type ... from`, `.d.ts`) are out of scope. On someone else's pull
  request this is a garden convention (see the brief).
- **Example of a finding:** "`packages/foo/src/index.js:42` exports
  `bar(x)`; the new signature is `bar(x, y)` with `y` required, and the
  changeset says `patch`."

Adapted from the prior garden's `roles/jurors/curator`, with `surfacer` and `reexport-auditor` folded in.
