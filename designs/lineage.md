---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Lineage and the cutover

The garden goes into a **fresh repository**. The existing one is moved aside
whole. This supersedes the earlier plan of keeping the repository and
archiving its branches. The procedure itself is on the `gate` branch:
`cutover/RUNBOOK.md` and `cutover/cutover.sh`.

## The decision

- The existing GitHub repository is renamed (proposed: `garden-prior`; a
  parameter) and then archived, read-only. It keeps its 65 branches, its
  issues and pull requests, and everything attached to it.
- A new repository takes the original name. It shares no git history with the
  old one. Its default branch is `main`: a README and the setup wizard.
- The prior garden is recorded as the immediate ancestor by reference
  ([ANCESTRY.md](../ANCESTRY.md)), and history is borrowed only as needed
  ([upstream.md](upstream.md)).

So branch names here need not avoid the old ones, and the new repository
needs no namespace for them. (`refs/archive/` remains, for this repository's
own truncated history.)

## The hazard

Hosts of the prior garden fetch from the repository's URL. After a rename,
GitHub redirects the old URL to the renamed repository **only until a new
repository takes the old name**. From that moment a prior host that was not
stopped or repointed is talking to the fresh repository, which has none of
the branches it expects (`main2`, `journal2`) and does have a `clients` branch
whose purpose is to control hosts that watch it. A prior host does not know
that branch and will not obey it; what it will do is fail every fetch, and,
where its code pushes, try to push its old branches into the new repository.

Two things in the prior garden's code make repointing more than a URL change:
`scripts/jobs/common.sh` fixes `GARDEN_PRODUCTION_JOURNAL_REPO` to
`kriscendobot/garden` and **refuses** any other GitHub repository as a
"foreign" origin, so a repointed host must also be given the new name in that
variable; and it lists `kriskowal/garden` as an alias, the name the
repository had before an earlier transfer, whose redirect also resolves
through the name being reused.

The maintainer has since said the prior garden is **already halted** and will
be **archived**. So no host is repointed, and the renamed repository is made
read-only once it is aside. The order still matters, because a host that was
missed or restarted would meet the reused name: **every known prior host is
verified halted before the fresh repository is created**, and the runbook
refuses to go on without that.

## What knows the old URL

Established from the references:

| What | Where it is configured |
| --- | --- |
| `endolin-garden-ece02cb4`, the leader | its checkout's `origin`; `GARDEN_PRODUCTION_JOURNAL_REPO` |
| `oros-studio-garden-ce242c49` | the same, on the Mac |
| `endolin-garden2-5bcdff64` | archived in `hosts/`, still has a deploy record: check it is really off |
| the checkout at `/home/kris/prior-garden` on this machine | `origin` is `git@github.com:kriscendobot/garden.git` |
| the tower's read-only view of the garden | `scripts/garden/attach.sh`, `https://github.com/kriscendobot/garden.git`, expecting `main2` and `journal2` |
| the transcripts repository | separate (`kriscendobot/garden-transcripts`); not renamed, but its captures come from the prior hosts |

## What stays with the renamed repository

Issues, pull requests and their numbers; deploy keys; webhooks; the Pages
site and its settings; Actions settings and secrets; branch protection;
stars and watchers; and any fine-grained token scoped to that repository
(scoped by repository id, so it follows the rename and does **not** grant
access to the new one). Links in old issues and commit messages will resolve
to the *new* repository once the name is reused.

## On the new repository, before any host watches it

Who may push is now the control on every client host
([clients.md](clients.md)): write access and branch protection (at least on
`clients`, `shed` and `main`) are set before a client host starts watching.

## Status

`cutover.sh` is written, dry run by default, and was **not run**: this pass
pushed nothing, added no remote and changed nothing on GitHub. It was
exercised only in its dry-run mode against no network (it prints its plan).

## Open questions

1. **The name for the moved-aside repository.** `garden-prior` is the
   default; not confirmed.
2. **Open work.** Open pull requests and issues stay with the old repository.
   Which are re-filed against the new one?
3. **The tower's view** must be repointed (or pointed at the new layout) by
   the tower's own maintainer-side change; the garden cannot do it.
