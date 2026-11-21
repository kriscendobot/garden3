---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/fully-qualified-github-urls"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Fully qualified GitHub URLs

Purpose: in text that will render on GitHub, every reference to a
repository, commit, branch, release, file, issue or pull request is a full
`https://` URL, so it resolves for every reader, wherever it is shown.

## The rule

GitHub autolinks `owner/repo`, `#123` and bare commit ids only inside the
same repository's rendering, and often not in another repository, a
notification mail or a copied excerpt. Expand:

- `owner/repo` to `https://github.com/owner/repo`, or keep the name as link
  text: `` [`owner/repo`](https://github.com/owner/repo) ``.
- a bare commit id to `https://github.com/owner/repo/commit/<sha>`.
- a cross-repository `endojs/endo#123` to
  `https://github.com/endojs/endo/issues/123` (or `/pull/123`).
- a bare host name to its `https://` form.
- a file meant to be followed to
  `https://github.com/owner/repo/blob/<ref>/<path>`.

Do not wrap a reference that is already a link.

## Scope

- Text for GitHub: a report the steward posts as a comment, a pull request
  description, a commit message GitHub displays. Write `outbox/report.md`
  this way, since it becomes a comment.
- Not links inside the garden's own files, which are relative.
- It formats references you may already make. It never permits a new
  cross-reference, mention or upstream comment.

## Before writing

Scan for `owner/repo` tokens (in code spans too), bare commit ids, bare
host names, and cross-repository `#N` or `repo#N`; expand each.

## A bare `#N` beside another repository

In text that names a repository other than the one it will be posted on, a
bare `#N` links to the posting repository, which is often not what was
meant. Write `owner/repo#N` or the full URL.

## Mentioning without linking

To refer back to a number already linked once in the same text, or to
discuss a literal number, suppress the autolink with backticks
(`` `#96` ``) or a space (`# 96`). A backslash does not work. Prefer
backticks. A first reference a reader should follow still gets its URL.

## Why

kriskowal, 2026-07-20, on
[kriskowal/garden#57](https://github.com/kriskowal/garden/issues/57#issuecomment-5026079913):
"Please revise all references above to fully qualified URLs. Please take
this advice generally when communicating through Github." Mentioning
without linking is dckc's, 2026-09-17, on
[kriskowal/garden#89](https://github.com/kriskowal/garden/issues/89#issuecomment-5717076414).
The bare `#N` rule followed a reply on
[kriscendobot/garden#112](https://github.com/kriscendobot/garden/issues/112#issuecomment-5817967112)
where a bare `#2` meant another repository's pull request and GitHub linked
it to `kriscendobot/garden#2`.

## Not built yet

The check that refuses to post. The prior garden's `gh` wrapper refused a
comment naming another repository that also held a bare `#N` outside code
and links. Here the steward posts every comment, so the check belongs in
`src/steward.js`, before a report is posted: refuse, and send the job's
report back rather than post it wrong.

Adapted from the prior garden's `skills/fully-qualified-github-urls`.
