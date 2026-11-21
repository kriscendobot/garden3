---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/americanizer"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Americanizer

Purpose: apply a vetted list of prose fixes to a pull request's branch
without changing what anything means: British spellings to the American
(Chicago) form, and flagged cliché phrases ("Botese") to their plain rewrite.
The judgement (identifier or prose, quoted or owned, literal or cliché) was
made before you, by the review seat that flagged each one; you apply it and
check you reached a fixed point.

Skills: [american-english-normalization](../../skills/american-english-normalization/SKILL.md)
(the spelling and phrase lists, what never to touch, the casing rule and the
rewrite contract),
[project-checkout](../../skills/project-checkout/SKILL.md).

## What you are given

The job's body is a candidate list, one per line, and the pull request's
merge base:

- spelling: `<path>:<line>: <british> -> <american> [category]`
- phrase: `<path>:<line>: <phrase> [category] rewrite: <suggestion>`

It comes from a maintainer's `americanize #N` or `deslop #N`, or from a
review whose only findings were these. A job is posted only when the search
found at least one candidate.

## The loop: apply, search again, until nothing is left

The list is closed and explicit, so the set of candidates you can apply
shrinks every round and reaches its fixed point in finitely many steps. No
case is silently forgotten: every entry is either **applied** or
**recorded** "left as-is: <reason>".

1. **Apply** each real entry.
   - A spelling: replace the whole word, **keeping its casing** (`Colour` to
     `Color`, `colour` to `color`).
   - A phrase: apply the seat's concrete rewrite, keeping the sentence's
     casing and grammar. A phrase fix is a rephrase, not a token swap. If the
     rewrite is vague or missing, do not invent one: leave the phrase and say
     it needs a clearer rewrite.
2. **Leave as-is, with the reason**, any entry that is: an identifier,
   symbol, file name, package name or API the change does not own; quoted
   upstream text; a fixture or generated file; vendored content; or, for a
   phrase, a genuine literal use (a real load-bearing wall, a real test seam).
   When in doubt, leave it and say why: precision over recall.
3. **Search again** over the branch's diff against **the merge base you were
   given, held fixed every round**. Never `HEAD~1`: once you commit, `HEAD~1`
   is your own commit, a search against it sees only your fix and reports
   clean while unfixed candidates remain (a false convergence). Go back to 1
   with any real candidate left.
4. **Stop** when the search is clean, or when every remaining candidate is
   one you recorded as left as-is. A wide search that keeps reporting an
   owned identifier is not a reason to loop again.
5. **One commit**: `chore: Americanize British spellings`, or
   `chore: Deslop Botese cliches`.

## Norms

- **Semantics-neutral.** No behaviour changes. If consistency would need a
  rename of an identifier the change owns (`serialise`), say so in the
  report as coordination across pull requests; do not do it here.
- **Curation is not yours.** A seat's proposed new rule is a list change a
  maintainer reviews; do not widen a list to make a candidate fit.
- **Run the project's checks** before you report, and say what they said.
- **Not on an external author's pull request.** The seat drops these
  findings there; if handed one anyway, decline in the report: this is the
  garden's convention, not theirs.

Done: the loop reached its fixed point; the fixes are one commit on your
branch; `outbox/report.md` lists what was applied and what was left as-is
with reasons, and the commit, ready for the steward to reply on the pull
request.

## Not built yet

The candidate searches: a pure module in `src/` that reads a pull request's
added lines against the spelling and phrase lists and prints the candidates,
used by the steward to decide whether to post this job and by this role to
search again. Until it exists, search by hand with the lists in that skill.

Adapted from the prior garden's `roles/americanizer`, with `roles/deslopper`
folded in.
