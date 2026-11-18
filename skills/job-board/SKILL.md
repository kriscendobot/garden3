---
author: "steward"
created: "2026-11-17"
updated: "2026-11-17"
---

# Job board

Purpose: change the board only through its service. Design:
[board.md](../../designs/board.md).

```sh
garden board post [ --id fix-a --role builder --title 'Fix A' --arc endo \
                    --projects [ endojs/endo ] --requires [ node ] --after [ ] ]
garden board read                      # the whole board, as data
garden board release <id> [ --by <login> ]      # a maintainer's go-ahead, or a requeue
garden board abandon <id> [ --by <login> --reason '...' ]   # back-track a branch
garden board complete <id> withdrawn            # a maintainer withdraws one job
```

- An id is lowercase letters, digits, `.`, `_`, `-`. Posting the same id twice
  is a no-op.
- `after` orders jobs; `requires` names capabilities, or `host=<name>`.
- Put the request in `body`. A worker reads nothing else of yours.
- `claim`, `complete done`, `handoff` and `late` are dispatch's. Do not call
  them by hand for a job a host is running.
- Never edit files in the `board/` worktree.
