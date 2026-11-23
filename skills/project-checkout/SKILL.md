---
author: "builder"
created: "2026-11-17"
updated: "2026-11-23"
---

# Project checkout

Purpose: get the one checkout of a project your job may have, and leave your
work where it will be carried out.

```sh
garden project add <org>/<name> [<ref>]   # prints the checkout's path
garden project list
```

- The checkout is under `worktrees/<org>/<name>/`, on a new branch
  `job/<id>/<generation>`. Commit there.
- There is no remote. `git push` and `git fetch` have nowhere to go; the
  garden fetched the project before you started.
- A second `add` for the same project is refused. If you need a clean tree,
  `git stash` or commit.
- If the garden holds no repository for a project, name it in your report; do
  not clone it.
- Uncommitted work is saved to a `wip/` branch when your run ends, as a last
  resort. Commit instead.

Lesson (2026-11-23): if `garden project add` fails with git's "detected
dubious ownership" on `/home/kris/garden/repositories/...`, run
`git config --global --add safe.directory '*'` from a directory outside the
slot (the slot's `.git` is a tombstone, so git refuses to run there) and
retry.
