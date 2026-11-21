---
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Library lookup

Purpose: find what the garden's library says about a term or a subject,
without knowing which source holds it, and leave the index better for the
next reader.

The library is in your home under `reference/library/`, at the commit
`reference/reference.yay` names (`library: commit`). It is for reading:
nothing written there survives. Its `README.md` lists the axes;
`conventions.md` says what a file looks like. Its files were written in the
prior garden, so where they name its scripts, roles or `journal/` paths, read
that as history.

## Look up

1. **Grep the keyword index**, never read it whole:

   ```sh
   grep -i "<term>" reference/library/keywords.md
   ```

   A hit names a concept: read `concepts/<id>.md` (a definition, a table of
   sections, see-also), then the sections it points to that you need.
2. **Try the term's other forms**: a symbol's bare name and its file name,
   casing, a phrase's key word.
3. **Grep the sections**: `grep -ril "<term>" reference/library/sections/`.
   Read the matches and decide which answer you, and which only mention it.
4. **Look sideways**: `topics/README.md` for an adjacent subject,
   `sources/README.md` for an adjacent document, `roles/` for your role's
   landing page, `exports/` before you write a helper a project may already
   export.
5. **Nothing found is an answer.** Say what you tried. It is a gap in the
   library; name it in your report. Do not fabricate a near match.

Check a section's `status` and `source_commit` before relying on it: it was
true of the source at that commit, which may since have moved. Where the
project checkout you are working in disagrees, believe the checkout.

## Leave the index better

When a lookup was harder than it should have been, propose the fix in
`outbox/library.yay`, one record written with `stringify` from
`src/yay.js`:

```yay
edits:
  - path: "keywords.md"
    why: "reached hardened-javascript by grepping sections for harden"
    body: "the whole new file"
```

- **A shortcut**: the term you used was not in `keywords.md` but you found
  the concept another way. Add `- <term> -> <concept-id>`, beside the
  concept's other terms; backticks for code symbols.
- **A confusion**: a section looked like the answer and was not. On the
  concept page, add it under `## Common confusions`, saying what it is
  about instead.
- **A missing concept**: no page existed and you read enough to write one.
  Write `concepts/<id>.md` in the shape `conventions.md` gives, with
  `status: draft`, and its terms in `keywords.md`. If you only skimmed,
  name the gap in your report instead.

Each `body` is the whole file as it should be, starting from the copy under
`reference/library/`. Proposals are edits to the index, concepts and their
confusions; sections, sources and topics change only when a source is
ingested. Name what you proposed in `outbox/report.md`. Landing a proposal
on the `library` branch is not built yet: a maintainer lands it.

## Report

What answered you: the concept in a sentence, the section that mattered with
its source and commit, and any proposals you left.

Adapted from the prior garden's `skills/library-lookup`
(`upstream/port-log.yay`).
