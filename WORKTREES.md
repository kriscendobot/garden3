---
author: "steward"
created: "2026-11-17"
updated: "2026-11-17"
---

# Worktrees

Everything the garden checks out on a host lives under one directory.

## On a host the wizard set up

| Path | Is |
| --- | --- |
| `<home>/garden.git` | the one clone, bare; `origin` is the garden's repository |
| `<home>/garden/` | worktree of `shed`: the root, `GARDEN_ROOT` |
| `<home>/garden/main/`, `board/`, `archive/`, `journal/`, `library/`, `clients/`, `gate/` | worktrees of those branches |
| `<home>/garden/plots/<name>/` | worktree of `plot/<name>`, when wanted |

`board`, `archive` and `journal` are fetched at depth 1. The launcher mounts
the root at its own path, and the bare repository with it, so the worktrees
resolve inside the box as they do outside.

(The first instance, built before the wizard existed, is a plain repository
on `shed` with the same worktrees inside it. Both layouts work.)

The branch worktrees are **views for people**. Refresh one with
`git -C <dir> pull --ff-only`. Do not commit in them: services write through
their own clones, and a commit made in a view of a high-churn branch will not
survive that branch's next truncation.

## Ignored, under the root

| Path | Holds |
| --- | --- |
| `.garden-state/clones/<owner>/<branch>` | each writer's shallow clone of the one branch it writes |
| `.garden-state/secrets/` | keys: 0600 files in a 0700 directory |
| `.garden-state/capabilities/`, `harvest/`, `runs/` | the installed record; what jobs left; run logs |
| `repositories/<org>-<name>.git` | one bare repository per upstream project, fetched by the steward only |
| `slots/slotNN/` | a running job's home; razed before and after every job |
| `mail/inbox/`, `mail/outbox/` | mail in transit with the tower |
| `CLIENT-CONSENT.yay` | a client host's owner's consent; never tracked |

A job never gets a worktree of anything above. Its project checkouts are made
inside its own home by `garden project add <org>/<name>`, on a branch
`job/<id>/<generation>`, and are carried out at the end
([designs/slots.md](designs/slots.md)).

Ported from the tower's `WORKTREES.md`.
