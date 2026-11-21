---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/gricean-maxims"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Grice's maxims

Purpose: write every report, comment, commit body, code comment and design so
that the reader's attention is not spent on words that carry nothing. Be
concise; optimize for the reader's attention.

It applies to what a worker leaves in `outbox/`, what the steward posts, and
what lands in a project. The last lasts longest: a report is read once, a
padded module comment by every maintainer who opens the file.

Source: "Be concise; optimize for reader attention",
https://gist.github.com/dckc/7d477a99086a5e21d0979ecc919aaf76. Adopted for all
communications by the maintainer, 2026-07-28.

## How, not whether

The maxims govern how a thing is said, never whether a required thing is said.
Brevity is no reason to drop the head commit, the item-to-commit map, the
declines or the verification from a pull request summary
([pr-completion-summary-comment](../pr-completion-summary-comment/SKILL.md)),
or what you did, verified and did not from `outbox/report.md`. Where a
required element feels redundant, say it more compactly.

Dropped, contract broken:

> Pushed the fixes. All review comments addressed and everything passes.

Compact, contract kept:

> Head `a1b2c3d`.
> - Null check on empty input: `a1b2c3d`
> - Renamed `tmp` to `pending`: `e4f5a6b`
> - Declined: the broader refactor of `link.js`, out of scope; a follow-up.
> Verified: `yarn test` and `yarn lint` green locally.

## Quantity: as informative as required, no more

The failure is padding.

- Lead with the outcome, then the least support for it.
- Do not restate the job back to its author.
- Report results ("`yarn test` green"), not the walk ("first I read the file,
  then I searched...").
- A review finding says the defect and its consequence ("line 42 dereferences
  `opts` before the guard on line 45; crashes when it is undefined"), not a
  lesson on null guards.

**Empty emphasis is the sharpest case.** Do not tell the reader that something
matters; show what it buys and let them conclude. "This is critical",
"importantly", "note that this is subtle", "and that is load-bearing rather
than incidental": strike them. Their tell is a contrast with no candidate:
"deliberate rather than accidental", "a real constraint, not a stylistic
one". If no reader would propose the alternative, denying it says nothing.

From a module comment on endojs/endo-but-for-bots#825, where a reviewer
asked "what do those words contribute? strike them?":

> The store's I/O is synchronous, **and that is load-bearing rather than
> incidental.** Entry rows move through the daemon's in-process handle, so
> `collectWeakEntries` can delete the rows ... before the turn completes.

The bold clause went; the sentences after it already made the argument. The
word "load-bearing" is fine where it marks which premise an argument rests
on. Asserting importance in place of showing it is not.

## Quality: only what is true and evidenced

The failure is the false claim, the most expensive kind, because it costs
trust in every later report.

- Write "not verified: could not run the browser here" when you did not run
  it.
- Do not write "verified", "works" or "passes" from reading code. That is an
  argument; call it one. Three UI criteria reported verified from inspection,
  of which one rendered, cost a maintainer a debugging session
  (endojs/endo-but-for-bots#58).
- Hedge exactly as far as the evidence is uncertain. Do not state a probable
  cause as certain.

## Relation: be relevant

The failure is the aside that makes the reader hunt for their part.

- Answer the question asked: whether CI is green is the status and the
  blocking check, not a tour of the pipeline.
- A note about an unrelated flaky test belongs in its own report, not in a
  reply about a null check.

## Manner: clear and orderly

The failure is the buried decision.

- Decision first, then the reason: "Declined: out of scope. Reason: ..."
- Delete the preamble before a decision.
- "It seems like it might possibly be the case that" is "probably".
- Order a report so it reads once, top to bottom: outcome, changes,
  follow-ups.

## Before you finish

Reread what you wrote against the four failures: padding, unevidenced
claims, asides, a buried decision. Cut what fails; never a required element.
The maxims are a lens for judgment, not a checklist; where one seems to
conflict with a required element, the element wins and the maxim tells you
to say it more briefly.

Adapted from the prior garden's `skills/gricean-maxims`.
