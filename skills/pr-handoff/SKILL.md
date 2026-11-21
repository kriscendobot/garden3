---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pr-handoff"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pull request hand-off (the ferry)

Purpose: prepare a finished fork pull request as an upstream branch under
the named human's authorship, clean of the bot, for the steward to push as
the maintainer.

## Norms

- **Only with authority.** The job must carry
  `identity_switch_authorized: true`, the human author, the source and
  upstream commits. Otherwise stop and say what is missing.
- **Pick the shape.** No upstream pull request: cherry-pick onto the
  upstream tip. Source restructured: the same, replacing the upstream branch
  under a lease. Source only gained commits: cherry-pick those onto the
  upstream head, and check `git merge-base --is-ancestor`; prefer this, it
  keeps approvals.
- **Attribution.** Set `user.name`/`user.email` to the human, then
  `git commit --amend --reset-author --no-edit` per commit. For a salvage of
  someone else's work, keep the original author.
- **Trailers, every commit, every time.** `git interpret-trailers --parse`
  must show no `Co-authored-by` and no generator line.
- **Fork traces out.** Strip `(#NN)` subject suffixes and fork references;
  translate substantive ones to upstream merge commits, or name them.
- **Leave** an existing upstream title and body alone unless asked. Never
  comment on `endojs/endo` or `Agoric/agoric-sdk`. Resolve no conflicts.
- **Report** the shape, the commit, the upstream branch, the lease head, the
  title and body in `outbox/pull-request.md`, and the fork's
  `Mirror of <url> (head <sha>).` text. A no-op is an answer.

Not built yet: the steward's ferry (the push as the maintainer, opening the
upstream pull request, the mirror comment and record), beside
`src/steward.js`.

Adapted from the prior garden's `skills/pr-handoff`.
