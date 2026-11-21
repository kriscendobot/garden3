---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/rename-discipline"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Rename discipline

Purpose: rename only when the rename carries information, and keep
accidental renames out of a diff. For anyone who touches existing
identifiers, file names or test-local bindings: building, fixing, rebasing,
cleaning, and the review seat that checks style.

## The rule

A name already on the base stays, even when the local context tempts an
"improvement". A diff full of gratuitous renames makes the reviewer separate
the real change from the cosmetic one, and trains them to skim where they
should read.

## Warranted

- The name is wrong against current behavior: the function no longer does
  what it says.
- The name shadows a binding in scope and the shadow matters (a test that
  imports `random` and defines its own `random`). Rename the local, with the
  reason in the commit message.
- A project naming guide demands it.
- The rename is the point of the work: the job or the design asks for it.

Anything else is gratuitous. If you cannot give the reason in one short
sentence, do not rename.

## How it goes wrong

- **Test-local bindings.** Destructuring `random` and calling it
  `pickRandom` or `r` with no conflict. Keep the imported name, so a reader
  comparing the test with the documented surface need not translate.
- **Clean-up inside a feature.** Renaming neighboring identifiers in a
  feature change makes them look part of the feature. Take them out, or make
  them a separate preparatory change with its own reason.
- **Matching the module to its export.** Renaming `equals.js` to
  `bytesEqual.js` because it exports `bytesEqual` is a stutter; module
  naming is its own convention.

## When a reviewer flags one

"This was better when named X", "gratuitous rename": revert it in the next
fix-up commit; do not defend it. A name's life on the base is itself an
argument, and the burden is on the renamer. If a real conflict motivated it,
say so (`local conflict with the imported random on L<n>`) and offer the
smaller fix (rename only the local, or alias the import).

## Done

Every rename in the diff has a one-sentence reason, and a rename a reviewer
flagged as gratuitous is reverted.

From a maintainer's review of
[endojs/endo#3232](https://github.com/endojs/endo/pull/3232) ("Ditto.
Gratuitous rename.").

Adapted from the prior garden's `skills/rename-discipline`.
