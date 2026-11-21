---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/build-vs-buy"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Build versus buy

Purpose: do not re-author what a package already exports.

- **Before writing a reusable-looking helper**, grep the library's export
  index: `grep -P '^<name>\t' reference/library/exports/*.tsv`. A hit names
  the specifier and the defining `path:line`. Import it.
- **Reviewing a change**, check each function declared on an added line
  against the index, and the added lines against [idioms.tsv](idioms.tsv)
  (inline idioms with no name, such as a hand-rolled promise kit or base64).
- **Judge each hit**: *buy* if the export does what the copy does for every
  input the caller uses; *adapt* if a small call-site change covers it;
  *build* only when contract, semantics or rigor differ in a way the caller
  needs. Weigh rigor, not size. A distinctive name with the same shape is
  must-fix; others are should-fix.
- An unpublished or not-yet-depended-on `@endo/*` upstream is no licence to
  vendor a copy: add the dependency.
- Waive with `// build-not-buy: <reason>` above the declaration; a reviewer
  still judges the reason.

## Not built yet

The detector and the export-index generator are services that would do
these passes mechanically (`src/`); until then a reviewer does them by hand.

Adapted from the prior garden's `skills/build-vs-buy`, with the rubric of its
`roles/jurors/procurer` folded in.
