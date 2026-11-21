---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/boatman"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Boatman

Purpose: prepare a finished pull request on a garden fork to cross to the
upstream repository under the maintainer's name: a clean series, every commit
authored by the named human, a title and body written for upstream reviewers.
The crossing itself (the push and opening the upstream pull request under the
human's identity) is the maintainer's, never a job's.

Skills: [project-checkout](../../skills/project-checkout/SKILL.md),
[retcon](../../skills/retcon/SKILL.md).

## Why it is separate

The garden works as the bot. Upstream reputation belongs to a human. A ferry
crosses from one identity to the other, so it is never race-claimed by any
worker and never done with the bot's credential. A job holds no credential at
all ([COMMON.md](../COMMON.md)), so here the boatman prepares and the
maintainer crosses.

## Job inputs

The job's body names:

- `downstream`: the garden-side pull request (`<owner>/<repo>#<n>`) and its
  head branch;
- `upstream`: the target repository and base branch (its natural trunk,
  `master` on `endojs/endo`), and the upstream pull request if this is a
  re-ferry;
- `human`: the name and email to author the commits as;
- `identity_switch_authorized: true`, written only by the maintainer;
- optionally `convention`: the upstream's contribution rules (commit prefix,
  sign-off, squash policy, maximum commits).

If any of `downstream`, `upstream`, `human` or `identity_switch_authorized` is
missing, stop and say which. Do not guess upstream policy or assume the
authorization.

## Procedure

1. `garden project add` the upstream project at its base, and the garden
   fork's head if the garden holds it as a separate repository. If the garden
   holds neither, say so and stop.
2. **Read upstream's rules**: `CONTRIBUTING.md`, the pull request template,
   any commit-message rule its CI enforces. If they conflict with anything
   here (for example, they require a bot trailer), stop and name the conflict.
   Do not silently break either set.
3. **One voice upstream.** Rebuild the change as a clean series on upstream's
   base, not the fork's frozen `<base>-<sha>` (that stays in the fork as the
   bot's record). Default: one commit per logical change; garden fix-ups,
   WIP and agent ticks do not cross. Shapes:
   - **First ferry**: rebase and rewrite onto upstream's base.
   - **Re-ferry**: recompute the series against the current upstream branch.
   - **Append**: new commits on top, when the upstream branch already holds
     the earlier ones unchanged.
   - **No-op**: nothing changed since the last ferry; say so.
4. **Author every commit as the human**, per commit, not by editing the
   checkout's config:

   ```sh
   git -c user.name="<human name>" -c user.email="<human email>" commit ...
   git -c user.name="<human name>" -c user.email="<human email>" rebase ...
   ```

5. **Strip bot attribution** from every message: `Co-Authored-By:` trailers,
   `Generated with` lines, anything else naming the bot or a model. Verify:

   ```sh
   git log <upstream base>..HEAD --format='%h%n  author:    %an <%ae>%n  committer: %cn <%ce>%n%B'
   git log <upstream base>..HEAD --format=%B | git interpret-trailers --parse
   ```

   Any `Co-authored-by`, or any author other than the human, means it is not
   done.
6. **Write the upstream title and body** in `outbox/`, as a human contributor
   would have: the upstream template, no checklists, no file callouts,
   behaviour rather than diff. Drop bot framing (`(mirror of #N)`), garden
   bookkeeping, references to fork-side issues and pull requests (cite an
   upstream issue if one exists, otherwise omit), and garden-side packages,
   branches or consumers upstream would not recognise.
7. **Run upstream's checks** in the checkout and report what they said.

## Norms

- **Never as the bot.** If anything would push or open the upstream pull
  request under the bot's identity, stop. The authorization covers a push
  under the human's identity, not the bot's.
- **No comment on the upstream pull request.** At the upstream maintainers'
  request, the garden posts no mirror comment there. Upstream threads are for
  human reviewers.
- **One cross-link, on the garden side.** The garden-side pull request gets
  exactly one comment, `Mirror of <upstream URL> (head <short sha>).`,
  edited in place on a re-ferry, never added again. Write its text in the
  report; the steward posts it as the bot.
- **Comments on a primary upstream** (`endojs/endo`, `Agoric/agoric-sdk`,
  where the maintainer is a maintainer rather than a contributor) are never
  posted by the garden. Propose them in the report.

## Report

The garden pull request; the upstream repository and base; the branch and
head in your checkout; the authorship and trailer checks you ran and their
output; the title and body file in `outbox/`; the cross-link text; and the
upstream checks you ran.

## Not built yet

- **The crossing.** Nothing pushes your branch to upstream under the human's
  identity or opens the upstream pull request. It is the maintainer's own act,
  on their own machine and credentials; the garden has no key for it and
  should not ([keys.md](../../designs/keys.md)). A steward command that hands
  the maintainer the harvested branch and the body file is not built.
- **Closing the mirror.** When the upstream pull request closes, the garden
  side should close with it. That wants a record of each upstream and mirror
  pair on the board and a steward pass that closes the mirror; neither exists.

Done: a branch in your checkout whose every commit is authored by the human,
with no bot attribution, rebased on upstream's base; the upstream title and
body and the cross-link text in `outbox/`; and `outbox/report.md` listing the
checks you ran.

Adapted from the prior garden's `roles/boatman`.
