---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/context-library"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Context library

Purpose: write documentation that an agent, not a person skimming a wiki,
reads well: arrive at the right document fast, descend only when an abstract
justifies it, and turn back when an abstract says the branch is wrong.

It applies to any tree of documents meant to be walked as context: the
library's concepts and topics, a project's notes, a design tree. A role's or
skill's file layout is fixed by its own README; this does not reshape it.

## The discipline

- **A directory is a hierarchy.** Each directory in a context tree has a
  `README.md` index. It is not a listing of filenames: it says, for each
  child, what a reader will find by descending there.
- **Children partition the parent.** The test: pick a query that fits the
  parent; can you predict from the abstracts alone which child it lands in?
  If "either of two" or "neither", repartition. When a topic will not split
  cleanly, the answer is usually a deeper tree, not a longer file.
- **Abstract first.** Every document opens with a short prose abstract,
  before any section. It names the topic in the words a query would use, says
  what is here (and, when useful, what is not), and predicts the body's value
  rather than paraphrasing it. "Notes on the project" makes the reader scan
  the body anyway.
- **The abstract is a contract.** A reader uses it as a stop condition. A
  body that does not deliver what its abstract promises is a defect: sharpen
  the abstract or fix the body.
- **Many small files over one long one.** A README with `## Section 1`,
  `## Section 2`, each half a screen, is the failure this exists to prevent:
  readers grep instead of navigate, and new material is appended instead of
  placed. Each section becomes a sibling with its own abstract.
- **Links**: relative within one tree (`./peer.md`,
  `../topic/README.md`); across trees, the path from the home's root, the
  same way every time.

## The walk

An agent reading the tree, and a [librarian](../../roles/librarian/AGENT.md)
job doing it for someone:

1. Read the parent's index.
2. Pick the child whose one-line abstract best fits the query.
3. Read that child's abstract.
4. If it fits, descend; if not, back to 2 with the next best.
5. If nothing fits at any level: "nothing found at `<path>`; tried
   `<list>`."

## Adding a document

1. **Find its directory** by walking the tree. If none fits, you are missing
   a parent partition (or, rarely, starting a new tree).
2. **Write the abstract first.** If it is hard to write, the scope is wrong.
3. **Check the siblings.** If its abstract overlaps one, repartition first.
4. **Add it to the parent's index** with a one-line abstract.

## Splitting a document

1. Find the sections that have become topics: they have their own
   subsections, are cited from outside, or answer a recurring query alone.
2. Make each a sibling file with its own abstract.
3. Rewrite the parent's abstract to predict the new children.
4. Point every link to an old section at its new file.

In a job, the library is under `reference/library/` and nothing written there
survives: propose edits in `outbox/library.yay`
([library-lookup](../library-lookup/SKILL.md)).

Adapted from the prior garden's `skills/context-library`.
