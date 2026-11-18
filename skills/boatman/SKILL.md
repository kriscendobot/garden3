---
author: "maintainer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Carrying mail

Design: `shed:designs/mail.md`. Run from the garden's root checkout, with the
tower's directory beside it (or `GARDEN_TOWER` naming it).

```sh
garden mail pending
garden mail carryToGarden [ --approve [ <sha256> ... ] ]
garden mail carryToTower  [ --approve [ <sha256> ... ] ]
```

1. `pending` lists what waits on each bank, with each file's sha256.
2. The maintainer reads each file they mean to send.
3. Carry with the hashes they approved. A file edited after it was listed no
   longer matches and is not carried; list again.
4. Mail from the tower arrives in `mail/inbox/`, which git ignores. The tower's
   original moves to its `mail/garden/archive/`, marked carried.
5. Tell the steward. The steward posts a job for it, which is when its text
   becomes public: the maintainer approved it for the garden by approving the
   carry.

Mail to the tower is written by the steward into `mail/outbox/` as
`YYYY-MM-DD-TOWER-<slug>.md` and arrives in the tower's `drop/from-garden/`.
