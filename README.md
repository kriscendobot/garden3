---
author: "steward"
created: "2026-11-17"
updated: "2026-11-21"
---

# library

The garden's context library: reference material digested from the
projects it works on, kept apart from the shed so that it never rides a code
deploy. Each source document is split into short section files; each source
has a small index; topics, concepts and roles index the sections from other
directions.

## Where it came from

Copied whole from the prior garden: `library/` on the `journal2` branch of
`kriscendobot/garden`, at the commit [provenance.yay](provenance.yay) names.
Everything here except this README and `provenance.yay` is as it was there.
Those files were written for the prior garden: where they name its scripts,
roles, timers or `journal/` paths, read them as history, not as this
garden's machinery. `conventions.md` still holds for the shape of a file.

## How to find something

A job reads this library under `reference/library/` in its home, at the
commit `reference/reference.yay` names. The procedure is the shed's
`skills/library-lookup`; a question big enough to hand off is a
`librarian` job (`roles/librarian`). Pick an axis by what you have:

- **A term** (a code symbol, a name, a phrase): grep [keywords.md](keywords.md),
  then read the [concept](concepts/README.md) it points to.
- **A broad subject**: [topics/README.md](topics/README.md).
- **Provenance** ("what did upstream doc X say"): [sources/README.md](sources/README.md).
- **Your role**: [roles/](roles/README.md), a landing page per specialist.
- **An exported name** in a project, before writing a helper: [exports/](exports/README.md).
- **The endo-but-for-bots planning archive**: [endo-but-for-bots/](endo-but-for-bots/README.md).

All of them lead to [sections/](sections/README.md).

## How it changes

Not yet by a job. A job proposes edits (a keyword, a concept page) in
`outbox/library.yay`; landing them here, and ingesting new sources, is
designed and not built (`shed:designs/upstream.md`). Until then a
maintainer lands changes on this branch through a clone, never in the
`library/` view.
